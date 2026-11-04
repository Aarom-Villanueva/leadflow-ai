import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../../scripts/autopilot/simulate.mjs';
import { replayFakeAgent, runFakeAgent } from '../../scripts/autopilot/fake-agent.mjs';

const BASE='a'.repeat(40);
const HEAD='b'.repeat(40);
const SPEC='# LF-002a\nSynthetic contract for an offline fake adapter.\n';
function sample() {
  const task={
    id:'LF-002a',owner:'Codex',reviewer:'Claude',status:'queued',
    spec:'docs/specs/LF-002a.md',depends_on:['LF-001a'],required_decisions:['D-001']
  };
  return {
    scenario: {
      backlog: {schema_version:1,execution_enabled:false,tasks:[
        {id:'LF-001a',owner:'ChatGPT',reviewer:'Claude',status:'done',depends_on:[],required_decisions:['D-001'],spec:'docs/specs/LF-001a.md'},
        task
      ]},
      specText:SPEC,
      contract:{schema_version:2,execution_enabled:false,task_id:task.id,
        implementer:'Codex',reviewer:'Claude',spec_path:task.spec,
        base_sha:BASE,contract_sha:digest(SPEC),files:['docs/specs/LF-002a.md'],
        estimated_cost_cents:0,approval_id:'SIM-fake-only',attempt:0,max_attempts:1},
      policy:{base_sha:BASE,reservedFiles:['docs/specs/LF-002a.md'],
        otherReservations:[],approvedDecisions:['D-001'],
        approval_id:'SIM-fake-only',hard_limit_cents:1,max_parallel:1},
      existingLeases:[]
    },
    review:{agent:'Claude',task_id:task.id,approved:true,simulated:true,synthetic_head_sha:HEAD},
    evidence:{simulated:true,task_id:task.id,synthetic_head_sha:HEAD,
      changed_files:['docs/specs/LF-002a.md']}
  };
}
const denied=(input,reason)=>{
  const result=runFakeAgent(input);
  assert.equal(result.result,'denied',JSON.stringify(result));
  assert.equal(result.reason,reason);
  assert.equal(result.execution_enabled,false);
  assert.deepEqual(result.trace,[]);
};
test('synthetic flow ends at fake_ready_for_owner, never done or merged',()=>{
  const result=runFakeAgent(sample());
  assert.equal(result.mode,'simulation-only');
  assert.equal(result.simulated,true);
  assert.equal(result.result,'fake_ready_for_owner');
  assert.deepEqual(result.trace,[
    'synthetic_admission','synthetic_implementation','synthetic_review','fake_ready_for_owner']);
  assert.equal(result.cost_observed_cents,0);
  assert.equal(result.task_id,'LF-002a');
  assert.ok(!Object.hasOwn(result,'merge_sha'));
  assert.ok(!Object.hasOwn(result,'pr_url'));
});
test('deterministic replay key, and explicit replay returns denied',()=>{
  const a=runFakeAgent(sample());
  const b=runFakeAgent(sample());
  assert.equal(a.idempotency_key,b.idempotency_key);
  const duplicate=replayFakeAgent(sample(),[a.idempotency_key]);
  assert.equal(duplicate.result,'denied');
  assert.equal(duplicate.reason,'duplicate_replay');
});
test('invalid replay state fails closed',()=>{
  assert.equal(replayFakeAgent(sample(),['fake']).reason,'invalid_replay_state');
});
test('when backlog or contract enables execution, fake adapter refuses',()=>{
  const a=sample();a.scenario.backlog.execution_enabled=true;denied(a,'execution_must_remain_disabled');
  const b=sample();b.scenario.contract.execution_enabled=true;denied(b,'execution_must_remain_disabled');
});
test('never admits an actual blocked backlog task',()=>{
  const s=sample();s.scenario.backlog.tasks[1].status='blocked';
  const r=runFakeAgent(s);
  assert.equal(r.result,'denied');assert.equal(r.reason,'admission_denied');
  assert.ok(r.admission_reasons.includes('task_not_queued'));
});
test('lack of synthetic approval blocks the fake adapter',()=>{
  const s=sample();s.scenario.contract.approval_id=null;
  const r=runFakeAgent(s);assert.equal(r.reason,'admission_denied');
  assert.ok(r.admission_reasons.includes('missing_simulation_approval'));
});
test('cannot supply tokens, clients, live dispatch or provider config',()=>{
  for(const key of ['credentials','token','api_key','provider','dispatch','workflow']){
    const s=sample();s[key]='unused';
    denied(s,'unsupported_operational_input');
  }
});
test('only distinct synthetic reviewer can review matching task',()=>{
  const a=sample();a.review.agent='Codex';denied(a,'independent_fake_review_required');
  const b=sample();b.review.task_id='LF-999';denied(b,'independent_fake_review_required');
  const c=sample();c.review.simulated=false;denied(c,'independent_fake_review_required');
  const d=sample();d.review.approved=false;denied(d,'independent_fake_review_required');
});
test('fake output must match scoped synthetic delivery',()=>{
  const a=sample();a.evidence.changed_files=['.env'];denied(a,'invalid_synthetic_delivery');
  const b=sample();b.evidence.changed_files=['docs/specs/LF-002a.md','docs/secret.md'];denied(b,'invalid_synthetic_delivery');
  const c=sample();c.evidence.synthetic_head_sha='not-sha';denied(c,'invalid_synthetic_delivery');
  const d=sample();d.evidence.synthetic_head_sha=BASE;denied(d,'invalid_synthetic_delivery');
  const e=sample();e.evidence.simulated=false;denied(e,'invalid_synthetic_delivery');
});
test('re-review of a different synthetic candidate SHA is refused',()=>{
  const s=sample();s.review.synthetic_head_sha='c'.repeat(40);
  denied(s,'reviewed_sha_mismatch');
});
test('invalid or incomplete inputs return a denial instead of a dispatch',()=>{
  denied(null,'invalid_input');
  denied({},'missing_inputs');
  denied([],'invalid_input');
});
test('invalid admission spec hash stops fake flow before producing a trace',()=>{
  const s=sample();s.scenario.contract.contract_sha='0'.repeat(64);
  const out=runFakeAgent(s);
  assert.equal(out.reason,'admission_denied');
  assert.ok(out.admission_reasons.includes('contract_hash_mismatch'));
});
test('changing synthetic candidate SHA changes output key',()=>{
  const s=sample(),a=runFakeAgent(s);
  s.evidence.synthetic_head_sha='c'.repeat(40);
  s.review.synthetic_head_sha='c'.repeat(40);
  assert.notEqual(a.idempotency_key,runFakeAgent(s).idempotency_key);
});
