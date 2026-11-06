/* Client local UCP : WebGPU + Qwen. Les messages ne quittent pas le navigateur. */
(function(root){
'use strict';
const path='/assets/local-ai-worker.js';
let worker=null,nextId=0;
const jobs=new Map();
const CONTACT=/[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|(?<!\d)(?:(?:\+33|0033)[ .-]?[1-9]|0[1-9])(?:[ .-]?\d{2}){4}(?!\d)|\d{1,4}\s*(?:bis|ter)?\s+(?:rue|avenue|boulevard|chemin|route|allee|allée|place)\b/i;
function normalize(value,max=120){return typeof value==='string'?value.trim().slice(0,max):''}
function supported(){
 return typeof Worker==='function'&&!!root.navigator?.gpu&&root.isSecureContext!==false;
}
function status(){
 return {configured:supported(),local:true,model:'Qwen2.5-3B-Instruct (ou 1.5B léger)',
  reason:supported()?'':'Cet appareil ou ce navigateur ne propose pas WebGPU. Essayez Chrome ou Edge à jour sur un ordinateur compatible.'};
}
let workerUnavailable=false,mainModulePromise=null;
function reset(){
 if(worker){worker.terminate();worker=null}
 for(const j of jobs.values())j.reject(Error('La conversation a été interrompue.'));
 jobs.clear();workerUnavailable=false;
 const prior=mainModulePromise;mainModulePromise=null;
 prior?.then(mod=>mod.resetEngine?.()).catch(()=>{});
}
function fallbackError(message,details){
 const e=Error(message);e.fallback=true;
 if(details)e.details=details;
 return e;
}
async function mainThreadInference(payload,onProgress){
 if(!mainModulePromise)mainModulePromise=import('/assets/local-ai-engine.js').catch(e=>{mainModulePromise=null;throw Error('Moteur IA local inaccessible depuis la page : '+(e?.message||e))});
 const module=await mainModulePromise;
 return module.generate(payload,onProgress);
}
function ensureWorker(){
 if(worker)return worker;
 const w=new Worker(path,{type:'module',name:'ucp-free-ai'});
 const onFailure=()=>{
  const error=fallbackError('Le Web Worker du navigateur ne parvient pas à lancer l’IA locale.');
  for(const j of jobs.values())j.reject(error);
  jobs.clear();w.terminate();if(worker===w)worker=null;
 };
 w.onmessage=e=>{
  const msg=e.data||{};
  if(msg.type==='ready')return;
  const job=jobs.get(msg.id);if(!job)return;
  if(msg.type==='progress'){job.progress?.(String(msg.text||'Chargement du modèle…'),msg.progress);return}
  jobs.delete(msg.id);
  if(msg.type==='result')job.resolve({text:msg.text,mode:msg.mode,modelTier:msg.modelTier,downgraded:msg.downgraded===true});
  else if(msg.type==='error'){
   const err=Error(String(msg.error||'Calcul local indisponible.'));
   err.fallback=msg.stage==='import'||/WebGPU non disponible dans ce contexte/.test(err.message);
   job.reject(err);
  }else job.reject(Error('Réponse inattendue du moteur local.'));
 };
 w.onerror=onFailure;
 w.onmessageerror=onFailure;
 worker=w;return w;
}
function parseJSON(text){
 const cleaned=String(text||'').replace(/<think>[\s\S]*?<\/think>/g,'').replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
 try{return JSON.parse(cleaned)}catch{}
 const a=cleaned.indexOf('{'),b=cleaned.lastIndexOf('}');
 if(a>=0&&b>a){try{return JSON.parse(cleaned.slice(a,b+1))}catch{}}
 return null;
}
function validateDraft(payload,catalog){
 if(!payload||typeof payload!=='object')return null;
 const title=normalize(payload.title,120),description=normalize(payload.description,3000),town=normalize(payload.town,90);
 const timing=['flexible','month','quarter','urgent'].includes(payload.timing)?payload.timing:'flexible';
 const allowed=new Set(catalog.filter(t=>t&&t.active!==false).map(t=>t.id));
 const trades=Array.isArray(payload.trades)?[...new Set(payload.trades.filter(x=>typeof x==='string'&&allowed.has(x)))].slice(0,12):[];
 if(trades.includes('inconnu')&&trades.length>1)return null;
 if(!trades.length||title.length<5||description.length<20||town.length<2||CONTACT.test(title)||CONTACT.test(description)||CONTACT.test(town))return null;
 return {title,description,town,trades,timing,budget_min:null,budget_max:null,version:0,photos:[]};
}
function validateSearch(payload,catalog){
 if(!payload||typeof payload!=='object')return null;
 const allowed=new Set(catalog.filter(t=>t&&t.active!==false).map(t=>t.id));
 const q=normalize(payload.q,120),town=normalize(payload.town,90),trade=normalize(payload.trade,61);
 const timing=normalize(payload.timing,20),sort=payload.sort==='oldest'?'oldest':'newest';
 const period=payload.published_within,low=payload.budget_from,high=payload.budget_to;
 if(trade&&!allowed.has(trade)||timing&&!['flexible','month','quarter','urgent'].includes(timing))return null;
 if(!Number.isInteger(period)||![0,1,7,30].includes(period)||![low,high].every(x=>Number.isInteger(x)&&x>=0&&x<=100000000)||low&&high&&low>high)return null;
 if(CONTACT.test(q)||CONTACT.test(town)||!any([q,trade,town,timing,period,low,high]))return null;
 const out={q,town,trade,timing,sort};
 if(period)out.published_within=period;
 if(low)out.budget_from=low;
 if(high)out.budget_to=high;
 return out;
}
function any(values){return values.some(Boolean)}
async function inference(payload,onProgress){
 if(!supported())throw Error(status().reason);
 if(!workerUnavailable){
  try{
   return await new Promise((resolve,reject)=>{
    const id=++nextId;jobs.set(id,{resolve,reject,progress:onProgress});
    try{ensureWorker().postMessage({id,payload})}
    catch(e){jobs.delete(id);reject(fallbackError('Le navigateur refuse d’ouvrir le Worker : '+(e?.message||e)))}
   });
  }catch(e){
   if(!e.fallback)throw e;
   workerUnavailable=true;
   if(worker){worker.terminate();worker=null}
   onProgress?.('Le moteur isolé ne peut pas démarrer. Deuxième méthode locale en cours…',0);
   try{return await mainThreadInference(payload,onProgress)}
   catch(second){
    throw Error('Le modèle IA ne peut pas être chargé sur ce navigateur. Worker : '+e.message+' / Page : '+(second?.message||second));
   }
  }
 }
 return mainThreadInference(payload,onProgress);
}
function cleanContext(role,draft,search,catalog){
 const allowed=new Set(catalog.map(item=>item.id));
 const context={};
 if(role==='requester'&&draft&&typeof draft==='object'){
  context.draft={
   title:normalize(draft.title,120),description:normalize(draft.description,700),town:normalize(draft.town,90),
   trades:Array.isArray(draft.trades)?draft.trades.filter(id=>typeof id==='string'&&allowed.has(id)).slice(0,12):[],
   timing:['flexible','month','quarter','urgent'].includes(draft.timing)?draft.timing:'flexible',
   budget_min:Number.isSafeInteger(draft.budget_min)&&draft.budget_min>=0?draft.budget_min:null,
   budget_max:Number.isSafeInteger(draft.budget_max)&&draft.budget_max>=0?draft.budget_max:null
  };
 }
 if(role==='professional'&&search&&typeof search==='object'){
  const pickNumber=k=>Number.isSafeInteger(search[k])&&search[k]>=0?search[k]:0;
  const trade=normalize(search.trade,61),timing=normalize(search.timing,20);
  context.search={
   q:normalize(search.q,120),town:normalize(search.town,90),
   trade:allowed.has(trade)?trade:'',
   timing:['flexible','month','quarter','urgent'].includes(timing)?timing:'',
   published_within:[1,7,30].includes(search.published_within)?search.published_within:0,
   budget_from:pickNumber('budget_from'),budget_to:pickNumber('budget_to')
  };
 }
 return context;
}
async function send({role,catalog,messages,mode='reply',modelTier='quality',draftContext,searchContext,onProgress}){
 if(!['reply','draft','search'].includes(mode))throw Error('Action inconnue');
 if(mode==='draft'&&role!=='requester'||mode==='search'&&role!=='professional')throw Error('Action réservée à un autre espace');
 const items=Array.isArray(catalog)?catalog.filter(t=>t&&t.active!==false).map(t=>({id:t.id,label:t.label,active:true})):[];
 const history=(Array.isArray(messages)?messages:[]).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string')
   .slice(-9).map(m=>({role:m.role,content:m.content.slice(0,1200)}));
 if(!history.some(m=>m.role==='user'))throw Error('Décrivez votre besoin pour que l’IA prépare une proposition.');
 const context=cleanContext(role,draftContext,searchContext,items);
 const result=await inference({role,catalog:items,messages:history,mode,modelTier,...context},onProgress);
 const meta={modelTier:result.modelTier||modelTier,downgraded:result.downgraded===true};
 if(mode==='reply'){
  // Do not display an empty bubble or internal reasoning markers as a response.
  const visible=String(result.text||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim();
  if(!visible)throw Error('Le modèle n’a pas produit de réponse exploitable. Réessayez ou précisez votre question.');
  return {reply:visible.slice(0,1600),draft:null,search:null,...meta};
 }
 const parsed=parseJSON(result.text);
 if(mode==='draft'){
  const draft=validateDraft(parsed,items);
  if(!draft)throw Error('La proposition est incomplète. Précisez les travaux, le métier et la commune dans le chat, puis réessayez.');
  return {reply:'Voici une proposition rédigée par le modèle local. Relisez-la avant de l’utiliser.',draft,search:null,...meta};
 }
 const search=validateSearch(parsed,items);
 if(!search)throw Error('Je n’ai pas assez de critères fiables. Précisez le métier, la commune ou le budget puis réessayez.');
 return {reply:'Voici les filtres préparés par le modèle local. Vérifiez-les avant de lancer la recherche.',draft:null,search,...meta};
}
const api={status,send,reset,validateDraft,validateSearch,parseJSON,cleanContext};
root.UCPLocalAI=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
