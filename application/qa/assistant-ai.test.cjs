const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const assistant=require('../backend/static/assistant-ai.js');

function harness(role='requester',configured=true,answer={reply:'Je vous aide à préparer une demande.',draft:null,search:null}){
 const dom=new JSDOM('<!doctype html><html><body><dialog open></dialog></body></html>');
 const doc=dom.window.document,dialog=doc.querySelector('dialog');
 let actor={id:123,role},session='csrf-demo',applied=null,searched=null,requests=[];
 const el=(tag,attrs={},...children)=>{const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='text')n.textContent=v;else if(k==='class')n.className=v;else if(['disabled','required','checked'].includes(k))n[k]=v;else n.setAttribute(k,v)}for(const child of children.flat(Infinity)){if(child==null)continue;n.append(child.nodeType?child:doc.createTextNode(String(child)))}return n};
 const button=(name,fn,cls='outline')=>{const n=el('button',{type:'button',class:cls,text:name});n.addEventListener('click',fn);return n};
 const ai=assistant.create({
  el,button,context:()=>({actor,session,role,catalog:[],wizardStep:null}),
  show:node=>{dialog.replaceChildren(node);dialog.open=true},close:()=>{dialog.open=false},
  request:async(path,body)=>{requests.push({path,body});return path==='/assistant/status'?{configured}:answer},
  navigate:()=>{},
  apply:async d=>{applied=d;return true},
  search:async s=>{searched=s;return true}
 });
 return {ai,doc,requests,get applied(){return applied},get searched(){return searched},sessionChange(){actor={id:999,role};session='csrf-new';ai.sync()}};
}
const settle=async()=>{await Promise.resolve();await new Promise(resolve=>setImmediate(resolve))};
function findButton(doc,name){return [...doc.querySelectorAll('button')].find(x=>x.textContent===name)}

test('AI assistant sends no request until consent and a typed message',async()=>{
 const d={title:'Rénover la cuisine',description:'Je souhaite refaire la cuisine de mon appartement fictif à Toulouse.',town:'Toulouse',trades:['plomberie'],timing:'month',budget_min:null,budget_max:null,version:0,photos:[]};
 const h=harness('requester',true,{reply:'Je vous propose une annonce adaptée.',draft:d,search:null});h.ai.open();await settle();
 const send=findButton(h.doc,'Envoyer');assert.equal(send.disabled,true);
 h.doc.querySelector('input[type=checkbox]').click();assert.equal(send.disabled,false);
 h.doc.querySelector('textarea').value='Je voudrais rénover la cuisine de mon logement fictif à Toulouse';
 h.doc.querySelector('form').dispatchEvent(new h.doc.defaultView.Event('submit',{bubbles:true,cancelable:true}));await settle();
 assert.deepEqual(h.requests.map(x=>x.path),['/assistant/status','/assistant/chat']);
 assert.equal(h.requests[1].body.message,'Je voudrais rénover la cuisine de mon logement fictif à Toulouse');
 assert.ok(h.doc.body.textContent.includes('Je vous propose une annonce adaptée.'));
 assert.equal(h.applied,null);
 findButton(h.doc,'Utiliser dans mon annonce').click();await settle();
 assert.deepEqual(h.applied,d);
});

test('professional filters must be explicitly confirmed',async()=>{
 const search={q:'rénovation',town:'Toulouse',trade:'plomberie',sort:'newest'};
 const h=harness('professional',true,{reply:'Voici des filtres adaptés.',draft:null,search});h.ai.open();await settle();
 h.doc.querySelector('input[type=checkbox]').click();
 h.doc.querySelector('textarea').value='Je cherche des chantiers de plomberie à Toulouse';
 h.doc.querySelector('form').dispatchEvent(new h.doc.defaultView.Event('submit',{cancelable:true}));await settle();
 assert.equal(h.searched,null);
 findButton(h.doc,'Appliquer ces filtres').click();await settle();
 assert.deepEqual(h.searched,search);
});

test('disabled AI never masquerades as a model answer',async()=>{
 const h=harness('requester',false);h.ai.open();await settle();
 h.doc.querySelector('input[type=checkbox]').click();
 assert.equal(findButton(h.doc,'Envoyer').disabled,true);
 assert.ok(h.doc.body.textContent.includes('Service IA non activé'));
 assert.deepEqual(h.requests.map(x=>x.path),['/assistant/status']);
});
