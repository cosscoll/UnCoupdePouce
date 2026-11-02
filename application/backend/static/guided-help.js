(function(root){
'use strict';
const normalize=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const aliases={plomberie:['fuite','fuites','robinet','robinets','lavabo','evier','eviers','canalisation','wc','douche','sanitaire','salle de bain','salle de bains'],electricite:['prise','prises','tableau electrique','electricien','eclairage','courant'],peinture:['repeindre','peindre'],carrelage:['carreler','faience'],menuiserie:['fenetre','porte','placard'],couverture:['toiture','toit','tuile'],chauffage:['radiateur','chaudiere']};
function suggestTrades(text,catalog){
 const words=' '+normalize(text).replace(/[^a-z0-9]+/g,' ')+' ';
 return catalog.filter(t=>t.id!=='inconnu'&&t.active!==false).map(t=>({id:t.id,label:t.label,score:[t.label,...(t.synonyms||[]),...(aliases[t.id]||[])].filter(term=>{const clean=normalize(term).replace(/[^a-z0-9]+/g,' ').trim();return clean&&words.includes(' '+clean+' ')}).length})).filter(t=>t.score).sort((a,b)=>b.score-a.score).slice(0,4);
}
function hasContact(text){
 const s=text.normalize('NFKC').replace(/\p{Cf}/gu,'').replace(/\s+/g,' ');
 return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|(?:wa\.me|t\.me|instagram\.com|facebook\.com)\//i.test(s)||/(?<!\d)(?:(?:\+33|0033)[ .-]?[1-9]|0[1-9])(?:[ .-]?\d{2}){4}(?!\d)/.test(s)||/\d{1,4}\s*(?:bis|ter)?\s+(?:rue|avenue|av\.?|boulevard|bd\.?|impasse|chemin|route|allee|allée|place)\b/i.test(s);
}
function proposal(data){
 const first=data.need.split(/[.!?\n]/)[0].slice(0,100).trim();
 return {title:first.length>=5?first:'Projet de travaux à '+data.town,description:data.need,town:data.town,trades:[...data.trades],timing:data.timing,budget_min:null,budget_max:null,version:0,photos:[]};
}
function create(hooks){
 let state=null,ui=null;
 const timings={flexible:'Date flexible',month:'Dans le mois',quarter:'Dans les trois mois',urgent:'Dès que possible'};
 const get=()=>hooks.context();
 const valid=s=>state===s&&s.actor===get().actor&&s.session===get().session;
 function sync(){if(state&&!valid(state)){state=null;if(ui?.isConnected){hooks.close();ui.replaceChildren();ui.remove()}ui=null}}
 function say(s,text,user=false){s.messages.push({id:++s.next,text,user});s.messages=s.messages.slice(-24)}
 function initial(){const c=get();state={actor:c.actor,session:c.session,role:c.role,step:'home',messages:[],next:0,data:{trades:[]},selected:[]};say(state,c.role==='requester'?'Bonjour ! Je peux vous aider à préparer une annonce ou à vous repérer dans UCP.':'Bonjour ! Je peux vous guider pour compléter votre profil, trouver des missions et suivre vos candidatures.');return state}
 function open(){
  sync();const c=get();if(!c.actor||!['requester','professional'].includes(c.role))return;
  const s=state||initial(),el=hooks.el;
  ui=el('section',{class:'guided-helper'});
  ui.append(el('p',{class:'hint',text:'Assistant guidé · réponses préparées, sans IA externe. Vos échanges restent dans cette page et ne sont pas conservés après déconnexion. Données fictives uniquement.'}));
  if(c.wizardStep)say(s,'Vous êtes à l’étape '+c.wizardStep+' de votre annonce. Je peux préparer une nouvelle proposition ; votre brouillon actuel sera enregistré avant tout remplacement.');
  const log=el('div',{class:'helper-log',role:'log','aria-label':'Conversation avec l’assistant UCP','aria-live':'polite','aria-relevant':'additions text'}),options=el('div',{class:'helper-options'}),status=el('p',{class:'hint',role:'status'});
  const input=el('textarea',{id:'helper-message',name:'message',rows:2,maxlength:1200,required:true,placeholder:s.role==='requester'?'Ex. Comment décrire mes travaux ?':'Ex. Pourquoi ma messagerie est bloquée ?'});
  const send=el('button',{type:'submit',class:'primary',text:'Envoyer'}),form=el('form',{},el('label',{htmlFor:'helper-message',text:'Votre message'}),input,send);
  const restart=hooks.button('Nouvelle conversation',()=>{if(!valid(s)||s.busy)return;state=null;open()});
  ui.append(log,options,status,form,restart);
  const choice=(label,fn)=>hooks.button(label,()=>{if(!valid(s)||s.busy)return;status.textContent='';fn();if(valid(s)&&ui?.closest('dialog')?.open){draw();if(form.hidden){const next=[...options.querySelectorAll('button')].find(b=>b.textContent===label)||options.querySelector('button,select');next?.focus()}else input.focus()}});
  function navigate(view){hooks.navigate(view)}
  function homeOptions(){
   if(s.role==='requester'){
    options.append(choice('Préparer mon annonce',()=>start()),choice('Choisir un professionnel',()=>answer('Comment choisir un professionnel ?')),choice('Comprendre la messagerie',()=>answer('Comment fonctionne la messagerie ?')));
   }else options.append(choice('Compléter mon profil',()=>answer('Comment compléter mon profil ?')),choice('Trouver des missions',()=>answer('Comment trouver des missions ?')),choice('Suivre mes candidatures',()=>answer('Comment suivre mes candidatures ?')),choice('Pourquoi le chat est bloqué ?',()=>answer('Pourquoi le chat est bloqué ?')));
   options.append(choice('Contacter l’assistance',()=>answer('Contacter l’assistance')));
  }
  function start(){s.data={trades:[]};s.selected=[];s.step='need';say(s,'Décrivez les travaux souhaités en quelques phrases : ce qui est à faire, la pièce concernée et les contraintes que vous connaissez. N’indiquez ni coordonnées ni adresse précise. Je ne peux pas établir de diagnostic technique.');}
  function answer(text){
   const q=normalize(text);say(s,text,true);
   if(/danger|incendie|odeur de gaz/.test(q)){say(s,'Je ne peux pas établir de diagnostic ni donner des consignes de réparation. En cas de danger immédiat, contactez les services d’urgence.');return}
   s.links=[];
   if(/assist|signal|probleme|reclamation/.test(q)){say(s,'La rubrique Assistance permet de poser une question et de suivre la réponse de l’équipe. Pour un contenu précis, utilisez son bouton de signalement.');s.links=[['Ouvrir l’assistance','support']]}
   else if(/chat|messag|conversation/.test(q)){say(s,'Une sélection doit d’abord avoir lieu. Le chat dépend ensuite des autorisations de test et de l’état des comptes, du projet et du profil lié. Consultez le motif dans le suivi ; je ne peux pas débloquer l’accès ni vérifier votre dossier.');s.links=[s.role==='professional'?['Voir mes candidatures','applications']:['Voir mes projets','projects'],['Ouvrir les messages','conversations']]}
   else if(/budget|prix|cout|tarif|paiement|abonn/.test(q)){say(s,'Le budget du chantier est facultatif et ne vaut pas devis. Vous pouvez le laisser vide puis le préciser dans le formulaire. Cette préproduction ne déclenche aucun paiement réel ; je ne peux pas estimer un prix ou un tarif professionnel.')}
   else if(s.role==='professional'&&/profil|presentation|metier|zone|realisation/.test(q)){say(s,'Dans Mon profil, indiquez vos métiers réels de test, votre commune et vos autres communes d’intervention. Présentez uniquement des réalisations déclarées. Une modification du périmètre nécessite un nouvel examen. Je ne peux ni certifier vos compétences ni valider votre entreprise.');s.links=[['Ouvrir mon profil','profile']]}
   else if(s.role==='professional'&&/candid|repons|retenu|refus/.test(q)){say(s,'Mes candidatures indique le statut réel et la disponibilité du chat. Une candidature ne constitue pas un devis. Un retrait est possible tant qu’elle est en attente ; si un délai de réessai est affiché, attendez avant de renvoyer.');s.links=[['Voir mes candidatures','applications']]}
   else if(s.role==='professional'&&/mission|projet|recherch|favori/.test(q)){say(s,'Trouver des projets affiche les missions autorisées pour vos métiers et communes déclarés. Affinez les filtres, enregistrez une recherche ou ajoutez un favori. Aucun rayon réel ni temps de trajet n’est calculé.');s.links=[['Trouver des projets','projects'],['Voir mes favoris','favorites']]}
   else if(s.role==='requester'&&/choisir|professionnel|comparer|artisan/.test(q)){say(s,'Ouvrez votre projet pour comparer les candidatures et les présentations déclarées. L’autorisation de test n’est pas une certification. Vérifiez les informations utiles avant votre choix ; l’assistant ne choisit pas à votre place.');s.links=[['Voir mes projets','projects']]}
   else if(s.role==='requester'&&/annonce|chantier|travaux|decri|remplir|projet/.test(q)){start()}
   else say(s,'Je suis un assistant guidé : je peux préparer une annonce et expliquer les rubriques UCP. Pour une question technique, un devis ou un cas de compte précis, contactez un professionnel compétent ou l’assistance. Choisissez l’un des sujets proposés.');
  }
  function receive(text){
   if(!valid(s)||s.busy)return false;
   text=text.trim();if(!text||text.length>1200){status.textContent='Saisissez entre 1 et 1 200 caractères.';return false}
   if(hasContact(text)){status.textContent='Retirez les coordonnées et l’adresse précise de votre message. Vous pouvez indiquer seulement la commune.';return false}
   status.textContent='';
   if(s.step==='home')answer(text);
   else if(s.step==='need'){
    if(text.length<20){status.textContent='Précisez les travaux et la pièce concernée (20 caractères minimum).';return false}
    s.data.need=text;s.step='trades';s.selected=[];say(s,text,true);say(s,'Quels métiers souhaitez-vous solliciter ? Les suggestions sont indicatives : confirmez vos choix. Si vous hésitez, choisissez « Je ne sais pas ».');
   }else if(s.step==='town'){
    if(text.length<2||text.length>90){status.textContent='Indiquez une commune de 2 à 90 caractères, sans adresse précise.';return false}
    s.data.town=text;s.step='timing';say(s,text,true);say(s,'Quand souhaitez-vous commencer ? Choisissez le délai qui vous correspond.');
   }else if(s.step==='trades'||s.step==='timing'){status.textContent='Choisissez une des options proposées pour poursuivre.';return false}
   else {s.step='home';s.links=[];answer(text)}
   draw();return true;
  }
  function draw(){
   if(!valid(s))return;
   const ids=new Set(s.messages.map(m=>String(m.id)));
   for(const node of [...log.children])if(!ids.has(node.dataset.messageId))node.remove();
   const existing=new Set([...log.children].map(node=>node.dataset.messageId));
   for(const m of s.messages)if(!existing.has(String(m.id)))log.append(el('div',{class:'helper-message '+(m.user?'from-user':''),'data-message-id':m.id},el('strong',{text:m.user?'Vous':'Assistant UCP'}),el('p',{text:m.text})));
   log.scrollTop=log.scrollHeight;options.replaceChildren();form.hidden=['trades','timing','review'].includes(s.step);
   input.placeholder=s.step==='town'?'Ex. Toulouse':s.step==='need'?'Ex. Remplacer un évier dans une cuisine…':'Posez votre question sur UCP…';
   if(s.step==='home'){homeOptions();for(const [label,view]of s.links||[])options.append(choice(label,()=>navigate(view)))}
   if(s.step==='trades'){
    const all=hooks.context().catalog.filter(t=>t.active!==false),suggested=suggestTrades(s.data.need,all);
    const toggle=id=>{if(id==='inconnu'){s.selected=s.selected.includes(id)?[]:[id]}else if(s.selected.includes(id))s.selected=s.selected.filter(t=>t!==id);else if(s.selected.length<12)s.selected=[...s.selected.filter(t=>t!=='inconnu'),id]};
    for(const t of suggested){const b=choice(t.label,()=>toggle(t.id));b.setAttribute('aria-pressed',String(s.selected.includes(t.id)));options.append(b)}
    const select=el('select',{'aria-label':'Autre métier à ajouter'},el('option',{value:'',text:'Choisir un autre métier'}),...all.filter(t=>t.id!=='inconnu').map(t=>el('option',{value:t.id,text:t.label})));
    options.append(select,choice('Ajouter ce métier',()=>{if(select.value)toggle(select.value)}));
    if(all.some(t=>t.id==='inconnu')){const unknown=choice('Je ne sais pas',()=>toggle('inconnu'));unknown.setAttribute('aria-pressed',String(s.selected.includes('inconnu')));options.append(unknown)}
    options.append(el('p',{class:'hint',text:'Choix : '+(s.selected.map(id=>all.find(t=>t.id===id)?.label||id).join(' · ')||'Aucun métier confirmé')}),choice('Confirmer les métiers',()=>{
     const current=new Set(hooks.context().catalog.filter(t=>t.active!==false).map(t=>t.id));
     if(!s.selected.length||s.selected.some(id=>!current.has(id))){status.textContent='Choisissez au moins un métier actuel ou « Je ne sais pas ».';return}
     s.data.trades=[...s.selected];s.step='town';say(s,'Métiers confirmés : '+s.selected.map(id=>all.find(t=>t.id===id)?.label||id).join(' · '),true);say(s,'Dans quelle commune se situe le chantier ? Le nom de la commune suffit ; aucune adresse précise.');
    }));
   }
   if(s.step==='timing')for(const [key,label]of Object.entries(timings))options.append(choice(label,()=>{s.data.timing=key;s.step='review';say(s,label,true);say(s,'Voici votre proposition. Le budget et les photos restent facultatifs et pourront être ajoutés dans le formulaire. Relisez et modifiez le texte avant toute publication.')}));
   if(s.step==='review'){
    const p=proposal(s.data),box=el('div',{class:'helper-proposal'},el('h4',{text:'Proposition à relire'}),el('p',{text:'Titre : '+p.title}),el('p',{text:p.description}),el('p',{text:'Commune : '+p.town+' · '+timings[p.timing]}),el('p',{class:'hint',text:'Un nouveau brouillon sera préparé. Si vous en avez déjà un en cours, il sera d’abord enregistré. Rien ne sera publié par le chatbot.'}));
    const apply=hooks.button('Utiliser cette proposition',async()=>{
     if(!valid(s)||s.busy)return;s.busy=true;apply.disabled=true;status.textContent='Préparation du brouillon…';
     try{const result=await hooks.apply(proposal(s.data));if(valid(s)){s.busy=false;apply.disabled=false;if(result){s.step='home';s.data={trades:[]};s.links=[];say(s,'La proposition est dans votre formulaire. Relisez-la et complétez-la ; sa publication reste à votre initiative.');draw()}else status.textContent='Le brouillon actuel n’a pas pu être enregistré ou le transfert a été annulé. Votre proposition est conservée ; réessayez.'}}
     catch{if(valid(s)){s.busy=false;apply.disabled=false;status.textContent='La proposition n’a pas pu être transférée. Réessayez.'}}
    },'primary');options.append(box,apply,choice('Reprendre les questions',()=>start()));
   }
  }
  form.addEventListener('submit',e=>{e.preventDefault();if(receive(input.value))input.value='';input.focus()});
  hooks.show(ui);draw();
 }
 return {open,sync,clear:()=>{state=null;ui=null}};
}
const api={create,suggestTrades,hasContact,proposal};root.UCPGuidedHelp=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
