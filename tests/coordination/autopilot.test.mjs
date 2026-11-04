import test from 'node:test';
import assert from 'node:assert/strict';
import { planAutopilot } from '../../scripts/autopilot/plan.mjs';

const base = () => ({
  schema_version: 1, execution_enabled: false, max_parallel: 2,
  approved_decisions: ['D-001'],
  tasks: [
    {id:'LF-001a',owner:'Codex',reviewer:'Claude',status:'done',depends_on:[],required_decisions:['D-001'],spec:'docs/specs/LF-001a.md'},
    {id:'LF-002a',owner:'Codex',reviewer:'Claude',status:'queued',depends_on:['LF-001a'],required_decisions:['D-001'],spec:'docs/specs/LF-002a.md'},
    {id:'LF-003',owner:'Claude',reviewer:'Codex',status:'queued',depends_on:['LF-001a'],required_decisions:['D-001'],spec:'docs/specs/LF-003.md'}
  ]
});
test('dry run selects at most one task per owner, never dispatches',()=>{
  const p=planAutopilot(base()); assert.equal(p.mode,'dry-run'); assert.deepEqual(p.selected.map(x=>x.id),['LF-002a','LF-003']);
});
test('pending prerequisite blocks dependent task',()=>{
  const b=base();b.tasks[0].status='in_progress';const p=planAutopilot(b);
  assert.equal(p.selected.length,0);assert.equal(p.blocked.length,2);
});
test('missing approval blocks task',()=>{
 const b=base(); b.approved_decisions=[]; const p=planAutopilot(b); assert.equal(p.selected.length,0);assert.deepEqual(p.blocked[0].decisions,['D-001']);
});
test('rejects duplicate task IDs',()=>{const b=base();b.tasks.push({...b.tasks[0]});assert.throws(()=>planAutopilot(b),/Invalid task/)});
test('rejects unknown dependency',()=>{const b=base();b.tasks[1].depends_on=['LF-099'];assert.throws(()=>planAutopilot(b),/Missing dependency/)});
test('rejects circular dependencies',()=>{const b=base();b.tasks[0].depends_on=['LF-002a'];assert.throws(()=>planAutopilot(b),/Cyclic dependency/)});
test('rejects self-review',()=>{const b=base();b.tasks[1].reviewer='Codex';assert.throws(()=>planAutopilot(b),/Invalid task/)});
test('rejects invalid schema and concurrency',()=>{const b=base();b.max_parallel=99;assert.throws(()=>planAutopilot(b),/Invalid backlog/)});
test('read-only output even if configured true',()=>{const b=base();b.execution_enabled=true;assert.equal(planAutopilot(b).mode,'configured-not-dispatched')});
test('limit parallel to one',()=>{const b=base();b.max_parallel=1;assert.equal(planAutopilot(b).selected.length,1)});