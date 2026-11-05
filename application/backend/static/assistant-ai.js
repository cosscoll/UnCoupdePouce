/* Assistant UCP : conversation simple, génération locale sans API facturée. */
(function(root){
'use strict';
function create(hooks){
 let state=null,ui=null;
 const el=hooks.el,button=hooks.button,get=()=>hooks.context();
 const valid=s=>state===s&&s.actor===get().actor&&s.session===get().session;
 function sync(){if(state&&!valid(state)){hooks.local.reset();state=null;ui=null;hooks.close()}}
 function clear(){hooks.local.reset();state=null;ui=null}
 function open(){
  sync();
  const c=get();
  if(!c.actor||!['requester','professional'].includes(c.role))return;
  if(state&&ui&&valid(state)){
   hooks.show(ui);
   if(!state.busy)ui.querySelector('textarea')?.focus();
   return;
  }
  const s={actor:c.actor,session:c.session,role:c.role,messages:[],pending:null,busy:false,consent:false};
  state=s;
  const model=hooks.local.status();
  const isRequester=s.role==='requester';
  ui=el('section',{class:'guided-helper ucp-ai ai-chat',role:'region','aria-label':'Discussion avec l’assistant UCP'});
  const conversation=el('div',{class:'ai-conversation'});
  const log=el('div',{class:'helper-log ai-messages',role:'log','aria-label':'Messages de la conversation','aria-live':'polite','aria-relevant':'additions text'});
  const proposals=el('div',{class:'ai-options'});
  const status=el('p',{class:'ai-status',role:'status','aria-live':'polite'});
  const retry=button('Réessayer de générer la réponse',()=>invoke('reply',null),'ai-retry');
  retry.hidden=true;
  const textarea=el('textarea',{rows:2,maxlength:1200,required:true,'aria-label':'Votre message pour le chatbot IA',
   placeholder:'Écrivez votre message…'});
  const submit=el('button',{class:'ai-send',type:'submit',text:'Envoyer',disabled:true,'aria-label':'Envoyer le message'});
  const form=el('form',{class:'ai-compose-form'},el('div',{class:'ai-input-row'},textarea,submit));
  const acknowledge=el('input',{type:'checkbox',checked:s.consent});
  const agreement=el('label',{class:'ai-consent'},acknowledge,el('span',{text:'Autoriser le téléchargement de l’IA gratuite sur cet appareil'}));
  const draft=button('Préparer mon annonce avec l’IA',()=>invoke('draft'),'ai-action');
  const search=button('Configurer ma recherche avec l’IA',()=>invoke('search'),'ai-action');
  const actions=el('div',{class:'ai-actions'},isRequester?draft:search);
  const newChat=button('Nouvelle conversation',()=>{
   if(!valid(s)||s.busy)return;
   state=null;ui=null;open();
  },'ai-new-chat');
  const headerActions=el('div',{class:'ai-header-actions'},newChat);
  const suggestions=el('div',{class:'ai-suggestions'});
  function prefill(text){
   if(!valid(s)||s.busy)return;
   textarea.value=text;
   textarea.focus();
  }
  if(isRequester){
   suggestions.append(
    button('Rédiger une annonce',()=>prefill('J’ai besoin d’aide pour rédiger une annonce de travaux.'),'ai-suggestion'),
    button('Décrire mes travaux',()=>prefill('Aide-moi à expliquer les travaux que je souhaite réaliser.'),'ai-suggestion'),
    button('Utiliser UCP',()=>prefill('Explique-moi comment fonctionne Un Coup de Pouce pour les particuliers.'),'ai-suggestion')
   );
  }else{
   suggestions.append(
    button('Trouver des chantiers',()=>prefill('Aide-moi à trouver des chantiers adaptés à mon métier et à ma zone.'),'ai-suggestion'),
    button('Affiner ma recherche',()=>prefill('Je voudrais définir des critères pour ma recherche de chantiers.'),'ai-suggestion'),
    button('Utiliser UCP',()=>prefill('Explique-moi comment fonctionne Un Coup de Pouce pour les professionnels.'),'ai-suggestion')
   );
  }
  const welcome=el('div',{class:'ai-welcome'},
   el('span',{class:'ai-avatar','aria-hidden':'true',text:'UCP'}),
   el('h4',{text:'Bonjour !'}),
   el('p',{text:isRequester?'Je peux vous aider à présenter vos travaux et à créer une annonce.':'Je peux vous aider à rechercher des chantiers et à préciser vos critères.'}),
   suggestions);
  const info=el('details',{class:'ai-technical-details'},
   el('summary',{text:'À propos de cette IA'}),
   el('p',{text:'Le modèle fonctionne sur votre appareil avec WebGPU : aucune API IA facturée. Un téléchargement important est nécessaire au premier usage. Les messages ne sont pas envoyés à un service de génération. Pour cette préproduction, utilisez des données fictives.'}));
  const composer=el('div',{class:'ai-composer'},actions,form,agreement,info);
  conversation.append(welcome,log,proposals,status,retry);
  ui.append(headerActions,conversation,composer);
  function scrollBottom(){conversation.scrollTop=conversation.scrollHeight}
  function allowed(){
   const active=!!model.configured&&acknowledge.checked&&!s.busy;
   submit.disabled=!active;
   textarea.disabled=s.busy;
   draft.disabled=!active||!s.messages.some(m=>m.role==='user');
   search.disabled=!active||!s.messages.some(m=>m.role==='user');
   newChat.disabled=s.busy;
   retry.disabled=!active||!s.messages.some(m=>m.role==='user');
   actions.hidden=!s.messages.some(m=>m.role==='user');
  }
  function renderMessage(role,text){
   const message=el('div',{class:'helper-message ai-message '+(role==='user'?'from-user':'from-assistant'),'data-role':role},
    el('strong',{text:role==='user'?'Vous':'Assistant UCP'}),el('p',{text}));
   log.append(message);
   if(log.childElementCount>20)log.firstElementChild.remove();
   scrollBottom();
  }
  function say(role,text){
   s.messages.push({role,text});
   s.messages=s.messages.slice(-20);
   welcome.hidden=true;
   renderMessage(role,text);
   allowed();
  }
  function showPending(){
   proposals.replaceChildren();
   const p=s.pending;
   if(!p)return;
   if(p.draft){
    const d=p.draft;
    proposals.append(el('div',{class:'helper-proposal ai-proposal'},
     el('h4',{text:'Proposition d’annonce'}),
     el('p',{text:'Titre : '+d.title}),
     el('p',{text:d.description}),
     el('p',{text:'Commune : '+d.town}),
     el('p',{text:'Métiers : '+d.trades.join(', ')}),
     el('p',{class:'ai-proposal-note',text:'Relisez ces informations avant de les utiliser. Aucune publication automatique.'})));
    proposals.append(button('Utiliser dans mon annonce',async()=>{
     if(!valid(s)||s.busy)return;
     s.busy=true;allowed();status.textContent='Ouverture du formulaire…';
     try{
      const ok=await hooks.apply(d);
      if(valid(s)){status.textContent=ok?'Proposition transférée dans le formulaire.':'Le transfert n’a pas été effectué.';if(ok){s.pending=null;showPending()}}
     }catch{if(valid(s))status.textContent='Le transfert a échoué. Réessayez.'}
     finally{if(valid(s)){s.busy=false;allowed()}}
    },'ai-confirm'));
   }
   if(p.search){
    const f=p.search;
    const details=[f.q&&'Mots-clés : '+f.q,f.trade&&'Métier : '+f.trade,f.town&&'Commune : '+f.town,
     f.timing&&'Début : '+f.timing,f.budget_from&&'Minimum : '+f.budget_from+' €',f.budget_to&&'Maximum : '+f.budget_to+' €'].filter(Boolean).join(' · ');
    proposals.append(el('div',{class:'helper-proposal ai-proposal'},
     el('h4',{text:'Filtres de recherche proposés'}),el('p',{text:details}),
     el('p',{class:'ai-proposal-note',text:'Confirmez pour ouvrir votre recherche. Aucune candidature automatique.'})));
    proposals.append(button('Appliquer ces filtres',async()=>{
     if(!valid(s)||s.busy)return;
     s.busy=true;allowed();status.textContent='Ouverture de la recherche…';
     try{
      const ok=await hooks.search(f);
      if(valid(s)){status.textContent=ok?'Filtres appliqués.':'Impossible d’ouvrir la recherche.';if(ok){s.pending=null;showPending()}}
     }catch{if(valid(s))status.textContent='La recherche n’a pas pu être ouverte.'}
     finally{if(valid(s)){s.busy=false;allowed()}}
    },'ai-confirm'));
   }
   proposals.append(button('Ignorer la proposition',()=>{
    if(valid(s)&&!s.busy){s.pending=null;showPending();textarea.focus()}
   },'ai-discard'));
   scrollBottom();
  }
  async function invoke(mode,message=null){
   if(!valid(s)||s.busy||!acknowledge.checked||!model.configured)return;
   if(mode==='reply'&&message!==null){
    if(typeof message!=='string'||message.trim().length<2||message.length>1200)return;
    say('user',message.trim());
    textarea.value='';
   }
   if(!s.messages.some(m=>m.role==='user')){
    status.textContent='Décrivez d’abord votre besoin.';return;
   }
   s.busy=true;s.pending=null;retry.hidden=true;showPending();allowed();
   status.classList.add('is-loading');
   status.textContent='L’assistant prépare sa réponse…';
   scrollBottom();
   const messages=s.messages.slice(-12).map(m=>({role:m.role,content:m.text}));
   try{
    const output=await hooks.local.send({mode,role:s.role,catalog:get().catalog,messages,
     onProgress:(label,pct)=>{
      if(valid(s)&&ui?.closest('dialog')?.open){
       const percentage=Number.isFinite(pct)&&pct>0?' ('+Math.min(100,Math.round(pct*100))+' %)':'';
       status.textContent=label+percentage;
       scrollBottom();
      }
     }});
    if(!valid(s)||!ui?.closest('dialog')?.open)return;
    say('assistant',output.reply);
    s.pending={draft:output.draft||null,search:output.search||null};
    showPending();
    status.textContent='';
   }catch(e){
    if(valid(s)&&ui?.closest('dialog')?.open){
     status.textContent=e?.message||'Le modèle local est indisponible. Réessayez.';
     retry.hidden=false;scrollBottom();
    }
   }finally{
    if(valid(s)){s.busy=false;status.classList.remove('is-loading');allowed();if(ui?.closest('dialog')?.open)textarea.focus()}
   }
  }
  form.addEventListener('submit',e=>{e.preventDefault();invoke('reply',textarea.value)});
  textarea.addEventListener('keydown',e=>{
   if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();invoke('reply',textarea.value)}
  });
  acknowledge.addEventListener('change',()=>{s.consent=acknowledge.checked;allowed()});
  hooks.show(ui);
  allowed();
  if(!model.configured)status.textContent=model.reason||'Ce navigateur ne prend pas en charge le modèle local.';
  textarea.focus();
 }
 return {open,sync,clear};
}
root.UCPAssistantAI={create};
if(typeof module==='object'&&module.exports)module.exports={create};
})(typeof window==='object'?window:globalThis);
