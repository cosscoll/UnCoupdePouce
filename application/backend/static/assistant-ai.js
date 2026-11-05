/* Assistant IA UCP gratuit : génération dans le navigateur, aucun service d'inférence facturé. */
(function(root){
'use strict';
function create(hooks){
 let state=null,ui=null;
 const el=hooks.el,button=hooks.button,get=()=>hooks.context();
 const valid=s=>state===s&&s.actor===get().actor&&s.session===get().session;
 function sync(){if(state&&!valid(state)){hooks.local.reset();state=null;if(ui?.isConnected)hooks.close();ui=null}}
 function clear(){hooks.local.reset();state=null;ui=null}
 function open(){
  sync();const c=get();
  if(!c.actor||!['requester','professional'].includes(c.role))return;
  const s=state||{actor:c.actor,session:c.session,role:c.role,messages:[],pending:null,busy:false};
  state=s;
  ui=el('section',{class:'guided-helper ucp-ai'});
  const log=el('div',{class:'helper-log',role:'log','aria-label':'Conversation IA locale UCP','aria-live':'polite','aria-relevant':'additions text'});
  const proposals=el('div',{class:'helper-options ai-options'});
  const status=el('p',{class:'hint',role:'status'});
  const retry=button('Réessayer de générer la réponse',()=>invoke('reply',null),'outline');retry.hidden=true;
  const textarea=el('textarea',{rows:3,maxlength:1200,required:true,'aria-label':'Votre message pour le chatbot IA',
    placeholder:s.role==='requester'?'Ex. Je souhaite refaire ma salle de bains à Toulouse. Aide-moi à rédiger mon annonce.':'Ex. Je suis plombier et recherche des chantiers à Toulouse.'});
  const submit=el('button',{class:'primary',type:'submit',text:'Envoyer',disabled:true});
  const acknowledge=el('input',{type:'checkbox',checked:false});
  const agreement=el('label',{class:'ai-consent'},acknowledge,el('span',{text:'Je comprends que le modèle open source sera téléchargé sur mon appareil pour fonctionner sans API payante. Le premier chargement peut être volumineux.'}));
  const form=el('form',{},el('label',{text:'Votre message'}),textarea,submit);
  const draft=button('Préparer mon annonce avec l’IA',()=>propose('draft'),'outline');
  const search=button('Configurer ma recherche avec l’IA',()=>propose('search'),'outline');
  const newChat=button('Nouvelle conversation',()=>{
   if(!valid(s)||s.busy)return;state=null;open();
  });
  const shortcuts=el('div',{class:'helper-options ai-shortcuts'});
  const items=s.role==='requester'?[['Mes projets','projects'],['Messages','conversations'],['Assistance','support']]:
   [['Trouver des projets','projects'],['Mes candidatures','applications'],['Mon profil','profile'],['Assistance','support']];
  for(const [label,view] of items)shortcuts.append(button(label,()=>{if(valid(s)&&!s.busy)hooks.navigate(view)}));
  const actions=el('div',{class:'helper-options ai-actions'},s.role==='requester'?draft:search);
  ui.append(
   el('p',{class:'ai-intro',text:'Posez votre question, décrivez vos travaux ou demandez une aide pour trouver un chantier. Réponses générées par une IA gratuite directement sur votre appareil.'}),
   log,proposals,status,retry,agreement,form,
   el('p',{class:'hint',text:'Après quelques messages, l’IA peut aussi préparer une proposition à vérifier :'}),actions,
   el('div',{class:'ai-tools'},newChat),
   el('details',{class:'ai-technical-details'},el('summary',{text:'Fonctionnement et confidentialité'}),
    el('p',{class:'hint',text:'Aucune API IA payante. Il faut un navigateur compatible WebGPU. La première utilisation télécharge un modèle volumineux (plusieurs centaines de Mo) depuis des hébergeurs publics ; il peut ensuite être mis en cache. Les messages restent sur cet appareil, mais l’hébergeur du modèle voit les demandes de téléchargement. N’utilisez que des données fictives en préproduction.'})),
   el('p',{class:'hint',text:'Navigation directe'}),shortcuts);
  const model=hooks.local.status();
  function allowed(){const active=!!model.configured&&acknowledge.checked&&!s.busy;submit.disabled=!active;textarea.disabled=s.busy;draft.disabled=!active||s.messages.length===0;search.disabled=!active||s.messages.length===0;newChat.disabled=s.busy;retry.disabled=!active||!s.messages.some(m=>m.role==='user')}
  function say(role,text){
   s.messages.push({role,text});s.messages=s.messages.slice(-20);
   log.append(el('div',{class:'helper-message '+(role==='user'?'from-user':''),'data-role':role},
     el('strong',{text:role==='user'?'Vous':'Assistant IA'}),el('p',{text})));
   if(log.childElementCount>20)log.firstElementChild.remove();
   log.scrollTop=log.scrollHeight;
  }
  function showPending(){
   proposals.replaceChildren();const p=s.pending;if(!p)return;
   if(p.draft){
    const d=p.draft;
    proposals.append(el('div',{class:'helper-proposal'},el('h4',{text:'Annonce rédigée par l’IA'}),el('p',{text:'Titre : '+d.title}),el('p',{text:d.description}),
      el('p',{text:'Commune : '+d.town}),el('p',{text:'Métiers : '+d.trades.join(', ')}),el('p',{class:'hint',text:'À vérifier et compléter avant publication. Rien ne sera publié par le chatbot.'})));
    proposals.append(button('Utiliser dans mon annonce',async()=>{
     if(!valid(s)||s.busy)return;s.busy=true;allowed();status.textContent='Préparation du formulaire…';
     try{const ok=await hooks.apply(d);
      if(valid(s)){status.textContent=ok?'La proposition est dans votre formulaire. Relisez-la avant publication.':'Transfert non effectué. Votre proposition reste disponible.';if(ok){s.pending=null;showPending()}}}
     catch{if(valid(s))status.textContent='Le transfert a échoué. Réessayez.'}
     finally{if(valid(s)){s.busy=false;allowed()}}
    },'primary'));
   }
   if(p.search){
    const f=p.search;
    proposals.append(el('div',{class:'helper-proposal'},el('h4',{text:'Critères de recherche proposés'}),el('p',{text:[
     f.q&&'Mots-clés : '+f.q,f.trade&&'Métier : '+f.trade,f.town&&'Commune : '+f.town,f.timing&&'Début : '+f.timing,
     f.budget_from&&'Minimum : '+f.budget_from+' €',f.budget_to&&'Maximum : '+f.budget_to+' €'].filter(Boolean).join(' · ')}),
     el('p',{class:'hint',text:'Seuls les projets accessibles à votre compte apparaîtront après confirmation.'})));
    proposals.append(button('Appliquer ces filtres',async()=>{
     if(!valid(s)||s.busy)return;s.busy=true;allowed();
     try{const ok=await hooks.search(f);
      if(valid(s)){status.textContent=ok?'Filtres appliqués.':'Impossible d’ouvrir la recherche.';if(ok){s.pending=null;showPending()}}}
     catch{if(valid(s))status.textContent='La recherche n’a pas pu être ouverte.'}
     finally{if(valid(s)){s.busy=false;allowed()}}
    },'primary'));
   }
   proposals.append(button('Ignorer la proposition',()=>{if(valid(s)&&!s.busy){s.pending=null;showPending();textarea.focus()}}));
  }
  async function invoke(mode,message=null){
   if(!valid(s)||s.busy||!acknowledge.checked||!model.configured)return;
   if(mode==='reply'){
    if(message!==null){if(!message||message.trim().length<2||message.length>1200)return;
     say('user',message.trim());textarea.value='';}
   }
   if(!s.messages.some(m=>m.role==='user')){
    status.textContent='Décrivez d’abord votre besoin dans la conversation.';return;
   }
   s.busy=true;retry.hidden=true;s.pending=null;showPending();allowed();
   status.textContent='Chargement ou calcul du modèle IA sur votre appareil…';
   const messages=s.messages.slice(-12).map(m=>({role:m.role,content:m.text}));
   try{
    const output=await hooks.local.send({mode,role:s.role,catalog:get().catalog,messages,
     onProgress:(label,pct)=>{
      if(valid(s)&&ui?.closest('dialog')?.open){
       const percentage=Number.isFinite(pct)&&pct>0?' ('+Math.min(100,Math.round(pct*100))+' %)':'';
       status.textContent=label+percentage;
      }
     }});
    if(!valid(s)||!ui?.closest('dialog')?.open)return;
    say('assistant',output.reply);
    s.pending={draft:output.draft||null,search:output.search||null};showPending();
    status.textContent=s.pending.draft||s.pending.search?'Proposition prête à vérifier.':'Réponse produite localement.';
   }catch(e){
    if(valid(s)&&ui?.closest('dialog')?.open){status.textContent=e?.message||'Le modèle local est indisponible. Réessayez.';retry.hidden=false;}
   }finally{if(valid(s)){s.busy=false;allowed();if(ui?.closest('dialog')?.open)textarea.focus()}}
  }
  async function propose(mode){await invoke(mode)}
  form.addEventListener('submit',e=>{e.preventDefault();invoke('reply',textarea.value)});
  textarea.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();invoke('reply',textarea.value)}});
  acknowledge.addEventListener('change',allowed);
  hooks.show(ui);
  for(const m of s.messages){
   log.append(el('div',{class:'helper-message '+(m.role==='user'?'from-user':''),'data-role':m.role},
      el('strong',{text:m.role==='user'?'Vous':'Assistant IA'}),el('p',{text:m.text})));
  }
  showPending();allowed();
  status.textContent=model.configured?'IA locale prête à être initialisée lors de votre premier message.':model.reason;
 }
 return {open,sync,clear};
}
root.UCPAssistantAI={create};
if(typeof module==='object'&&module.exports)module.exports={create};
})(typeof window==='object'?window:globalThis);
