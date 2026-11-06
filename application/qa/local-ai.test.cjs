const {test}=require('node:test');
const assert=require('node:assert/strict');
const ai=require('../backend/static/local-ai.js');
const trades=[{id:'plomberie',label:'Plomberie',active:true},{id:'inconnu',label:'Je ne sais pas',active:true}];
const draft={title:'Rénover ma salle de bains',description:'Je souhaite changer ma douche et réparer une fuite.',
 town:'Toulouse',trades:['plomberie'],timing:'month'};
const search={q:'rénovation',trade:'plomberie',town:'Toulouse',timing:'month',
 published_within:7,budget_from:500,budget_to:4000,sort:'newest'};
test('draft from local LLM is validated against live trades and blocks contact info',()=>{
 assert.equal(ai.validateDraft(draft,trades).title,draft.title);
 assert.equal(ai.validateDraft({...draft,town:'24 rue des Fleurs'},trades),null);
 assert.equal(ai.validateDraft({...draft,description:'Appelez au 06 11 22 33 44 pour un devis'},trades),null);
 assert.equal(ai.validateDraft({...draft,trades:['autre-inconnu']},trades),null);
 assert.equal(ai.validateDraft({...draft,trades:['inconnu','plomberie']},trades),null);
 assert.equal(ai.validateDraft({...draft,description:'Non'},trades),null);
});
test('search from local model is validated and does not execute anything',()=>{
 assert.deepEqual(ai.validateSearch(search,trades),search);
 assert.equal(ai.validateSearch({...search,trade:'inconnu-metier'},trades),null);
 assert.equal(ai.validateSearch({...search,budget_from:5000,budget_to:1000},trades),null);
 assert.equal(ai.validateSearch({...search,town:'13 rue du Test'},trades),null);
 assert.equal(ai.validateSearch({...search,published_within:10},trades),null);
});
test('JSON parser handles fenced model responses without treating them as HTML',()=>{
 assert.deepEqual(ai.parseJSON('```json\n{"title":"Exemple"}\n```'),{title:'Exemple'});
 assert.equal(ai.parseJSON('Ceci est une réponse sans JSON.'),null);
});

test('worker bootstrap failure attempts in-page local engine, never an API call',async()=>{
 const originalWorker=global.Worker,originalNavigator=global.navigator,originalSecure=global.isSecureContext;
 let constructed=0;
 class BrokenWorker{
  constructor(){constructed++;setImmediate(()=>this.onerror?.({message:'Unable to load module worker'}))}
  postMessage(){}
  terminate(){}
 }
 try{
  Object.defineProperty(global,'Worker',{configurable:true,value:BrokenWorker});
  Object.defineProperty(global,'navigator',{configurable:true,value:{gpu:{}}});
  Object.defineProperty(global,'isSecureContext',{configurable:true,value:true});
  await assert.rejects(
   ai.send({role:'requester',catalog:trades,messages:[{role:'user',content:'Je souhaite refaire mon évier.'}]}),
   /Worker : .*Web Worker.*Page : .*Moteur IA local inaccessible/);
  assert.equal(constructed,1);
 }finally{
  ai.reset();
  for(const[k,v]of [['Worker',originalWorker],['navigator',originalNavigator],['isSecureContext',originalSecure]]){
   if(v===undefined)delete global[k];else Object.defineProperty(global,k,{configurable:true,value:v});
  }
 }
});

test('missing Worker does not falsely disable a WebGPU-capable on-device chatbot',async()=>{
 const originalWorker=global.Worker,originalNavigator=global.navigator,originalSecure=global.isSecureContext;
 try{
  Object.defineProperty(global,'Worker',{configurable:true,value:undefined});
  Object.defineProperty(global,'navigator',{configurable:true,value:{gpu:{}}});
  Object.defineProperty(global,'isSecureContext',{configurable:true,value:true});
  assert.equal(ai.status().configured,true,'the page can use local WebGPU even without module Workers');
  await assert.rejects(ai.send({role:'requester',catalog:trades,
   messages:[{role:'user',content:'Aide-moi à décrire ma salle de bains.'}]}),
   /Moteur IA local inaccessible depuis la page/,'node cannot load the browser engine, proving that the in-page fallback path was attempted');
  Object.defineProperty(global,'isSecureContext',{configurable:true,value:false});
  assert.equal(ai.status().configured,false,'insecure contexts never start the local model');
 }finally{
  ai.reset();
  for(const[k,v]of [['Worker',originalWorker],['navigator',originalNavigator],['isSecureContext',originalSecure]]){
   if(v===undefined)delete global[k];else Object.defineProperty(global,k,{configurable:true,value:v});
  }
 }
});

test('current wizard draft is sanitized and passed only for a requester',()=>{
 const entered={title:'Salle de bain',description:'Changer la douche',town:'Blagnac',
  trades:['plomberie','inconnu-metier'],timing:'quarter',budget_min:1000,budget_max:4000,
  photos:['sensitive-photo'],id:'secret-id',version:2};
 const c=ai.cleanContext('requester',entered,null,trades);
 assert.equal(c.draft.title,'Salle de bain');
 assert.deepEqual(c.draft.trades,['plomberie']);
 assert.equal(c.draft.budget_min,1000);
 assert.equal(c.draft.photos,undefined);
 assert.equal(c.draft.id,undefined);
 assert.equal(c.search,undefined);
 const other=ai.cleanContext('professional',entered,null,trades);
 assert.equal(other.draft,undefined,'professional context must not include a requester draft');
});
test('only a professional can send sanitized current filters to the model',()=>{
 const saved={q:'réparation',trade:'plomberie',town:'Toulouse',timing:'month',
  published_within:7,budget_from:1500,budget_to:3000,
  owner:123,confidential:'do not send'};
 const c=ai.cleanContext('professional',null,saved,trades);
 assert.equal(c.search.q,'réparation');
 assert.equal(c.search.town,'Toulouse');
 assert.equal(c.search.owner,undefined);
 assert.equal(c.search.confidential,undefined);
 assert.equal(ai.cleanContext('requester',null,saved,trades).search,undefined);
 assert.equal(ai.cleanContext('professional',null,{...saved,trade:'unknown'},trades).search.trade,'');
});

test('local chat strips model reasoning and rejects empty visible replies',async()=>{
 const originalWorker=global.Worker,originalNavigator=global.navigator,originalSecure=global.isSecureContext;
 let reply='<think>internal reasoning</think>Réponse utile pour le chantier.';
 class MockWorker{
  postMessage({id}){setImmediate(()=>this.onmessage?.({data:{id,type:'result',text:reply,modelTier:'light'}}))}
  terminate(){}
 }
 try{
  Object.defineProperty(global,'Worker',{configurable:true,value:MockWorker});
  Object.defineProperty(global,'navigator',{configurable:true,value:{gpu:{}}});
  Object.defineProperty(global,'isSecureContext',{configurable:true,value:true});
  const request={role:'requester',catalog:trades,messages:[{role:'user',content:'Comment décrire mon chantier ?'}]};
  assert.equal((await ai.send(request)).reply,'Réponse utile pour le chantier.');
  reply='<think>aucune réponse finale</think>';
  await assert.rejects(ai.send(request),/pas produit de réponse exploitable/);
 }finally{
  ai.reset();
  for(const[k,v]of [['Worker',originalWorker],['navigator',originalNavigator],['isSecureContext',originalSecure]]){
   if(v===undefined)delete global[k];else Object.defineProperty(global,k,{configurable:true,value:v});
  }
 }
});
