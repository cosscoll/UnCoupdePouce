/* Chatbot IA UCP : API server-side, consentement explicite, aucune action automatique. */
(function(root){
'use strict';
function create(hooks){
 let state=null,ui=null;
 const context=()=>hooks.context(),valid=s=>state===s&&s.actor===context().actor&&s.session===context().session;
 const el=hooks.el,button=hooks.button;
 function sync(){if(state&&!valid(state)){state=null;if(ui?.isConnected)hooks.close();ui=null}}
 function clear(){state=null;ui=null}
 function open(){
  sync();const c=context();if(!c.actor||!['requester','professional'].includes(c.role))return;
  const s=state||{actor:c.actor,session:c.session,role:c.role,messages:[],pending:null,busy:false,enabled:false};
  state=s;
  ui=el('section',{class:'guided-helper ucp-ai'});
  const log=el('div',{class:'helper-log',role:'log','aria-label':'Conversation IA UCP','aria-live':'polite','aria-relevant':'additions text'});
  const options=el('div',{class:'helper-options ai-options'});
  const status=el('p',{class:'hint',role:'status',text:'Vérification du service IA…'});
  const input=el('textarea',{rows:3,maxlength:1200,required:true,'aria-label':'Votre message pour le chatbot IA',placeholder:s.role==='requester'?'Ex. Je veux rénover ma salle de bains à Toulouse. Aide-moi à créer mon annonce.':'Ex. Je recherche des chantiers de plomberie à Toulouse, budget de 500 à 3000 €.'});
  const submit=el('button',{class:'primary',type:'submit',text:'Envoyer',disabled:true});
  const consent=el('input',{type:'checkbox',checked:false});
  const consentLabel=el('label',{class:'ai-consent'},consent,el('span',{text:'J’accepte que mes messages fictifs soient transmis au fournisseur IA pour recevoir une réponse.'}));
  const form=el('form',{},el('label',{text:'Parlez librement à l’assistant'}),input,submit);
  const newChat=button('Nouvelle conversation',()=>{if(!valid(s)||s.busy)return;state=null;open()});
  const links=el('div',{class:'helper-options ai-shortcuts'});
  const targets=s.role==='requester'?[['Mes projets','projects'],['Messages','conversations'],['Assistance','support']]:[['Trouver des projets','projects'],['Mes candidatures','applications'],['Mon profil','profile'],['Assistance','support']];
  for(const [label,view] of targets)links.append(button(label,()=>{if(valid(s)&&!s.busy)hooks.navigate(view)}));
  ui.append(el('p',{class:'hint',text:'Assistant IA conversationnel : il réfléchit à chaque question et tient compte des échanges précédents. Il ne peut ni publier, ni candidater, ni modifier votre compte.'}),
   el('p',{class:'hint',text:'Préproduction privée : données fictives uniquement. Ne saisissez pas de nom réel, téléphone, email, adresse précise ni document personnel. Les messages sont envoyés à un fournisseur externe ; UCP ne conserve pas le dialogue après fermeture de la page.'}),
   log,options,status,consentLabel,form,el('div',{class:'ai-tools'},newChat),el('p',{class:'hint',text:'Accès direct aux rubriques'}),links);
  function available(){submit.disabled=!s.enabled||!consent.checked||s.busy;input.disabled=s.busy;newChat.disabled=s.busy}
  function say(role,text){
   s.messages.push({role,text});s.messages=s.messages.slice(-24);
   log.append(el('div',{class:'helper-message '+(role==='user'?'from-user':''),'data-role':role},el('strong',{text:role==='user'?'Vous':'Assistant IA'}),el('p',{text})));
   if(log.childElementCount>24)log.firstElementChild.remove();
   log.scrollTop=log.scrollHeight;
  }
  function pending(){
   options.replaceChildren();const p=s.pending;if(!p)return;
   if(p.draft){
    const d=p.draft;
    options.append(el('div',{class:'helper-proposal'},el('h4',{text:'Annonce proposée par l’IA'}),el('p',{text:'Titre : '+d.title}),el('p',{text:d.description}),el('p',{text:'Commune : '+d.town}),el('p',{class:'hint',text:'Relisez et corrigez ce texte dans le formulaire avant toute publication.'})));
    options.append(button('Utiliser dans mon annonce',async()=>{
     if(!valid(s)||s.busy)return;s.busy=true;available();status.textContent='Préparation du formulaire…';
     try{const ok=await hooks.apply(d);if(valid(s)){if(ok){s.pending=null;pending();status.textContent='Proposition transférée, sans publication.'}else status.textContent='Le formulaire n’a pas été remplacé ; votre proposition est conservée.'}}
     catch{if(valid(s))status.textContent='Le transfert a échoué. Vous pouvez réessayer.'}
     finally{if(valid(s)){s.busy=false;available()}}
    },'primary'));
   }
   if(p.search){
    const f=p.search;
    options.append(el('div',{class:'helper-proposal'},el('h4',{text:'Filtres de recherche proposés'}),el('p',{text:[f.q&&'Mots-clés : '+f.q,f.town&&'Commune : '+f.town,f.trade&&'Métier : '+f.trade,f.timing&&'Délai : '+f.timing,f.budget_from&&'Budget min. : '+f.budget_from+' €',f.budget_to&&'Budget max. : '+f.budget_to+' €'].filter(Boolean).join(' · ')}),el('p',{class:'hint',text:'Les missions proposées dépendront de votre profil et des droits UCP. Aucune disponibilité n’est garantie.'})));
    options.append(button('Appliquer ces filtres',async()=>{
     if(!valid(s)||s.busy)return;s.busy=true;available();
     try{const ok=await hooks.search(f);if(valid(s)){status.textContent=ok?'Recherche préparée.':'Impossible d’ouvrir la recherche.';if(ok){s.pending=null;pending()}}}
     catch{if(valid(s))status.textContent='Impossible d’appliquer les filtres.'}
     finally{if(valid(s)){s.busy=false;available()}}
    },'primary'));
   }
   options.append(button('Ignorer cette proposition',()=>{if(valid(s)&&!s.busy){s.pending=null;pending();input.focus()}}));
  }
  async function send(value){
   const message=value.trim();if(!valid(s)||s.busy||!s.enabled||!consent.checked||message.length<2||message.length>1200)return;
   const history=s.messages.slice(-12).map(m=>({role:m.role,content:m.text}));
   s.pending=null;pending();say('user',message);input.value='';s.busy=true;available();status.textContent='L’assistant réfléchit…';
   try{const answer=await hooks.request('/assistant/chat',{message,history});
    if(!valid(s)||!ui?.closest('dialog')?.open)return;
    say('assistant',answer.reply);s.pending={draft:answer.draft||null,search:answer.search||null};
    pending();status.textContent='Réponse de l’IA. Vérifiez les propositions avant de les utiliser.';
   }catch(e){if(valid(s)&&ui?.closest('dialog')?.open)status.textContent=e.message||'Service IA temporairement indisponible.'}
   finally{if(valid(s)){s.busy=false;available();if(ui?.closest('dialog')?.open)input.focus()}}
  }
  form.addEventListener('submit',e=>{e.preventDefault();send(input.value)});
  input.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();send(input.value)}});
  consent.addEventListener('change',available);
  hooks.show(ui);
  for(const m of s.messages)log.append(el('div',{class:'helper-message '+(m.role==='user'?'from-user':''),'data-role':m.role},el('strong',{text:m.role==='user'?'Vous':'Assistant IA'}),el('p',{text:m.text})));
  pending();available();
  hooks.request('/assistant/status').then(data=>{if(!valid(s)||!ui?.closest('dialog')?.open)return;s.enabled=!!data.configured;status.textContent=s.enabled?'Assistant IA disponible. Acceptez l’envoi de vos messages fictifs pour commencer.':'Service IA non activé sur ce serveur. Aucune réponse automatique n’est présentée comme de l’IA.';available()})
  .catch(e=>{if(valid(s)&&ui?.closest('dialog')?.open)status.textContent=e.message||'Échec de la vérification IA.'});
 }
 return {open,sync,clear};
}
root.UCPAssistantAI={create};
if(typeof module==='object'&&module.exports)module.exports={create};
})(typeof window==='object'?window:globalThis);
