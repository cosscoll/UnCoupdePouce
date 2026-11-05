const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const assistant=require('../backend/static/assistant-ai.js');
function harness(role='requester',configured=true){
 const dom=new JSDOM('<!doctype html><html><body><dialog open></dialog></body></html>');
 const doc=dom.window.document,dialog=doc.querySelector('dialog');
 let actor={id:123,role},session='csrf-demo',applied=null,searched=null,resetCount=0;
 const calls=[];
 const el=(tag,attrs={},...children)=>{const n=doc.createElement(tag);
  for(const[k,v]of Object.entries(attrs)){
   if(k==='text')n.textContent=v;else if(k==='class')n.className=v;
   else if(['disabled','required','checked'].includes(k))n[k]=v;else n.setAttribute(k,v);
  }
  for(const child of children.flat(Infinity)){if(child!=null)n.append(child.nodeType?child:doc.createTextNode(String(child)))}return n;
 };
 const button=(label,fn,cls='outline')=>{const n=el('button',{type:'button',class:cls,text:label});n.addEventListener('click',fn);return n};
 let response={reply:'Je peux vous aider à préciser votre besoin.',draft:null,search:null};
 const local={
  status:()=>({configured,reason:'WebGPU indisponible sur cet appareil.'}),
  send:async payload=>{calls.push(payload);if(response instanceof Error)throw response;return response},
  reset:()=>{resetCount++}
 };
 const ai=assistant.create({el,button,local,
  context:()=>({actor,session,role,catalog:[{id:'plomberie',label:'Plomberie'}],wizardStep:null}),
  show:node=>{dialog.replaceChildren(node);dialog.open=true},close:()=>{dialog.open=false},
  navigate:()=>{},apply:async d=>{applied=d;return true},search:async s=>{searched=s;return true}
 });
 return {ai,doc,calls,local,set response(v){response=v},get applied(){return applied},get searched(){return searched},
  get resets(){return resetCount},sessionChange(){actor={id:999,role};session='csrf-new';ai.sync()}};
}
const settle=async()=>{await Promise.resolve();await new Promise(resolve=>setImmediate(resolve))};
const btn=(doc,label)=>[...doc.querySelectorAll('button')].find(b=>b.textContent===label);
async function say(h,message){
 h.doc.querySelector('textarea').value=message;
 h.doc.querySelector('form').dispatchEvent(new h.doc.defaultView.Event('submit',{bubbles:true,cancelable:true}));
 await settle();
}
test('local AI requires acknowledgement and sends to the on-device model only',async()=>{
 const h=harness();h.ai.open();
 assert.equal(btn(h.doc,'Envoyer').disabled,true);
 h.doc.querySelector('input[type=checkbox]').click();
 assert.equal(btn(h.doc,'Envoyer').disabled,false);
 await say(h,'Je veux rénover ma salle de bains à Toulouse.');
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].mode,'reply');
 assert.equal(h.calls[0].messages.at(-1).content,'Je veux rénover ma salle de bains à Toulouse.');
 assert.match(h.doc.body.textContent,/Je peux vous aider/);
 assert.equal(h.applied,null);
});
test('generated draft must be explicitly transferred after local model output',async()=>{
 const h=harness();h.ai.open();h.doc.querySelector('input[type=checkbox]').click();
 await say(h,'Je veux refaire la plomberie de ma salle de bains à Toulouse.');
 const d={title:'Rénover ma salle de bains',description:'Je souhaite rénover la plomberie dans ma salle de bains.',town:'Toulouse',
  trades:['plomberie'],timing:'flexible',budget_min:null,budget_max:null,version:0,photos:[]};
 h.response={reply:'Voici mon annonce proposée.',draft:d,search:null};
 btn(h.doc,'Préparer mon annonce avec l’IA').click();await settle();
 assert.equal(h.calls[1].mode,'draft');assert.equal(h.applied,null);
 btn(h.doc,'Utiliser dans mon annonce').click();await settle();
 assert.deepEqual(h.applied,d);
});
test('generated search does not apply without confirmation',async()=>{
 const h=harness('professional');h.ai.open();h.doc.querySelector('input[type=checkbox]').click();
 await say(h,'Je veux des chantiers de plomberie à Toulouse.');
 const search={q:'plomberie',trade:'plomberie',town:'Toulouse',sort:'newest'};
 h.response={reply:'Filtres proposés.',search,draft:null};
 btn(h.doc,'Configurer ma recherche avec l’IA').click();await settle();
 assert.equal(h.searched,null);
 btn(h.doc,'Appliquer ces filtres').click();await settle();
 assert.deepEqual(h.searched,search);
});
test('unsupported device never fakes an AI reply',async()=>{
 const h=harness('requester',false);h.ai.open();h.doc.querySelector('input[type=checkbox]').click();
 assert.equal(btn(h.doc,'Envoyer').disabled,true);
 assert.match(h.doc.body.textContent,/WebGPU indisponible/);
 assert.equal(h.calls.length,0);
});
test('session change stops the local AI worker and clears conversation',async()=>{
 const h=harness();h.ai.open();h.sessionChange();
 assert.equal(h.resets,1);
});

test('a failed local model import offers retry without duplicating the user prompt',async()=>{
 const h=harness();h.ai.open();h.doc.querySelector('input[type=checkbox]').click();
 h.response=Error('Chargement CDN refusé');
 await say(h,'Peux-tu m’aider pour une fuite ?');
 const retry=btn(h.doc,'Réessayer de générer la réponse');
 assert.equal(retry.hidden,false);
 assert.match(h.doc.body.textContent,/Chargement CDN refusé/);
 h.response={reply:'Précisez la pièce et la nature de la fuite.',draft:null,search:null};
 retry.click();await settle();
 assert.equal(h.calls.length,2);
 assert.deepEqual(h.calls[0].messages,h.calls[1].messages);
 assert.equal(retry.hidden,true);
 assert.match(h.doc.body.textContent,/Précisez la pièce/);
});
