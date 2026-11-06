const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const assistant=require('../backend/static/assistant-ai.js');
function harness(role='requester',configured=true,sharedStorage=null,extraContext={}){
 const dom=new JSDOM('<!doctype html><html><body><dialog open></dialog></body></html>',{url:'https://ucp.test'});
 const doc=dom.window.document,dialog=doc.querySelector('dialog'),storage=sharedStorage||dom.window.localStorage;
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
 const ai=assistant.create({el,button,local,storage,
  context:()=>({actor,session,role,catalog:[{id:'plomberie',label:'Plomberie'}],wizardStep:null,...extraContext}),
  show:node=>{dialog.replaceChildren(node);dialog.open=true},close:()=>{dialog.open=false},
  navigate:()=>{},apply:async d=>{applied=d;return true},search:async s=>{searched=s;return true}
 });
 return {ai,doc,calls,local,storage,set response(v){response=v},get applied(){return applied},get searched(){return searched},
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
 assert.equal(btn(h.doc,'Envoyer').disabled,true,'empty messages cannot be submitted');
 const compose=h.doc.querySelector('textarea');
 compose.value='Je veux rénover ma salle de bains à Toulouse.';
 compose.dispatchEvent(new h.doc.defaultView.Event('input',{bubbles:true}));
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

test('classic chat shows a welcome state, suggestions and a fixed composer without model requests',()=>{
 const h=harness();h.ai.open();
 assert.ok(h.doc.querySelector('.ai-chat .ai-conversation'));
 assert.ok(h.doc.querySelector('.ai-chat .ai-composer .ai-compose-form'));
 assert.ok(h.doc.querySelector('.ai-chat .ai-messages[role=log]'));
 assert.equal(h.doc.querySelector('.ai-welcome').hidden,false);
 btn(h.doc,'Rédiger une annonce').click();
 assert.match(h.doc.querySelector('textarea').value,/rédiger une annonce/);
 assert.equal(h.calls.length,0,'suggestions only fill the input');
 assert.equal(h.doc.querySelector('details.ai-technical-details').open,false);
});
test('Enter sends and Shift+Enter does not submit the chat message',async()=>{
 const h=harness();h.ai.open();h.doc.querySelector('input[type=checkbox]').click();
 const textarea=h.doc.querySelector('textarea');
 textarea.value='Je veux refaire ma toiture dans ma commune.';
 textarea.dispatchEvent(new h.doc.defaultView.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 await settle();
 assert.equal(h.calls.length,1);
 assert.equal(h.doc.querySelector('.ai-welcome').hidden,true);
 assert.equal(h.doc.querySelectorAll('.ai-message').length,2,'user and local AI response');
 textarea.value='Une autre question';
 textarea.dispatchEvent(new h.doc.defaultView.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));
 await settle();
 assert.equal(h.calls.length,1,'Shift+Enter is a line break');
});
test('closing and reopening the chat keeps messages and consent until a session change',async()=>{
 const h=harness();h.ai.open();h.doc.querySelector('input[type=checkbox]').click();
 await say(h,'Je recherche un artisan pour ma salle de bains.');
 const originalCount=h.doc.querySelectorAll('.ai-message').length;
 h.ai.open();
 assert.equal(h.doc.querySelectorAll('.ai-message').length,originalCount);
 assert.equal(h.doc.querySelector('input[type=checkbox]').checked,true);
 btn(h.doc,'Nouveau chat').click();
 assert.equal(h.doc.querySelector('.ai-welcome').hidden,false);
 assert.equal(h.doc.querySelectorAll('.ai-message').length,0);
 assert.equal(h.doc.querySelector('input[type=checkbox]').checked,true);
});
test('professional assistant starts with trade-search suggestions rather than requester prompts',()=>{
 const h=harness('professional');h.ai.open();
 assert.ok(btn(h.doc,'Trouver des chantiers'));
 assert.ok(btn(h.doc,'Configurer ma recherche avec l’IA'));
 assert.equal(btn(h.doc,'Rédiger une annonce'),undefined);
});

test('model download consent is remembered after a reload of the same browser',async()=>{
 const first=harness();
 first.ai.open();
 assert.equal(first.doc.querySelector('input[type=checkbox]').checked,false);
 assert.equal(first.doc.querySelector('.ai-consent').hidden,false);
 first.doc.querySelector('input[type=checkbox]').click();
 assert.equal(first.doc.querySelector('.ai-consent').hidden,true);
 assert.equal(first.storage.length,1,'only a boolean-style consent flag is stored');
 assert.equal(first.storage.key(0),'ucp.ai.local-model-consent.v1');
 assert.equal(first.storage.getItem('ucp.ai.local-model-consent.v1'),'accepted');
 const second=harness('requester',true,first.storage);
 second.ai.open();
 assert.equal(second.doc.querySelector('input[type=checkbox]').checked,true);
 assert.equal(second.doc.querySelector('.ai-consent').hidden,true);
 assert.equal(btn(second.doc,'Envoyer').disabled,false);
 await say(second,'J’ai besoin d’aide pour des travaux.');
 assert.equal(second.calls.length,1);
 assert.equal(first.storage.length,1,'neither messages nor account IDs are saved');
});
test('one browser authorization works for requester and professional but not another browser',()=>{
 const first=harness();
 first.ai.open();first.doc.querySelector('input[type=checkbox]').click();
 const professional=harness('professional',true,first.storage);
 professional.ai.open();
 assert.equal(professional.doc.querySelector('input[type=checkbox]').checked,true);
 assert.equal(professional.doc.querySelector('.ai-consent').hidden,true);
 const otherDevice=harness('professional');
 otherDevice.ai.open();
 assert.equal(otherDevice.doc.querySelector('input[type=checkbox]').checked,false);
 assert.equal(otherDevice.doc.querySelector('.ai-consent').hidden,false);
});
test('the user can revoke browser authorization in assistant details',()=>{
 const first=harness();
 first.ai.open();first.doc.querySelector('input[type=checkbox]').click();
 btn(first.doc,'Retirer mon autorisation sur ce navigateur').click();
 assert.equal(first.storage.getItem('ucp.ai.local-model-consent.v1'),null);
 assert.equal(first.doc.querySelector('.ai-consent').hidden,false);
 assert.equal(first.doc.querySelector('input[type=checkbox]').checked,false);
 assert.equal(btn(first.doc,'Envoyer').disabled,true);
 const later=harness('requester',true,first.storage);
 later.ai.open();
 assert.equal(later.doc.querySelector('.ai-consent').hidden,false);
});
test('restricted browser storage does not prevent in-session consent',()=>{
 const denied={getItem(){throw Error('storage blocked')},setItem(){throw Error('storage blocked')},removeItem(){throw Error('storage blocked')}};
 const first=harness('requester',true,denied);
 first.ai.open();first.doc.querySelector('input[type=checkbox]').click();
 assert.equal(first.doc.querySelector('.ai-consent').hidden,true);
 btn(first.doc,'Nouveau chat').click();
 assert.equal(first.doc.querySelector('.ai-consent').hidden,true);
 const nextPage=harness('requester',true,denied);
 nextPage.ai.open();
 assert.equal(nextPage.doc.querySelector('.ai-consent').hidden,false);
});

test('simple chat never shows discard proposal when no draft or search was produced',async()=>{
 const h=harness();h.ai.open();h.doc.querySelector('input[type=checkbox]').click();
 await say(h,'Tu peux m’aider à faire quoi ?');
 assert.equal(btn(h.doc,'Ignorer la proposition'),undefined);
 assert.equal(h.doc.querySelector('.ai-options').children.length,0);
});
test('quality mode defaults to a stronger local model and can be switched to light',async()=>{
 const h=harness();h.ai.open();h.doc.querySelector('input[type=checkbox]').click();
 const select=h.doc.querySelector('select.ai-quality-select');
 assert.ok(select,'quality selector lives in collapsed technical details');
 assert.equal(select.value,'quality');
 await say(h,'Comment préparer mon annonce à Toulouse ?');
 assert.equal(h.calls.at(-1).modelTier,'quality');
 select.value='light';
 select.dispatchEvent(new h.doc.defaultView.Event('change',{bubbles:true}));
 assert.equal(h.storage.getItem('ucp.ai.model-quality.v1'),'light');
 assert.equal(h.resets,1,'switch releases the previously loaded model');
 await say(h,'Pour une douche à changer ?');
 assert.equal(h.calls.at(-1).modelTier,'light');
 const next=harness('requester',true,h.storage);next.ai.open();
 assert.equal(next.doc.querySelector('select.ai-quality-select').value,'light');
});

test('assistant uses current requester draft and gives a relevant first action',async()=>{
 const draftContext={title:'Rénover ma salle de bain',description:'Changer la douche et le carrelage',
  town:'Blagnac',trades:['plomberie'],timing:'month'};
 const h=harness('requester',true,null,{draftContext});
 h.ai.open();
 btn(h.doc,'Améliorer mon brouillon').click();
 assert.match(h.doc.querySelector('textarea').value,/brouillon actuel/);
 h.doc.querySelector('input[type=checkbox]').click();
 await say(h,h.doc.querySelector('textarea').value);
 assert.equal(h.calls.length,1);
 assert.deepEqual(h.calls[0].draftContext,draftContext);
 assert.equal(h.calls[0].searchContext,undefined);
});
test('professional search context is forwarded without showing requester suggestions',async()=>{
 const searchContext={q:'plomberie',trade:'plomberie',town:'Toulouse'};
 const h=harness('professional',true,null,{searchContext});
 h.ai.open();
 assert.ok(btn(h.doc,'Affiner mes critères'));
 h.doc.querySelector('input[type=checkbox]').click();
 await say(h,'Affinez ma recherche');
 assert.deepEqual(h.calls[0].searchContext,searchContext);
 assert.equal(h.calls[0].draftContext,undefined);
});
test('if the GPU falls back to light mode, the user is informed and the next message stays light',async()=>{
 const h=harness();h.ai.open();h.doc.querySelector('input[type=checkbox]').click();
 h.response={reply:'Je peux vous accompagner dans votre projet.',draft:null,search:null,modelTier:'light',downgraded:true};
 await say(h,'Bonjour, peux-tu aider pour ma salle de bain ?');
 assert.equal(h.doc.querySelector('select.ai-quality-select').value,'light');
 assert.match(h.doc.body.textContent,/chargé automatiquement/);
 assert.equal(h.storage.getItem('ucp.ai.model-quality.v1'),'light');
 await say(h,'Peux-tu préparer les questions sur la douche ?');
 assert.equal(h.calls.at(-1).modelTier,'light');
});

test('the assistant presents itself as Yahya in the welcome panel and messages',async()=>{
 const h=harness();
 h.ai.open();
 assert.match(h.doc.querySelector('.ai-welcome h4').textContent,/Yahya/);
 assert.match(h.doc.querySelector('.ai-chat').getAttribute('aria-label'),/Yahya/);
 assert.equal(h.doc.querySelector('.ai-avatar').textContent,'Y');
 h.doc.querySelector('input[type=checkbox]').click();
 await say(h,'Comment peux-tu me guider ?');
 const assistantMessage=h.doc.querySelector('.ai-message.from-assistant strong');
 assert.equal(assistantMessage?.textContent,'Yahya');
});

test('Yahya enables Send only for meaningful text, including suggested prompts',async()=>{
 const h=harness();h.ai.open();h.doc.querySelector('input[type=checkbox]').click();
 const input=h.doc.querySelector('textarea'),send=btn(h.doc,'Envoyer');
 assert.equal(send.disabled,true);
 input.value=' ';
 input.dispatchEvent(new h.doc.defaultView.Event('input',{bubbles:true}));
 assert.equal(send.disabled,true);
 input.value='ab';
 input.dispatchEvent(new h.doc.defaultView.Event('input',{bubbles:true}));
 assert.equal(send.disabled,false);
 input.value='';
 input.dispatchEvent(new h.doc.defaultView.Event('input',{bubbles:true}));
 assert.equal(send.disabled,true);
 btn(h.doc,'Rédiger une annonce').click();
 assert.equal(send.disabled,false,'suggestion refreshes Send state');
 await say(h,' ');
 assert.equal(h.calls.length,0,'invalid submission never reaches the model');
 assert.match(h.doc.body.textContent,/au moins deux caractères/);
});
