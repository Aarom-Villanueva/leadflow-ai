import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBacklogDone } from '../../scripts/autopilot/check-done-proof.mjs';
const base='a'.repeat(40), merge='b'.repeat(40), head='c'.repeat(40);
function fixture() {
  const old={schema_version:1,execution_enabled:false,tasks:[
    {id:'LF-001a',owner:'ChatGPT',status:'done'},
    {id:'LF-002a',owner:'Codex',status:'blocked'}
  ]};
  const current=structuredClone(old);
  const record={version:1,tasks:[{id:'LF-001a',state:'completed',owner:'ChatGPT',
    branch:'automation/lf-001a-autopilot',files:['docs/**'],completion:{head_sha:head,merge_sha:merge}}]};
  const fence=String.fromCharCode(96).repeat(3);
  const handoff='## Registro automático de coordinación\n\n'+fence+'json\n'+JSON.stringify(record)+'\n'+fence+'\n';
  const git=(...args)=>{
    if(args[0]==='rev-list')return merge+' '+base+' '+head+'\n';
    if(args[0]==='merge-base')return '';
    if(args[0]==='show')return 'Merge PR #4: LF-001a safe planning';
    throw Error('unexpected git command');
  };
  return {previousBacklog:old,backlog:current,handoff,baseSha:base,git};
}
const denied=(f,regex)=>assert.throws(()=>verifyBacklogDone(f),regex);
test('B6 valid merged done proof succeeds with execution disabled',()=>{
  const v=verifyBacklogDone(fixture());
  assert.deepEqual(v.verified_done,['LF-001a']);
  assert.equal(v.execution_enabled,false);
});
test('B6 rejects a new done state missing from coordination registry',()=>{
  const f=fixture();f.backlog.tasks[1].status='done';
  denied(f,/LF-002a: missing valid completed reservation/);
});
test('B6 rejects completed registry without merge evidence',()=>{
  const f=fixture();f.handoff=f.handoff.replace(merge,'d'.repeat(40));
  denied(f,/merge parent proof rejected/);
});
test('B6 rejects forged merge parent',()=>{
  const f=fixture();f.git=(...args)=>args[0]==='rev-list'?merge+' '+base+' '+'d'.repeat(40)+'\n':'';
  denied(f,/merge parent proof rejected/);
});
test('B6 rejects a merge not reachable from trusted base',()=>{
  const f=fixture();const git=f.git;
  f.git=(...args)=>{if(args[0]==='merge-base')throw Error('not ancestor');return git(...args)};
  denied(f,/merge not verifiable on base/);
});
test('B6 rejects merge of different task',()=>{
  const f=fixture();const git=f.git;
  f.git=(...args)=>args[0]==='show'?'Merge PR: LF-999':git(...args);
  denied(f,/merge subject does not match task/);
});
test('B6 rejects done status reverting or disappearing',()=>{
  const f=fixture();f.backlog.tasks[0].status='blocked';denied(f,/done status regressed/);
  const g=fixture();g.backlog.tasks.shift();denied(g,/task removed from backlog/);
});
test('B6 rejects duplicate IDs, null tasks or enabled backlog',()=>{
  const f=fixture();f.backlog.tasks.push({...f.backlog.tasks[0]});denied(f,/duplicate backlog task/);
  const g=fixture();g.backlog.tasks.push(null);denied(g,/Invalid or duplicate backlog task/);
  const h=fixture();h.backlog.execution_enabled=true;denied(h,/Invalid or enabled backlog/);
});
test('B6 rejects proof absent or completion owned by another actor',()=>{
  const f=fixture();f.handoff=f.handoff.replace('"owner":"ChatGPT"','"owner":"Claude"');
  denied(f,/missing valid completed reservation/);
});
test('B6 rejects missing Git and malformed base SHA',()=>{
  const f=fixture();f.git=undefined;denied(f,/Missing trusted/);
  const g=fixture();g.baseSha='bad';denied(g,/Missing trusted/);
});
