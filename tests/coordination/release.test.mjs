import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifiedMergeReleases, checkCoordination } from '../../scripts/check-coordination.mjs';

const SHA = 'a'.repeat(40);
const task=(state,completion)=>({id:'LF-001', owner:'Codex',branch:'integration/lf-001-foundation',state,files:['docs/HANDOFF.md'],...(completion?{completion}:{})});
test('fake completion fails closed without git merge proof',()=>{
 const previous=[task('active')];const current=[task('completed',{head_sha:SHA,merge_sha:SHA})];
 assert.deepEqual(verifiedMergeReleases({previous,current,base:SHA,git:()=>{throw Error('no git')}}),[]);
});
test('merge proof releases only actually merged task',()=>{
 const dir=mkdtempSync(join(tmpdir(),'autopilot-release-'));
 const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'});
 try {
   git('init','-q');git('config','user.email','test@example.invalid');git('config','user.name','Tester');
   writeFileSync(join(dir,'f'),'base');git('add','.');git('commit','-qm','base');
   git('checkout','-qb','integration/lf-001-foundation');writeFileSync(join(dir,'f'),'lf001');git('commit','-qam','LF-001 commit');const head=git('rev-parse','HEAD').trim();
   git('checkout','-q','master');git('merge','--no-ff','-m','Merge PR #3: complete LF-001',head);const merge=git('rev-parse','HEAD').trim();
   const previous=[task('active')];const current=[task('completed',{head_sha:head,merge_sha:merge})];
   assert.deepEqual(verifiedMergeReleases({previous,current,base:merge,git}),['LF-001']);
   assert.deepEqual(verifiedMergeReleases({previous,current:[task('completed',{head_sha:SHA,merge_sha:merge})],base:merge,git}),[]);
   assert.deepEqual(verifiedMergeReleases({previous,current,base:head,git}),[]);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('unverified previous reservation still prevents conflicting edits',()=>{
 const taskline='| LF-001a Codex | goal | acceptance | docs/HANDOFF.md | risk |';
 const roadmap='| ID / responsable propuesto | Objetivo | Aceptación | Archivos previstos | Riesgo |\n'+taskline;
 const registry=tasks=>'## Registro automático de coordinación\n```json\n'+JSON.stringify({version:1,tasks})+'\n```';
 const current=[task('completed',{head_sha:SHA,merge_sha:SHA}),{id:'LF-001a',owner:'Codex',branch:'automation/lf-001a-autopilot',state:'active',files:['docs/HANDOFF.md']}];
 assert.throws(()=>checkCoordination({files:['docs/HANDOFF.md'],branch:'automation/lf-001a-autopilot',roadmap,handoff:registry(current),baseHandoff:registry([task('active')])}),/reserved by active task/);
 assert.equal(checkCoordination({files:['docs/HANDOFF.md'],branch:'automation/lf-001a-autopilot',roadmap,handoff:registry(current),baseHandoff:registry([task('active')]),releasedTaskIds:['LF-001']}).count,1);
});