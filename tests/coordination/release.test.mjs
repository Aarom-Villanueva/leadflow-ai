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
   const trunk=git('branch','--show-current').trim();git('checkout','-qb','integration/lf-001-foundation');writeFileSync(join(dir,'f'),'lf001');git('commit','-qam','LF-001 commit');const head=git('rev-parse','HEAD').trim();
   git('checkout','-q',trunk);git('merge','--no-ff','-m','Merge PR #3: complete LF-001',head);const merge=git('rev-parse','HEAD').trim();
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

test('GitHub default merge message releases the exact reserved task with real Git proof', async (t) => {
 const dir=mkdtempSync(join(tmpdir(),'lf-default-release-'));
 const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'});
 try {
   git('init','-q');git('config','user.email','test@example.invalid');git('config','user.name','Tester');
   writeFileSync(join(dir,'f'),'base');git('add','.');git('commit','-qm','base');
   const trunk=git('branch','--show-current').trim();
   const before=git('rev-parse','HEAD').trim();
   git('checkout','-qb','integration/lf-001-foundation');
   writeFileSync(join(dir,'f'),'implementation');git('commit','-qam','LF-001 implementation');
   const head=git('rev-parse','HEAD').trim();git('checkout','-q',trunk);
   const subject='Merge pull request #19 from Aarom-Villanueva/integration/lf-001-foundation';
   const validMessage=subject+'\n\nLF-001: foundation';
   git('merge','--no-ff','-m',validMessage,head);
   let merge=git('rev-parse','HEAD').trim();
   const verify=(overrides={})=>verifiedMergeReleases({previous:[task('active')],current:[task('completed',{head_sha:head,merge_sha:merge})],base:merge,git,...overrides});
   const changeMessage=(message)=>{git('commit','--amend','-qm',message);merge=git('rev-parse','HEAD').trim();};

   await t.test('accepts the default subject plus exact task title',()=>{
     assert.deepEqual(verify(),['LF-001']);
   });
   for (const type of ['feat','fix']) await t.test(`accepts the exact ${type}(task) title without changing Git proof`,()=>{
     changeMessage(subject+`\n\n${type}(LF-001): foundation`);
     assert.deepEqual(verify(),['LF-001']);
     assert.deepEqual(verify({current:[task('completed',{head_sha:before,merge_sha:merge})]}),[]);
     assert.deepEqual(verify({base:head}),[]);
   });
   await t.test('rejects near-miss conventional task titles and later mentions',()=>{
     for(const title of ['feat(LF-001a): other','fix(LF-001-extra): other','feat(ui): LF-001: other','feat(LF-001):missing space','fix(LF-001)!: breaking','docs(LF-001): unsupported','Other title\n\nfeat(LF-001): later']) {
       changeMessage(subject+'\n\n'+title);assert.deepEqual(verify(),[]);
     }
     changeMessage(validMessage);
   });
   await t.test('still rejects a false merged head',()=>{
     assert.deepEqual(verify({current:[task('completed',{head_sha:before,merge_sha:merge})]}),[]);
   });
   await t.test('still rejects a merge absent from the trusted base',()=>{
     assert.deepEqual(verify({base:head}),[]);
   });
   await t.test('still rejects a changed reservation owner or branch',()=>{
     const completed=task('completed',{head_sha:head,merge_sha:merge});
     for(const changed of [{...completed,owner:'Other'},{...completed,branch:'other/branch'}]) {
       assert.deepEqual(verify({current:[changed]}),[]);
     }
   });
   await t.test('rejects a different or suffix-extended branch',()=>{
     for(const branch of ['other/branch','integration/lf-001-foundation-extra']) {
       changeMessage(`Merge pull request #19 from Aarom-Villanueva/${branch}\n\nLF-001: foundation`);
       assert.deepEqual(verify(),[]);
     }
   });
   await t.test('rejects a task mention anywhere except the exact first title',()=>{
     for(const body of ['Other title\n\nLF-001: mentioned later','Foundation related to LF-001','LF-001a: different task','LF-001']) {
       changeMessage(subject+'\n\n'+body);assert.deepEqual(verify(),[]);
     }
   });
   await t.test('rejects arbitrary subjects even if the body starts with the task',()=>{
     changeMessage('Integrate unrelated work\n\nLF-001: foundation');assert.deepEqual(verify(),[]);
   });
   await t.test('rejects missing title and malformed PR number',()=>{
     for(const message of [subject,subject.replace('#19','#0')+'\n\nLF-001: foundation']) {
       changeMessage(message);assert.deepEqual(verify(),[]);
     }
   });
   await t.test('accepts a genuine default message after all negative controls',()=>{
     changeMessage(validMessage);assert.deepEqual(verify(),['LF-001']);
   });
 } finally {rmSync(dir,{recursive:true,force:true});}
});
