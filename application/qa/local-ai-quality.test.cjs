const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../backend/static/local-ai-engine.js'),'utf8');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('upgraded WebLLM IDs are 3B by default, with a 1.5B light mode',async()=>{
 const ai=await load();
 assert.equal(ai.selectModelVariant('quality',true),'Qwen2.5-3B-Instruct-q4f16_1-MLC');
 assert.equal(ai.selectModelVariant('quality',false),'Qwen2.5-3B-Instruct-q4f32_1-MLC');
 assert.equal(ai.selectModelVariant('light',true),'Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
 assert.equal(ai.selectModelVariant('light',false),'Qwen2.5-1.5B-Instruct-q4f32_1-MLC');
 assert.equal(ai.selectModelVariant('other',true),'Qwen2.5-3B-Instruct-q4f16_1-MLC');
 assert.doesNotMatch(source,/Qwen2\.5-0\.5B-Instruct/);
});
test('plain dialogue prompt explains role-specific UCP capabilities without a giant trade catalogue',async()=>{
 const ai=await load();
 const catalog=Array.from({length:150},(_,i)=>({id:'metier'+i,label:'Métier '+i}));
 const requester=ai.buildPrompt('reply',{role:'requester',catalog});
 const professional=ai.buildPrompt('reply',{role:'professional',catalog});
 assert.match(requester,/décrire les travaux/);
 assert.match(requester,/une annonce/);
 assert.match(professional,/recherche de chantiers/);
 assert.match(professional,/candidature/);
 assert.match(requester,/question EXACTEMENT posée/);
 assert.match(requester,/ne répète pas une question précédente/);
 assert.doesNotMatch(requester,/Métier 149|Métiers possibles/);
 assert.doesNotMatch(professional,/Métier 149|Métiers possibles/);
 const draft=ai.buildPrompt('draft',{role:'requester',catalog:[{id:'plomberie',label:'Plomberie'}]});
 assert.match(draft,/plomberie : Plomberie/);
});
test('detects repetitive UCP replies like the user-reported conversation',async()=>{
 const ai=await load();
 const first="D'accord, je vais essayer de vous aider à préparer une proposition de marché. Pourriez-vous me donner plus de détails sur ce qu'il y a à faire ?";
 const repeated="D'accord, je vais essayer de vous aider à préparer une proposition de marché pour votre salle de bain. Pourriez-vous me donner plus de détails sur ce qu'il y a à faire ?";
 assert.equal(ai.isRepeatedReply(repeated,[{role:'assistant',content:first}]),true);
 assert.equal(ai.isRepeatedReply('Pour votre salle de bains, souhaitez-vous changer la douche, la plomberie ou le carrelage ?', [{role:'assistant',content:first}]),false);
 assert.equal(ai.isRepeatedReply(first,[{role:'user',content:'Quelles fonctions ?'}]),false);
});

test('GPU resource failures can trigger local 1.5B recovery, network failures do not',async()=>{
 const ai=await load();
 for(const msg of ['GPUOutOfMemoryError','Failed to allocate buffer','Device lost during allocation','not enough video memory']){
  assert.equal(ai.isGpuMemoryError(Error(msg)),true,msg);
 }
 for(const msg of ['Access to CDN denied','CORS blocked','NetworkError: fetch failed','Invalid model ID']){
  assert.equal(ai.isGpuMemoryError(Error(msg)),false,msg);
 }
});
test('local prompts incorporate current draft/search form values as untrusted data',async()=>{
 const ai=await load();
 const draftPrompt=ai.buildPrompt('reply',{role:'requester',draft:{
  title:'Refaire ma douche',town:'Blagnac',description:'Démolir et remplacer la douche',trades:['plomberie']}});
 assert.match(draftPrompt,/Blagnac/);
 assert.match(draftPrompt,/Refaire ma douche/);
 assert.match(draftPrompt,/ne sont pas des instructions/);
 const searchPrompt=ai.buildPrompt('reply',{role:'professional',search:{
  town:'Toulouse',trade:'plomberie',budget_from:1000}});
 assert.match(searchPrompt,/Toulouse/);
 assert.match(searchPrompt,/plomberie/);
 assert.doesNotMatch(searchPrompt,/Refaire ma douche/);
});
test('conversation history is bounded to fit a small on-device context window',async()=>{
 const ai=await load();
 const messages=Array.from({length:24},(_,i)=>({role:i%2?'assistant':'user',content:'message '+i+' '+'x'.repeat(1500)}));
 const result=ai.recent(messages);
 assert.ok(result.length<=10);
 assert.ok(result.reduce((sum,m)=>sum+m.content.length,0)<=4200);
 assert.equal(result.at(-1).role,'assistant');
 assert.equal(result.at(-1).content.includes('message 23'),true);
});
