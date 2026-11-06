/* Yahya, assistant UCP : conversation simple, génération locale sans API facturée. */
(function(root){
'use strict';
function create(hooks){
 const CONSENT_KEY='ucp.ai.local-model-consent.v1';
 const MODEL_KEY='ucp.ai.model-quality.v1';
 function savedModelTier(){
  try{return consentStore()?.getItem(MODEL_KEY)==='light'?'light':'quality'}catch{return 'quality'}
 }
 function saveModelTier(tier){
  try{consentStore()?.setItem(MODEL_KEY,tier)}catch{}
 }
 let state=null,ui=null,localConsent=false;
 function consentStore(){try{return hooks.storage||root.localStorage}catch{return null}}
 function readConsent(){try{return consentStore()?.getItem(CONSENT_KEY)==='accepted'}catch{return false}}
 function persistConsent(value){
  try{
   if(value)consentStore()?.setItem(CONSENT_KEY,'accepted');
   else consentStore()?.removeItem(CONSENT_KEY);
  }catch{/* Storage unavailable: consent will last only for the current page. */}
 }
 const el=hooks.el,button=hooks.button,get=()=>hooks.context();
 const valid=s=>state===s&&s.actor===get().actor&&s.session===get().session;
 function sync(){if(state&&!valid(state)){hooks.local.reset();state=null;ui=null;localConsent=readConsent();hooks.close()}}
 function clear(){hooks.local.reset();state=null;ui=null;localConsent=readConsent()}
 function open(){
  sync();
  const c=get();
  if(!c.actor||!['requester','professional'].includes(c.role))return;
  if(state&&ui&&valid(state)){
   hooks.show(ui);
   if(!state.busy)ui.querySelector('textarea')?.focus();
   return;
  }
  localConsent=localConsent||readConsent();
  const s={actor:c.actor,session:c.session,role:c.role,messages:[],pending:null,busy:false,consent:localConsent};
  state=s;
  const model=hooks.local.status();
  let modelTier=savedModelTier();
  const isRequester=s.role==='requester';
  ui=el('section',{class:'guided-helper ucp-ai ai-chat',role:'region','aria-label':'Discussion avec Yahya, l’assistant UCP'});
  const conversation=el('div',{class:'ai-conversation'});
  const log=el('div',{class:'helper-log ai-messages',role:'log','aria-label':'Messages de la conversation','aria-live':'polite','aria-relevant':'additions text'});
  const proposals=el('div',{class:'ai-options'});
  const status=el('p',{class:'ai-status',role:'status','aria-live':'polite'});
  const retry=button('Réessayer de générer la réponse',()=>invoke('reply',null),'ai-retry');
  retry.hidden=true;
  const lightRecovery=button('Essayer le modèle léger (1,5B)',()=>{
   if(!valid(s)||s.busy||!s.consent||modelTier!=='quality')return;
   modelTier='light';
   qualitySelect.value='light';
   saveModelTier('light');
   hooks.local.reset();
   lightRecovery.hidden=true;
   status.textContent='Nouvel essai avec le modèle léger : chargement local en cours…';
   invoke('reply',null);
  },'ai-light-recovery');
  lightRecovery.hidden=true;
  const textarea=el('textarea',{rows:2,maxlength:1200,required:true,'aria-label':'Votre message pour le chatbot IA',
   placeholder:'Écrivez votre message…'});
  const submit=el('button',{class:'ai-send',type:'submit',text:'Envoyer',disabled:true,'aria-label':'Envoyer le message'});
  const form=el('form',{class:'ai-compose-form'},el('div',{class:'ai-input-row'},textarea,submit));
  const acknowledge=el('input',{type:'checkbox',checked:s.consent});
  const agreement=el('label',{class:'ai-consent'},acknowledge,el('span',{text:'J’autorise le téléchargement du modèle IA gratuit dans ce navigateur (une seule fois).'}));
  agreement.hidden=s.consent||!model.configured;
  const draft=button('Préparer mon annonce avec l’IA',()=>invoke('draft'),'ai-action');
  const search=button('Configurer ma recherche avec l’IA',()=>invoke('search'),'ai-action');
  const actions=el('div',{class:'ai-actions'},isRequester?draft:search);
  const newChat=button('Nouveau chat',()=>{
   if(!valid(s)||s.busy)return;
   state=null;ui=null;open();
  },'ai-new-chat');
  newChat.hidden=!model.configured;
  const headerActions=el('div',{class:'ai-header-actions'},newChat);
  const suggestions=el('div',{class:'ai-suggestions'});
  function prefill(text){
   if(!valid(s)||s.busy)return;
   textarea.value=text;
   allowed();
   textarea.focus();
  }
  const workingDraft=isRequester&&c.draftContext&&(c.draftContext.title||c.draftContext.description||c.draftContext.trades?.length);
  const workingSearch=!isRequester&&c.searchContext&&Object.values(c.searchContext).some(Boolean);
  if(workingDraft){
   suggestions.append(button('Améliorer mon brouillon',()=>prefill('Aide-moi à améliorer mon brouillon actuel en réutilisant les informations déjà saisies et pose-moi une seule question utile.'),'ai-suggestion'));
  }
  if(workingSearch){
   suggestions.append(button('Affiner mes critères',()=>prefill('Aide-moi à affiner les filtres de recherche déjà sélectionnés dans mon espace professionnel.'),'ai-suggestion'));
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
  suggestions.hidden=!model.configured;
  const welcome=el('div',{class:'ai-welcome'},
   el('span',{class:'ai-avatar','aria-hidden':'true',text:'Y'}),
   el('h4',{text:'Bonjour, je suis Yahya.'}),
   el('p',{text:isRequester?'Je peux vous aider à présenter vos travaux et à créer une annonce.':'Je peux vous aider à rechercher des chantiers et à préciser vos critères.'}),
   suggestions);
  const revoke=button('Retirer mon autorisation sur ce navigateur',()=>{
   if(!valid(s)||s.busy)return;
   s.consent=false;localConsent=false;acknowledge.checked=false;
   persistConsent(false);agreement.hidden=false;revoke.hidden=true;allowed();
  },'ai-revoke');
  revoke.hidden=!s.consent;
  const qualitySelect=el('select',{class:'ai-quality-select','aria-label':'Qualité du modèle IA'},
   el('option',{value:'quality',text:'Qualité élevée · Qwen 3B (GPU ~2,5–2,9 Go)'}),
   el('option',{value:'light',text:'Mode léger · Qwen 1,5B (GPU ~1,6–1,9 Go)'}));
  qualitySelect.value=modelTier;
  qualitySelect.addEventListener('change',()=>{
   if(!valid(s)||s.busy){qualitySelect.value=modelTier;return}
   modelTier=qualitySelect.value==='light'?'light':'quality';
   saveModelTier(modelTier);
   hooks.local.reset();
   status.textContent='Modèle '+(modelTier==='quality'?'qualité élevée':'léger')+' sélectionné. Le prochain message chargera ce modèle.';
  });
  const qualitySetting=el('label',{class:'ai-quality-setting'},el('span',{text:'Qualité des réponses'}),qualitySelect);
  const info=el('details',{class:'ai-technical-details'},
   el('summary',{text:'À propos de cette IA'}),
   el('p',{text:'Qwen 3B offre des réponses généralement plus pertinentes que l’ancien modèle 0,5B, mais nécessite davantage de mémoire et un téléchargement initial important. Si votre appareil ne le charge pas, passez en mode léger (1,5B). L’IA fonctionne sur votre GPU avec WebGPU, sans API payante. Les messages ne quittent pas votre appareil. L’autorisation est conservée dans le navigateur, sauf navigation privée ou effacement des données. Utilisez des informations fictives en préproduction.'}),qualitySetting,revoke);
  form.hidden=!model.configured;
  const composer=el('div',{class:'ai-composer'},actions,form,agreement,info);
  const unavailable=el('section',{class:'ai-unavailable',role:'region','aria-label':'Utiliser UCP sans modèle IA'},
   el('h4',{text:'Continuer sans l’IA'}),
   el('p',{text:'Votre navigateur ne peut pas exécuter le modèle local. Ces raccourcis ouvrent les fonctions habituelles d’UCP ; ils ne génèrent aucune réponse IA.'}),
   el('div',{class:'ai-unavailable-links'},
    ...(isRequester
     ?[['Décrire mes travaux','projects'],['Voir mes messages','conversations'],['Contacter l’assistance','support']]
     :[['Chercher des chantiers','projects'],['Suivre mes candidatures','applications'],['Contacter l’assistance','support']]
    ).map(([label,view])=>button(label,()=>{if(valid(s))hooks.navigate?.(view)},'outline'))));
  unavailable.hidden=!!model.configured;
  conversation.append(welcome,unavailable,log,proposals,status,retry,lightRecovery);
  ui.append(headerActions,conversation,composer);
  function scrollBottom(){conversation.scrollTop=conversation.scrollHeight}
  function allowed(){
   const active=!!model.configured&&acknowledge.checked&&!s.busy;
   submit.disabled=!active||textarea.value.trim().length<2||textarea.value.length>1200;
   textarea.disabled=s.busy||!model.configured;
   draft.disabled=!active||!s.messages.some(m=>m.role==='user');
   search.disabled=!active||!s.messages.some(m=>m.role==='user');
   newChat.disabled=s.busy;
   retry.disabled=!active||!s.messages.some(m=>m.role==='user');
   actions.hidden=!s.messages.some(m=>m.role==='user');
  }
  function renderMessage(role,text){
   const message=el('div',{class:'helper-message ai-message '+(role==='user'?'from-user':'from-assistant'),'data-role':role},
    el('strong',{text:role==='user'?'Vous':'Yahya'}),el('p',{text}));
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
   if(!p||(p.draft==null&&p.search==null))return;
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
    if(typeof message!=='string'||message.trim().length<2||message.length>1200){
     status.textContent='Écrivez un message d’au moins deux caractères (1 200 maximum).';return;
    }
    say('user',message.trim());
    textarea.value='';
    allowed();
   }
   if(!s.messages.some(m=>m.role==='user')){
    status.textContent='Décrivez d’abord votre besoin.';return;
   }
   s.busy=true;s.pending=null;retry.hidden=true;lightRecovery.hidden=true;showPending();allowed();
   status.classList.add('is-loading');
   status.textContent='L’assistant prépare sa réponse…';
   scrollBottom();
   const messages=s.messages.slice(-12).map(m=>({role:m.role,content:m.text}));
   try{
    const appContext=get();
    const output=await hooks.local.send({mode,role:s.role,catalog:appContext.catalog,messages,modelTier,
     draftContext:appContext.draftContext,searchContext:appContext.searchContext,
     onProgress:(label,pct)=>{
      if(valid(s)&&ui?.closest('dialog')?.open){
       const percentage=Number.isFinite(pct)&&pct>0?' ('+Math.min(100,Math.round(pct*100))+' %)':'';
       status.textContent=label+percentage;
       scrollBottom();
      }
     }});
    if(!valid(s)||!ui?.closest('dialog')?.open)return;
    say('assistant',output.reply);
    s.pending=output.draft||output.search?{draft:output.draft||null,search:output.search||null}:null;
    showPending();
    if(output.downgraded){
     modelTier='light';qualitySelect.value='light';saveModelTier('light');
     status.textContent='Le modèle léger (1,5B) a été chargé automatiquement : votre appareil manquait de mémoire pour le modèle 3B.';
    }else status.textContent='';
   }catch(e){
    if(valid(s)&&ui?.closest('dialog')?.open){
     status.textContent=(e?.message||'Le modèle local est indisponible. Réessayez.')+
      (modelTier==='quality'?' Si le modèle ne démarre pas, essayez le mode léger dans « À propos de cette IA ».':'');
     retry.hidden=false;
     lightRecovery.hidden=modelTier!=='quality';
     scrollBottom();
    }
   }finally{
    if(valid(s)){s.busy=false;status.classList.remove('is-loading');allowed();if(ui?.closest('dialog')?.open)textarea.focus()}
   }
  }
  textarea.addEventListener('input',allowed);
  form.addEventListener('submit',e=>{e.preventDefault();invoke('reply',textarea.value)});
  textarea.addEventListener('keydown',e=>{
   if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();invoke('reply',textarea.value)}
  });
  acknowledge.addEventListener('change',()=>{
   s.consent=acknowledge.checked;localConsent=s.consent;
   persistConsent(s.consent);
   agreement.hidden=s.consent;
   revoke.hidden=!s.consent;
   allowed();
  });
  hooks.show(ui);
  allowed();
  if(!model.configured)status.textContent=model.reason||'Ce navigateur ne prend pas en charge le modèle local.';
  if(model.configured)textarea.focus();
 }
 return {open,sync,clear};
}
root.UCPAssistantAI={create};
if(typeof module==='object'&&module.exports)module.exports={create};
})(typeof window==='object'?window:globalThis);
