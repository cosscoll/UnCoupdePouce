'use strict';
const $=s=>document.querySelector(s);
const appState={user:null,csrf:null,view:null},trades={};
let catalog=[],renderEpoch=0,currentDraft=null,wizardStep=1,chatTimer=null,chatEpoch=0,dialogEpoch=0;
const draftSaveStates=new WeakMap();let draftSaveTimer=null,dialogReturnFocus=null;
const labels={open:'Ouvert aux candidatures',selected:'Professionnel sélectionné',closed:'Clôturé',cancelled:'Annulé',suspended:'Suspendu',pending:'En attente',accepted:'Sélectionnée',rejected:'Non retenue',withdrawn:'Retirée'};
const icons={home:'M3 10.5 12 3l9 7.5V21H5a2 2 0 0 1-2-2z M9 21v-7h6v7',search:'m20 20-4-4 M10.8 17a6.2 6.2 0 1 0 0-12.4 6.2 6.2 0 0 0 0 12.4',heart:'M20.8 9.4 12 18l-8.8-8.6a4.9 4.9 0 0 1 6.9-6.9L12 4.3l1.9-1.8a4.9 4.9 0 0 1 6.9 6.9z',briefcase:'M3 7h18v13H3z M8 7V4h8v3 M3 13h18',help:'M9 9a3 3 0 1 1 4 2.7c-.9.4-1 1-1 2 M12 18h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',people:'M5 19v-1a5 5 0 0 1 10 0v1 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 8a3 3 0 1 1 0 6 M16 17a4 4 0 0 1 5 4',shield:'M12 2 4 5v6c0 5 3.3 8.2 8 11 4.7-2.8 8-6 8-11V5z M8 12l3 3 5-6',projects:'M4 7h16v14H4z M8 7V3h8v4 M4 12h16',messages:'M4 4h16v13H9l-5 4z',profile:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21v-2a7 7 0 0 1 14 0v2',new:'M12 4v16 M4 12h16',arrow:'M5 12h14 M13 6l6 6-6 6',check:'m5 12 4 4L19 6',settings:'M4 6h16 M4 12h16 M4 18h16',bell:'M6 16V9a6 6 0 0 1 12 0v7l2 2H4z M10 21h4'};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',icons[name]||icons.projects);svg.append(p);return svg}
function el(tag,attrs={},...children){const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k.startsWith('on'))n.addEventListener(k.slice(2).toLowerCase(),v);else if(k==='text')n.textContent=v;else if(['value','checked','hidden','disabled','required','selected'].includes(k))n[k]=v;else if(k==='class')n.className=v;else if(k==='htmlFor')n.htmlFor=v;else n.setAttribute(k,v)}for(const c of children.flat(Infinity))if(c!=null)n.append(c.nodeType?c:document.createTextNode(String(c)));return n}
function clear(n){n.replaceChildren();return n}function formValue(f){return Object.fromEntries(new FormData(f))}
function button(t,fn,cl='outline'){return el('button',{type:'button',class:cl,text:t,onClick:fn})}
function msg(t,kind='',focus=true){const n=$('#alert');n.textContent=t;n.className=kind;n.hidden=!t;if(t&&focus)n.focus({preventScroll:true})}
function field(t,name,type='text',o={}){const l=el('label',{},el('span',{text:t}));let n;if(type==='select'){n=el('select',{name});for(const[v,t]of Object.entries(o.options||{}))n.append(el('option',{value:v,text:t}))}else n=el(type==='textarea'?'textarea':'input',{name,...(type==='textarea'?{}:{type}),minlength:o.minlength||0,maxlength:o.maxlength||5000,placeholder:o.placeholder||''});n.required=o.required!==false;if(o.value!=null)n.value=o.value;l.append(n);return l}
function panel(t,p){const n=el('section',{class:'panel'},el('h3',{text:t}));if(p)n.append(el('p',{class:'muted small',text:p}));return n}
function empty(t,p,cta,fn){return el('section',{class:'empty'},el('h3',{text:t}),el('p',{text:p}),cta?button(cta,fn,'primary'):null)}
function heading(t,p,cta,fn){return el('div',{class:'page-head'},el('div',{},el('div',{class:'eyebrow',text:'UN COUP DE POUCE'}),el('h2',{text:t}),el('p',{text:p})),cta?button(cta,fn,'primary'):null)}
function badge(status){return el('span',{class:'chip '+({open:'green',accepted:'green',pending:'amber',selected:'violet',cancelled:'red',suspended:'amber'}[status]||''),text:labels[status]||status})}
function projectBadge(p){return badge(p.suspended?'suspended':p.cancelled?'cancelled':p.status)}
function intakeBadge(p){return p.status==='open'&&!p.suspended&&p.applications_paused?el('span',{class:'chip amber',text:'Candidatures en pause'}):null}
function viewError(n,e){n.append(empty('Impossible de charger cette page',e.message,'Réessayer',render))}
function staleResponse(){return Object.assign(Error('Réponse ignorée : le compte ou la session a changé.'),{stale:true})}
async function api(path,o={}){
 const actor=appState.user,session=appState.csrf,method=o.method||'GET';
 const headers={Accept:'application/json'};
 if(method!=='GET')headers['x-ucp-csrf']=session||'';
 if(o.body!=null)headers['Content-Type']='application/json';
 if(o.idempotencyKey)headers['Idempotency-Key']=o.idempotencyKey;
 const stale=()=>actor!==appState.user||session!==appState.csrf;
 let res;
 try{
  res=await fetch('/api'+path,{method,headers,credentials:'same-origin',body:o.body!=null?JSON.stringify(o.body):undefined,signal:AbortSignal.timeout(o.timeoutMs||15000)});
 }catch{
  if(stale())throw staleResponse();
  UCPAnalytics.track('technical_error',{kind:'network'});
  throw Object.assign(Error('Connexion interrompue. Vos saisies sont conservées dans cette page. Réessayez.'),{status:0,retryable:true});
 }
 let data;try{data=await res.json()}catch{data={}}
 // A response authorized for a previous session must never affect this account.
 if(stale())throw staleResponse();
 if(!res.ok){
  if(res.status>=500)UCPAnalytics.track('technical_error',{kind:'server'});
  let text=data.detail||'Action impossible. Réessayez.';
  if(Array.isArray(text))text=text.map(x=>x.msg.replace('Value error, ','')).join(' · ');
  if(res.status===401&&appState.user){
   $('#dialog').close();clear($('#dialog-content'));clear($('#view'));
   stopDraft();appState.projectFilters=null;appState.user=null;appState.csrf=null;
   await render();text='Votre session a expiré. Reconnectez-vous.';
  }
  throw Object.assign(Error(text.message||text),{code:data.detail?.code,status:res.status,retryable:res.status>=500||res.status===408||res.status===429});
 }
 return data;
}
let acting=false;
async function action(fn,success){
 if(acting)return null;acting=true;const actor=appState.user,session=appState.csrf;
 msg('Action en cours…','',false);$('#main').setAttribute('aria-busy','true');
 try{const r=await fn();if(actor!==appState.user||session!==appState.csrf)return null;msg(success||'',success?'success':'');return r}
 catch(e){if(!e.stale)msg(e.message,'error');return null}
 finally{acting=false;$('#main').removeAttribute('aria-busy');if(currentDraft)queueDraftAutosave(currentDraft)}
}
async function go(v,options={}){
 const fromHistory=options.fromHistory===true;
 if(currentDraft){
  const saved=await action(saveDraft,'Brouillon enregistré avant de changer de page.');
  if(!saved){
   if(fromHistory)history.replaceState({ucpView:appState.view},'','#'+appState.view);
   return false;
  }
  stopDraft();
 }
 setNavigationOpen(false);
 appState.view=v;
 if(!fromHistory)history.pushState({ucpView:v},'','#'+v);
 const token=renderEpoch+1;
 await render();
 if(token===renderEpoch)focusPageHeading();
 return true;
}
async function restoreHistoryNavigation(){
 if(!appState.user)return;
 const requested=location.hash.slice(1);
 const allowed=roleNavigation(appState.user.role).some(([key])=>key===requested);
 const destination=allowed?requested:initialView(appState.user.role);
 if(!allowed)history.replaceState({ucpView:destination},'','#'+destination);
 if(destination===appState.view&&!currentDraft)return;
 await go(destination,{fromHistory:true});
}
let historyRestoreInProgress=false;
async function onHistoryChange(){
 if(historyRestoreInProgress)return;
 historyRestoreInProgress=true;
 try{await restoreHistoryNavigation()}catch{}
 finally{historyRestoreInProgress=false}
}
window.addEventListener('popstate',onHistoryChange);
window.addEventListener('hashchange',onHistoryChange);
function focusPageHeading(){const target=$('#view h2')||$('#view h3')||$('#main');target.setAttribute('tabindex','-1');target.focus()}
function setNavigationOpen(open){const toggle=$('#navigation-toggle');$('.sidebar').dataset.navigationOpen=String(open);toggle.setAttribute('aria-expanded',String(open))}
function showDialog(title,content){++dialogEpoch;const dialog=$('#dialog'),wasOpen=dialog.open;if(!wasOpen)dialogReturnFocus=document.activeElement;const n=clear($('#dialog-content')),heading=el('h3',{id:'dialog-title',tabindex:'-1',text:title});n.append(heading,content);dialog.setAttribute('aria-labelledby','dialog-title');dialog.showModal();(wasOpen?heading:n.querySelector('input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href]')||$('#dialog-close')).focus()}
function ask(title,desc,fn,success){const body=el('div',{},el('p',{text:desc}),button('Confirmer',async()=>{const dialogToken=dialogEpoch;const r=await action(fn,success);if(r){if(dialogToken===dialogEpoch&&$('#dialog').open)$('#dialog').close();const token=renderEpoch+1;await render();if(token===renderEpoch&&!$('#dialog').open)focusPageHeading()}},'primary'));showDialog(title,body)}
function roleNavigation(role){
 const items=role==='requester'?[['requester-home','Mon accueil','home'],['projects','Mes projets','projects'],['conversations','Messages','messages']]:role==='professional'?[['professional-home','Vue d’ensemble','home'],['projects','Trouver des projets','search'],['favorites','Mes favoris','heart'],['applications','Mes candidatures','briefcase'],['conversations','Messages','messages'],['profile','Mon profil','profile'],['enterprise','Mon entreprise','people']]:[['admin','Vue d’ensemble','home'],['moderation','Modération','shield'],['catalog','Métiers du bâtiment','settings']];
 return [...items,['support','Assistance','help'],['notifications','Notifications','bell'],['personal-data','Mon compte','profile']];
}
function initialView(role){
 const requested=location.hash.slice(1);
 return roleNavigation(role).some(([key])=>key===requested)?requested:role==='requester'?'requester-home':role==='professional'?'professional-home':'admin';
}
function menu(){
 const role=appState.user.role,items=roleNavigation(role);setNavigationOpen(false);
 const current=items.find(([key])=>key===appState.view)?.[1]||'Mon espace';
 $('#navigation-current').textContent=current;document.title=current+' · Un Coup de Pouce';
 const n=clear($('#tabs'));
 const itemButton=([key,label,pictogram])=>el('button',{
  class:'navlink '+(appState.view===key?'active':''),
  type:'button','aria-current':appState.view===key?'page':'false',
  onClick:()=>go(key)
 },icon(pictogram),label);
 if(role==='professional'){
  const main=['professional-home','projects','applications','conversations'];
  const others=items.filter(([key])=>!main.includes(key));
  for(const item of items.filter(([key])=>main.includes(key)))n.append(itemButton(item));
  const group=el('details',{class:'nav-secondary'},
   el('summary',{text:'Mon activité et réglages','aria-label':'Ouvrir mon activité et les autres rubriques'}),
   el('div',{class:'nav-secondary-items'},...others.map(itemButton)));
  group.open=others.some(([key])=>key===appState.view);
  n.append(group);
 }else{
  for(const item of items)n.append(itemButton(item));
 }
}
async function render(){
 guidedHelp?.sync();const hasAssistant=!!appState.user&&['requester','professional'].includes(appState.user.role);$('#chatbot-launcher').hidden=!hasAssistant;
 ++chatEpoch;const epoch=++renderEpoch;clearInterval(chatTimer);chatTimer=null;const u=appState.user;
 $('#anonymous').hidden=!!u;$('#dashboard').hidden=!u;$('#account-actions').hidden=true;
 document.body.dataset.space=u?.role||entrySpace;
 if(!u){document.title='Un Coup de Pouce · Votre espace travaux';return}
 $('#actor-role').textContent={requester:'ESPACE PARTICULIER',professional:'ESPACE PROFESSIONNEL',admin:'ADMINISTRATION'}[u.role];
 $('#actor-title').textContent='Bonjour, '+u.name;
 if(!appState.view)appState.view=initialView(u.role);menu();$('#account-actions').hidden=appState.view!=='personal-data';
 const target=clear($('#view'));target.append(el('div',{class:'loading',text:'Chargement de votre espace…'}));const fragment=document.createElement('div');
 try{
  const f={'requester-home':renderRequesterHome,'professional-home':renderProfessionalHome,projects:renderProjects,favorites:renderFavorites,applications:renderApplications,conversations:renderConversations,profile:renderProfile,enterprise:renderEnterprise,admin:renderAdmin,moderation:renderModeration,catalog:renderCatalog,support:renderSupport,notifications:renderNotifications,'personal-data':renderPersonalData}[appState.view];
  await f(fragment);if(epoch===renderEpoch)target.replaceChildren(...fragment.childNodes);
 }catch(e){if(epoch===renderEpoch){clear(target);viewError(target,e)}}
}
async function renderRequesterHome(n){
 if(appState.user.role!=='requester')throw Error('Cet accueil est réservé à l’espace particulier.');
 const epoch=renderEpoch;
 n.append(heading('Vos travaux, en toute simplicité.','Retrouvez votre prochaine étape, du projet à la rencontre avec un professionnel.','Créer un projet',()=>startWizard()));
 const priority=el('section',{class:'home-priority',role:'region','aria-label':'Votre prochaine étape'});
 priority.append(el('p',{class:'muted small',text:'Recherche de votre prochaine étape…'}));
 const grid=el('div',{class:'overview-grid requester-overview'});
 const details=el('details',{class:'home-overview'},el('summary',{text:'Voir toute mon activité'}),grid);
 n.append(priority,details);
 const received={};
 function paintPriority(){
  if(epoch!==renderEpoch)return;
  const drafts=received.drafts?.items||[],projects=received.projects?.items||[],conversations=received.conversations?.items||[];
  const selected=projects.find(p=>p.status==='selected'),open=projects.find(p=>p.status==='open');
  let title,description,cta,run;
  if(selected&&conversations.length){
   title='Votre professionnel est sélectionné';
   description='Retrouvez votre échange et poursuivez votre projet.';
   cta='Ouvrir mes messages';run=()=>go('conversations');
  }else if(drafts.length){
   title='Une annonce à terminer';
   description='Votre brouillon est enregistré. Reprenez-le pour publier vos travaux.';
   cta='Reprendre mon brouillon';run=()=>{appState.view='projects';menu();startWizard(drafts[0])};
  }else if(open){
   title='Votre annonce est publiée';
   description='Consultez les candidatures et choisissez la suite à donner à votre projet.';
   cta='Voir mon projet';run=()=>projectDetail(open);
  }else if(conversations.length){
   title='Une conversation à retrouver';
   description='Vos échanges avec les professionnels sont disponibles.';
   cta='Lire mes messages';run=()=>go('conversations');
  }else{
   title='Un projet de travaux en tête ?';
   description='Décrivez simplement votre besoin. Vous pouvez enregistrer un brouillon avant de publier.';
   cta='Décrire mes travaux';run=()=>startWizard();
  }
  priority.replaceChildren(el('div',{class:'home-priority-copy'},
   el('span',{class:'eyebrow',text:'VOTRE PROCHAINE ÉTAPE'}),
   el('h3',{text:title}),el('p',{text:description})),button(cta,run,'primary'));
 }
 const sections=[
  {title:'Mes projets en cours',path:'/projects',view:'projects',cta:'Gérer mes projets',draw(data,node){
   const active=data.items.filter(p=>p.status!=='closed');node.append(el('strong',{class:'overview-count',text:active.length}),el('p',{class:'hint',text:'Projets publiés, sélectionnés ou suspendus.'}));
   for(const p of active.slice(0,3))node.append(el('div',{class:'item'},el('h4',{text:p.title}),projectBadge(p),intakeBadge(p),el('p',{class:'small muted',text:p.town}),button('Suivre ce projet',()=>projectDetail(p))));
   if(!active.length)node.append(el('p',{text:'Votre prochain projet commence par une description de vos travaux.'}));
  }},
  {title:'Mes brouillons',path:'/v4/drafts',view:'projects',cta:'Voir mes brouillons',draw(data,node){
   node.append(el('strong',{class:'overview-count',text:data.items.length}),el('p',{class:'hint',text:'Demandes enregistrées, pas encore publiées.'}));
   for(const d of data.items.slice(0,3))node.append(el('div',{class:'item'},el('h4',{text:d.title||'Nouveau projet'}),button('Reprendre ce brouillon',()=>{appState.view='projects';menu();startWizard(d)})));
   if(!data.items.length)node.append(el('p',{text:'Vous pouvez enregistrer une demande et la reprendre plus tard.'}));
  }},
  {title:'Mes échanges',path:'/conversations',view:'conversations',cta:'Voir mes échanges',draw(data,node){
   node.append(el('strong',{class:'overview-count',text:data.items.length}),el('p',{class:'hint',text:'Conversations liées à vos sélections. Leur accès dépend des droits en cours ; ce nombre ne compte pas les messages non lus.'}));
   for(const c of data.items.slice(0,3))node.append(el('div',{class:'item'},el('h4',{text:c.title}),el('p',{class:'small muted',text:c.peer})));
  }},
  {title:'Mes notifications',path:'/notifications?unread_only=true',view:'notifications',cta:'Voir mes notifications',draw(data,node){
   node.append(el('strong',{class:'overview-count',text:data.unread}),el('p',{class:'hint',text:'Notifications internes non lues.'}));
   for(const item of data.items.slice(0,3))node.append(el('p',{text:item.message}));
  }}
 ];
 await Promise.all(sections.map(async section=>{
  const box=panel(section.title),content=el('div');box.append(content,button(section.cta,()=>go(section.view),'link'));grid.append(box);
  try{const data=await api(section.path);if(epoch!==renderEpoch)return;received[section.view==='projects'&&section.path==='/v4/drafts'?'drafts':section.view]=data;section.draw(data,content)}
  catch(e){if(epoch===renderEpoch&&!e.stale)content.append(el('p',{class:'hint',text:'Cette rubrique est momentanément indisponible.'}),button('Réessayer',render,'link'))}
 }));
 paintPriority();
}

function tradeNames(p){return (p.trades||(p.trades_json?JSON.parse(p.trades_json):[p.trade])).map(x=>trades[x]||x).join(' · ')}
function amountField(label,name,value){return el('label',{},el('span',{text:label}),el('input',{type:'number',name,min:0,max:2147483647,step:1,inputmode:'numeric',value:value??''}))}
const amountValue=value=>value==null||value===''?null:Number(value);
function budgetText(p){
  const low=p.budget_min,high=p.budget_max,euros=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
  if(low==null&&high==null)return 'Non renseigné';
  if(low!=null&&high!=null)return low===high?euros(low):'De '+euros(low)+' à '+euros(high);
  return low!=null?'Minimum annoncé : '+euros(low):'Maximum annoncé : '+euros(high);
}
function matchExplanation(p){
  if(!p.match)return null;
  if(p.matching_profile_count>1)return el('p',{class:'match-reason small',text:p.matching_profile_count+' profils correspondent. Choisissez le profil dans le détail du chantier.'});
  const who=p.match.profile==='linked'?'Profil lié « '+p.match.alias+' »':'Votre profil individuel';
  return el('p',{class:'match-reason small',text:who+' : '+p.match.trades.map(t=>trades[t]||t).join(' · ')+' ; commune couverte : '+p.match.town+'.'});
}
const timingNames={flexible:'Date flexible',month:'Dans le mois',quarter:'Dans les trois mois',urgent:'Dès que possible'};
async function renderProfessionalHome(n){
 if(appState.user.role!=='professional')throw Error('Cette vue est réservée à l’espace professionnel.');
 const epoch=renderEpoch;
 n.append(heading('Vos chantiers, au bon endroit.','Trouvez une mission et suivez les réponses à vos candidatures.','Trouver des chantiers',()=>go('projects')));
 const priority=el('section',{class:'home-priority',role:'region','aria-label':'Prochaine action professionnelle'});
 priority.append(el('p',{class:'muted small',text:'Chargement de votre prochaine étape…'}));
 const grid=el('div',{class:'overview-grid'});
 n.append(priority,el('details',{class:'home-overview'},el('summary',{text:'Voir le détail de mon activité'}),grid));
 const snapshot={};
 function updatePriority(){
  if(epoch!==renderEpoch)return;
  const profile=snapshot.profile?.profile,missions=snapshot.projects?.items||[],
   applications=snapshot.applications?.items||[],conversations=snapshot.conversations?.items||[];
  let title,description,cta,run;
  if(snapshot.profile&&!profile){
   title='Complétez votre profil professionnel';
   description='Indiquez vos métiers et communes d’intervention pour accéder aux chantiers qui vous concernent.';
   cta='Compléter mon profil';run=()=>go('profile');
  }else if(profile&&!profile.approved){
   title='Votre profil est en cours d’examen';
   description='Vous pouvez vérifier vos informations pendant que votre accès de test est examiné.';
   cta='Vérifier mon profil';run=()=>go('profile');
  }else if(conversations.some(c=>c.subscription_active&&(!c.linked_profile_id||c.linked_active))){
   title='Vos conversations sont accessibles';
   description='Retrouvez les projets pour lesquels un échange est disponible.';
   cta='Ouvrir mes messages';run=()=>go('conversations');
  }else if(applications.some(a=>a.status==='pending'&&a.project_status!=='closed')){
   title='Vous avez une candidature en attente';
   description='Suivez votre proposition pendant que le demandeur examine les profils.';
   cta='Suivre ma candidature';run=()=>go('applications');
  }else{
   const count=missions.filter(p=>p.status==='open').length;
   title=count?'Des chantiers correspondent à votre activité':'Recherchez votre prochain chantier';
   description=count?'Consultez les missions disponibles pour vos métiers et communes.':'Définissez vos critères pour découvrir les projets éligibles.';
   cta='Explorer les chantiers';run=()=>go('projects');
  }
  priority.replaceChildren(el('div',{class:'home-priority-copy'},
   el('span',{class:'eyebrow',text:'VOTRE PROCHAINE ACTION'}),
   el('h3',{text:title}),el('p',{text:description})),button(cta,run,'primary'));
 }
 function section(title,view,draw){
  const box=panel(title),content=el('div');box.append(content,button({projects:'Voir les projets',applications:'Voir mes candidatures',conversations:'Ouvrir mes conversations',profile:'Voir mon profil',notifications:'Voir les notifications'}[view],()=>go(view),'link'));grid.append(box);
  return {content,draw};
 }
 const missions=section('Missions ouvertes accessibles','projects',(data,node)=>{
  const items=data.items.filter(p=>p.status==='open');node.append(el('strong',{class:'overview-count',text:items.length}));
  if(data.search_scope&&data.search_scope!=='ready')node.append(el('p',{class:'hint',text:'Complétez votre profil ou attendez son examen pour consulter les missions autorisées.'}));
  for(const project of items.slice(0,3))node.append(el('div',{class:'item'},el('h4',{text:project.title}),el('p',{class:'small muted',text:project.town+' · '+tradeNames(project)}),button('Consulter ce projet',()=>projectDetail(project))));
  if(!items.length)node.append(el('p',{class:'hint',text:'Aucune mission ouverte accessible actuellement. Vos métiers, communes et profils actifs déterminent les résultats.'}));
 });
 const applications=section('Vos candidatures','applications',(data,node)=>{
  const active=data.items.filter(a=>a.project_status!=='closed');
  node.append(el('dl',{class:'overview-totals'},el('dt',{text:'En attente · projet non clôturé'}),el('dd',{text:active.filter(a=>a.status==='pending').length}),el('dt',{text:'Sélectionnées · projet non clôturé'}),el('dd',{text:active.filter(a=>a.status==='accepted').length})));
  for(const a of data.items.slice(0,3))node.append(el('div',{class:'item'},el('h4',{text:a.title}),a.project_cancelled&&a.status==='rejected'?null:badge(a.status),a.project_status==='closed'?el('span',{class:'chip',text:a.project_cancelled?'Projet annulé':'Projet clôturé'}):null));
 });
 const messages=section('Conversations accessibles','conversations',(data,node)=>{
  const available=data.items.filter(a=>!!a.subscription_active&&(!a.linked_profile_id||!!a.linked_active));
  node.append(el('strong',{class:'overview-count',text:available.length}),el('p',{class:'hint',text:'Après sélection et contrôle des droits de test. Ce compteur ne représente pas des messages non lus.'}));
  const locked=data.items.length-available.length;
  if(locked)node.append(el('p',{class:'status-note',text:locked+' échange(s) nécessitent une activation de test ou un profil lié actif.'}));
 });
 const profile=section('Profil et accès de test','profile',(data,node)=>{
  const p=data.profile;
  node.append(el('p',{class:'status-note',text:!p?'Profil à compléter':p.approved?'Profil autorisé pour les tests':'Profil en attente d’examen'}));
  if(p)node.append(el('p',{class:'hint',text:p.subscription_active?'Accès messagerie de test actif, sous réserve de sélection et d’un profil actif.':'Accès messagerie de test inactif. Retrouvez les explications dans vos candidatures.'}));
  node.append(el('p',{class:'small muted',text:'Aucune certification professionnelle ni souscription payante réelle.'}));
 });
 const notices=section('Notifications non lues','notifications',(data,node)=>{
  node.append(el('strong',{class:'overview-count',text:data.unread}));
  for(const notice of data.items.filter(x=>!x.read_at).slice(0,3))node.append(el('p',{class:'small',text:notice.message}));
 });
 async function load(target,path){
  try{
   const data=await api(path);if(epoch!==renderEpoch)return false;snapshot[path.split('?')[0].replace('/my-','/').slice(1)]=data;clear(target.content);target.draw(data,target.content);updatePriority();return {ok:true};
  }catch(e){
   if(e.stale||e.status===401||epoch!==renderEpoch)return false;
   clear(target.content);target.content.append(el('p',{class:'status-note',text:'Information indisponible. Les autres rubriques restent utilisables.'}),button('Réessayer cette rubrique',()=>action(()=>load(target,path))));return false;
  }
 }
 await Promise.all([[missions,'/projects'],[applications,'/my-applications'],[messages,'/conversations'],[profile,'/my-profile'],[notices,'/notifications?unread_only=true']].map(([target,path])=>load(target,path)));
 updatePriority();
}
async function renderProjects(n){
  const req=appState.user.role==='requester',epoch=renderEpoch,owner=appState.user.id;
  n.append(heading(req?'Mes projets de travaux':'Trouver un chantier',req?'Retrouvez vos annonces, brouillons et candidatures.':'Explorez les projets qui correspondent à vos métiers et à vos communes.',req?'Créer une annonce':null,()=>startWizard()));
  const initial=await api('/projects'),items=initial.items;
  if(req){const ds=(await api('/v4/drafts')).items;if(ds.length){const box=panel('À reprendre','Vos brouillons sont enregistrés dans votre compte.');for(const d of ds)box.append(el('div',{class:'item line'},el('strong',{text:d.title||'Nouveau projet'}),button('Continuer',()=>startWizard(d)),button('Supprimer',()=>ask('Supprimer ce brouillon ?','La demande n’a pas été publiée. Ses photos seront également supprimées.',()=>api('/v4/drafts/'+d.id,{method:'DELETE'})))));n.append(box)}}
  if(!req&&initial.search_scope!=='ready'&&initial.search_scope){
    n.append(empty(initial.search_scope==='profile_required'?'Complétez votre profil.':'Votre profil attend son examen.',
      'Les métiers, les communes et l’autorisation de test déterminent les missions que vous pouvez consulter.','Vérifier mon profil',()=>go('profile')));return;
  }
  const saved=appState.projectFilters?.owner===owner?appState.projectFilters.values:{};
  const form=el('form',{class:'project-search',role:'search','aria-label':'Rechercher les projets'});
  const q=field(req?'Rechercher dans mes annonces':'Mots-clés','q','search',{value:saved.q||'',maxlength:120,required:false,placeholder:req?'Ex. Ma salle de bains':'Ex. Carrelage, rénovation, salle de bains…'});
  const select=(label,name,options)=>{const node=field(label,name,'select',{options,required:false});node.querySelector('select').value=saved[name]||'';return node};
  const towns=[...new Set([...items.map(p=>p.town),...(saved.town?[saved.town]:[])])].sort((a,b)=>a.localeCompare(b,'fr'));
  const groups=[...new Set(catalog.map(t=>t.group))].sort((a,b)=>a.localeCompare(b,'fr'));
  const trade=select('Métier','trade',{'':'Tous mes métiers',...Object.fromEntries(catalog.map(t=>[t.id,t.label]))});
  const town=select('Commune','town',{'':'Toutes les communes',...Object.fromEntries(towns.map(t=>[t,t]))});
  const advanced=el('details',{class:'search-advanced'},
   el('summary',{text:req?'Filtrer mes projets par statut':'Filtres avancés'}),
   el('div',{class:'search-grid'},
    req?select('Statut','status',{'':'Tous mes projets',open:'Ouverts',selected:'Professionnel sélectionné',closed:'Terminés',cancelled:'Annulés',suspended:'Suspendus'}):null,
    !req?select('Catégorie','category',{'':'Toutes les catégories',...Object.fromEntries(groups.map(t=>[t,t]))}):null,
    !req?select('Début souhaité','timing',{'':'Tous les délais',...timingNames}):null,
    !req?select('Publication','published_within',{'':'Toutes les dates','1':'Dernières 24 heures','7':'Sept derniers jours','30':'Trente derniers jours'}):null,
    !req?amountField('Budget recherché · minimum (€)','budget_from',saved.budget_from):null,
    !req?amountField('Budget recherché · maximum (€)','budget_to',saved.budget_to):null,
    !req?el('p',{class:'hint budget-filter-note',text:'Le budget annoncé doit recouper votre plage. Les projets sans budget sont exclus lorsque ce filtre est actif.'}):null));
  advanced.open=Object.entries(saved).some(([k,v])=>v&&(req?k==='status':!['q','sort','trade','town'].includes(k)));
  const order=select('Trier','sort',{newest:'Plus récents',oldest:'Plus anciens'});order.querySelector('select').value=saved.sort||'newest';
  const reset=button('Effacer les filtres',()=>{for(const c of form.querySelectorAll('input,select'))c.value=c.name==='sort'?'newest':'';action(()=>load())});
  const core=el('div',{class:'search-core'},q,...(req?[]:[trade,town]));
  form.append(core,advanced,el('div',{class:'search-actions'},order,el('button',{type:'submit',class:'primary',text:req?'Filtrer':'Rechercher les chantiers'}),reset));
  const list=el('div',{class:'project-list'}),count=el('p',{class:'count',role:'status','aria-live':'polite'});
  n.append(form,count,list);
  if(!req)n.append(el('p',{class:'hint',text:'La commune correspond aux zones déclarées de votre profil ou d’un profil lié actif. Aucun rayon ni temps de trajet n’est calculé.'}));
  function draw(rows){
    clear(list);count.textContent=rows.length+' projet'+(rows.length>1?'s':'')+' selon vos critères';
    for(const p of rows){
      const info=el('div',{},el('div',{class:'line'},projectBadge(p),intakeBadge(p),p.hidden?el('span',{class:'chip red',text:'En modération'}):null),
        el('h3',{text:p.title}),el('p',{text:p.town+' · '+tradeNames(p)}),el('p',{class:'small muted',text:'Début souhaité : '+(timingNames[p.timing]||'Date flexible')}),el('p',{class:'small muted',text:'Budget indicatif : '+budgetText(p)}),!req?matchExplanation(p):null);
      list.append(el('article',{class:'project-row'},el('div',{class:'project-icon'},icon('projects')),info,
        el('div',{class:'row-actions'},button(req?'Voir les candidatures →':'Voir le projet →',()=>projectDetail(p)),!req?favoriteButton(p,()=>epoch===renderEpoch&&appState.user?.id===owner):null)));
    }
    if(!rows.length)list.append(empty(req?'Aucun projet ne correspond.':'Aucune mission ne correspond.',
      req?'Essayez d’autres mots-clés ou affichez tous vos projets.':'Élargissez les critères pour trouver davantage de missions disponibles.',
      'Effacer les filtres',()=>reset.click()));
  }
  let seq=0;
  async function load(){
    const turn=++seq,values=formValue(form),params=new URLSearchParams();
    for(const [k,v] of Object.entries(values))if(v)params.set(k,v);
    try{const result=await api('/projects'+(params.size?'?'+params.toString():''));
      if(epoch===renderEpoch&&turn===seq){appState.projectFilters={owner,values};draw(result.items)}return result;
    }catch(e){if(epoch===renderEpoch)count.textContent='Recherche non appliquée : les résultats précédents sont conservés ; corrigez les critères ou réessayez.';throw e}
  }
  form.addEventListener('submit',e=>{e.preventDefault();action(()=>load())});
  if(Object.values(saved).some(Boolean))await load();else draw(items);
  if(!req)renderSavedSearches(n,form,load,()=>epoch===renderEpoch&&appState.user?.id===owner);
}
function favoriteButton(project,valid,onRemoved){
 const control=button('',async()=>{
  if(control.disabled||!valid())return;
  const wanted=!project.is_favorite;control.disabled=true;
  const result=await action(()=>api('/project-favorites/'+project.id,{method:wanted?'PUT':'DELETE'}));
  if(valid()&&control.isConnected){
   if(result){project.is_favorite=result.is_favorite;paint();msg(result.is_favorite?'Projet ajouté aux favoris.':'Projet retiré des favoris.','success',false);if(!result.is_favorite&&onRemoved)onRemoved()}
   control.disabled=false;
  }
 });
 control.classList.add('favorite-toggle');
 function paint(){control.textContent=project.is_favorite?'Retirer des favoris':'Ajouter aux favoris';control.setAttribute('aria-pressed',String(!!project.is_favorite));control.setAttribute('aria-label',control.textContent+' · '+(project.title||'Projet indisponible'))}
 paint();return control;
}
async function renderFavorites(n){
 const epoch=renderEpoch,owner=appState.user.id,valid=()=>epoch===renderEpoch&&appState.user?.id===owner;
 n.append(heading('Mes favoris','Vos favoris sont privés. Les droits d’accès sont vérifiés à chaque consultation.'));
 const data=await api('/project-favorites');if(!valid())return;
 const status=el('p',{role:'status',class:'count'}),list=el('div',{class:'project-list'});n.append(status,list);
 let remaining=data.items.length;
 function count(){status.textContent=remaining+' / '+data.limit+' favoris enregistrés';if(!remaining){clear(list);list.append(empty('Aucun favori enregistré.','Ajoutez des missions depuis Trouver des projets.','Trouver des projets',()=>go('projects')))}}
 for(const item of data.items){
  const p=item.available?item.project:{id:item.project_id,is_favorite:true};
  const row=el('article',{class:'project-row'}),content=el('div');
  if(item.available)content.append(el('h3',{text:p.title}),el('p',{text:p.town+' · '+tradeNames(p)}),el('p',{class:'small muted',text:'Budget indicatif : '+budgetText(p)}),matchExplanation(p));
  else content.append(el('h3',{text:'Projet indisponible'}),el('p',{class:'hint',text:'Ce projet ne peut plus être consulté avec vos profils actuels. Son contenu n’est pas conservé dans le favori.'}));
  row.append(el('div',{class:'project-icon'},icon('projects')),content,el('div',{class:'row-actions'},item.available?button('Voir le projet →',()=>projectDetail(p)):null,favoriteButton(p,valid,()=>{row.remove();remaining--;count();const next=list.querySelector('button');if(next)next.focus();else focusPageHeading()})));list.append(row);
 }
 count();
}
function renderSavedSearches(n,searchForm,load,valid){
 const box=panel('Mes recherches enregistrées','Conservez jusqu’à 10 jeux de critères privés. Les résultats sont recalculés selon vos droits actuels. Aucune alerte automatique.');box.classList.add('saved-searches');n.insertBefore(box,searchForm.nextSibling);
 const choice=field('Recherche enregistrée','saved_search','select',{required:false,options:{'':'Choisir une recherche'}}),select=choice.querySelector('select');
 const status=el('p',{class:'hint',role:'status'}),label=field('Nom de cette recherche','label','text',{minlength:2,maxlength:60,placeholder:'Ex. Plomberie à Toulouse'}),saveForm=el('form',{},label,el('button',{type:'submit',class:'outline',text:'Enregistrer ces critères'}));
 let stored=[],sequence=0;
 const selected=()=>stored.find(s=>String(s.id)===select.value);
 const apply=button('Appliquer la recherche',()=>action(async()=>{
  const item=selected();if(!item||!valid())return false;
  for(const input of searchForm.querySelectorAll('[name]')){
   const value=item.criteria[input.name]??(input.name==='sort'?'newest':'');
   if(input.tagName==='SELECT'&&![...input.options].some(o=>o.value===String(value)))input.append(el('option',{value,text:String(value)+' · critère enregistré'}));
   input.value=String(value);
  }
  searchForm.querySelector('details').open=true;
  return await load();
 }));
 const remove=button('Supprimer la recherche',()=>{
  const item=selected();if(!item||!valid())return;
  showDialog('Supprimer cette recherche ?',el('div',{},el('p',{text:'Supprimer « '+item.label+' » ? Les projets et les critères actuellement saisis restent conservés.'}),button('Supprimer',async()=>{
   const result=await action(()=>api('/saved-searches/'+item.id,{method:'DELETE'}),'Recherche supprimée.');
   if(result&&valid()){$('#dialog').close();await refresh()}
  },'primary')));
 });
 function controls(){apply.disabled=remove.disabled=!selected()}
 select.addEventListener('change',controls);controls();
 box.append(choice,el('div',{class:'row'},apply,remove,button('Actualiser les recherches',()=>refresh())),status,el('p',{class:'hint',text:'L’enregistrement conserve les critères du formulaire, même si vous n’avez pas encore lancé la recherche.'}),saveForm);
 async function refresh(preferred=select.value){
  const token=++sequence;status.textContent='Chargement des recherches enregistrées…';
  try{
   const data=await api('/saved-searches');if(!valid()||token!==sequence)return false;
   if(!Array.isArray(data.items))throw Error('Réponse incomplète');
   stored=data.items;select.replaceChildren(el('option',{value:'',text:'Choisir une recherche'}),...stored.map(s=>el('option',{value:s.id,text:s.label})));
   select.value=stored.some(s=>String(s.id)===String(preferred))?String(preferred):'';controls();
   status.textContent=stored.length+' / 10 recherches enregistrées dans votre compte.';return true;
  }catch(e){if(!e.stale&&valid()&&token===sequence)status.textContent='Impossible de charger les recherches enregistrées. Les critères saisis et les derniers résultats restent disponibles.';return false}
 }
 saveForm.addEventListener('submit',async e=>{
  e.preventDefault();if(!valid()||!searchForm.reportValidity())return;
  const raw=formValue(searchForm),criteria={};
  for(const key of ['q','trade','town','category','timing','published_within','sort','budget_from','budget_to'])if(raw[key])criteria[key]=['published_within','budget_from','budget_to'].includes(key)?Number(raw[key]):raw[key];
  const result=await action(()=>api('/saved-searches',{method:'POST',body:{label:formValue(saveForm).label,criteria}}),'Critères enregistrés dans votre compte.');
  if(result&&valid()){saveForm.reset();await refresh(result.id)}
 });
 refresh();
}
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
async function projectDetail(p){if(acting)return;const epoch=++renderEpoch,actor=appState.user,sourceView=appState.view;await action(async()=>{const d=await api('/v4/projects/'+p.id);if(epoch!==renderEpoch||actor!==appState.user)return false;const n=el('div'),req=actor.role==='requester';n.append(button(sourceView==='professional-home'?'← Vue d’ensemble':sourceView==='favorites'?'← Mes favoris':actor.role==='professional'?'← Trouver des projets':'← Mes projets',()=>go(sourceView),'link'),heading(d.title,d.town+' · '+tradeNames(d)),projectBadge(d),intakeBadge(d),el('section',{class:'panel'},el('h3',{text:'Le projet en quelques mots'}),el('p',{text:d.description}),el('p',{class:'small muted',text:'Début souhaité : '+({flexible:'flexible',month:'dans le mois',quarter:'dans les trois mois',urgent:'dès que possible'}[d.timing]||'flexible')})));n.append(el('p',{class:'hint',text:'Budget indicatif : '+budgetText(d)+'. Montant déclaré par le demandeur, sans valeur de devis ni paiement dans UCP.'}));if(d.photos.length)n.append(el('div',{class:'photos'},...d.photos.map(id=>el('a',{href:'/api/v4/photos/'+id,target:'_blank',rel:'noopener'},el('img',{src:'/api/v4/photos/'+id,alt:'Photo de test du projet',width:160,height:120})))));
if(req){
 const apps=(await api('/projects/'+p.id+'/applications')).items;
 const box=panel('Les professionnels intéressés','Comparez les profils déclarés avant de choisir. Une candidature ne constitue pas un devis. Dans cette préproduction, le chat nécessite une sélection et des droits de test actifs.');
 if(!apps.length){
  const availability=d.status==='closed'||d.suspended?'L’historique du projet est conservé.':d.applications_paused?'Les nouvelles candidatures sont en pause. Vous pouvez les rouvrir quand vous êtes prêt.':'Votre demande reste disponible pour les professionnels éligibles.';
  box.append(empty('Pas encore de candidature',availability));
 }
 if(d.suspended)box.append(el('p',{class:'status-note',text:'Le projet est suspendu. Reprenez-le pour traiter les candidatures ou accéder aux échanges.'}));
 renderCandidateCards(box,apps,d.id,d.suspended);n.append(box);
 if(d.status==='closed'&&!d.cancelled)await renderProjectFeedback(n,d);
 if(d.status==='open'&&!d.suspended){
  n.append(button(d.applications_paused?'Rouvrir les candidatures':'Mettre les candidatures en pause',()=>ask(
   d.applications_paused?'Rouvrir les candidatures ?':'Mettre les candidatures en pause ?',
   d.applications_paused?'Votre annonce pourra de nouveau apparaître aux professionnels éligibles. Les candidats en attente seront informés ; leur candidature conserve son état.':'Votre annonce disparaîtra de la recherche et refusera les nouvelles candidatures. Les candidatures reçues restent conservées et vous pouvez encore les examiner. Les professionnels concernés seront informés. Les droits des échanges existants restent inchangés.',
   ()=>api('/projects/'+d.id+'/application-intake',{method:'POST',body:{paused:!d.applications_paused,version:d.intake_version??0}}))));
 }
 if(d.status!=='closed'){
  if(d.suspended&&d.hidden){
   n.append(el('p',{class:'status-note',text:'La reprise est indisponible pendant la modération.'}));
  }else{
   n.append(button(d.suspended?'Reprendre le projet':'Suspendre le projet',()=>ask(
    d.suspended?'Reprendre votre projet ?':'Suspendre votre projet ?',
    d.suspended?'Le projet reprend avec son réglage précédent pour les nouvelles candidatures. Les échanges redeviennent accessibles selon les droits en vigueur. Les professionnels concernés sont informés.':'Le projet disparaît des recherches. Les candidatures et la sélection sont conservées. Les échanges sont interrompus jusqu’à la reprise. Les professionnels concernés sont informés.',
    ()=>api('/projects/'+d.id+'/suspension',{method:'POST',body:{suspended:!d.suspended,version:d.intake_version??0}}),
    d.suspended?'Votre projet a repris.':'Votre projet est suspendu.')));
  }
  n.append(el('div',{class:'row'},
   button('Clôturer le projet',()=>ask('Clôturer votre projet ?','Les candidatures en attente seront refusées et les échanges seront fermés. Cette clôture est définitive dans cette version.',()=>api('/projects/'+d.id+'/close',{method:'POST'}))),
   button('Annuler le projet',()=>ask('Annuler définitivement votre projet ?','L’annonce apparaîtra comme annulée. Les candidatures en attente prendront fin, les échanges seront fermés et les candidats en attente ou sélectionnés seront avertis. L’historique du projet est conservé.',()=>api('/projects/'+d.id+'/cancel',{method:'POST'}),'Votre projet a été annulé.'))));
 }
 if(d.content_editable??(!apps.length&&d.status==='open'))n.append(button('Modifier la demande',()=>editProject(d)));
}else if(d.own_application){
 n.append(el('section',{class:'status-note'},badge(d.own_application.status),el('p',{text:'Votre candidature est déjà enregistrée pour ce projet. Retrouvez son suivi dans Mes candidatures.'}),button('Voir ma candidature',()=>go('applications'))));
}else if(d.application_profiles?.length){
 n.append(projectApplication(d));
}else{
 n.append(el('p',{class:'status-note',text:'Les candidatures sont indisponibles pour ce projet.'}));
}
n.append(button('Signaler un problème',()=>report('project',p.id),'link'));
if(epoch!==renderEpoch||actor!==appState.user)return false;
$('#view').replaceChildren(...n.childNodes);focusPageHeading();UCPAnalytics.track('project_viewed');return true})}

async function renderProjectFeedback(holder,project){
 const section=el('section',{class:'panel project-feedback'});
 try{
  const data=await api('/projects/'+project.id+'/feedback');
  if(!data.eligible&&!data.feedback)return;
  holder.append(section);
  const saved=feedback=>{
   section.replaceChildren(
    el('span',{class:'eyebrow',text:'RETOUR D’EXPÉRIENCE PRIVÉ'}),
    el('h3',{text:'Votre retour est enregistré'}),
    el('p',{class:'feedback-rating',text:'Note donnée : '+feedback.rating+' / 5'}),
    el('p',{text:feedback.comment}),
    el('p',{class:'hint',text:'Ce retour fictif est privé : il ne crée pas d’avis public, de note sur le profil ou de vérification de l’artisan.'})
   );
  };
  if(data.feedback){saved(data.feedback);return}
  const rating=el('select',{name:'rating',required:true,'aria-label':'Votre évaluation'},
   ...[['','Choisissez une note'],['5','5 — Très satisfaisant'],['4','4 — Satisfaisant'],['3','3 — Mitigé'],['2','2 — Insatisfaisant'],['1','1 — Très insatisfaisant']]
    .map(([value,label])=>el('option',{value,text:label})));
  const comment=el('textarea',{name:'comment',minlength:20,maxlength:800,required:true,rows:4,
   placeholder:'Décrivez votre expérience de manière factuelle, avec des données fictives.'});
  const confirmed=el('input',{type:'checkbox',name:'collaboration_confirmed',required:true});
  const submit=el('button',{class:'primary',type:'submit',text:'Enregistrer mon retour privé'});
  const form=el('form',{class:'feedback-form'},
   el('label',{},el('span',{text:'Évaluez votre expérience'}),rating),
   el('label',{},el('span',{text:'Votre retour (20 à 800 caractères)'}),comment),
   el('label',{class:'feedback-confirmation'},confirmed,
    el('span',{text:'Je confirme avoir réellement échangé ou collaboré avec ce professionnel dans le cadre du projet fictif.'})),
   submit);
  section.append(el('span',{class:'eyebrow',text:'APRÈS LA CLÔTURE'}),
   el('h3',{text:'Votre retour sur la mise en relation'}),
   el('p',{class:'muted',text:'Professionnel sélectionné : '+data.professional_name}),
   el('p',{class:'hint',text:'Réservé aux projets clôturés avec un professionnel sélectionné. Le retour reste privé, non modifiable et n’est pas une certification ni un avis public. Aucune information réelle.'}),
   form);
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(!form.reportValidity())return;
   submit.disabled=true;
   try{
    const result=await action(()=>api('/projects/'+project.id+'/feedback',{
     method:'POST',
     body:{application_id:data.application_id,rating:Number(rating.value),
      comment:comment.value.trim(),collaboration_confirmed:confirmed.checked}
    }),'Retour privé enregistré.');
    if(result?.feedback)saved(result.feedback);
   }finally{if(form.isConnected)submit.disabled=false}
  });
 }catch{
  // Feedback is secondary. A temporary error must not hide the project's actions.
  holder.append(el('p',{class:'hint',text:'Le module de retour d’expérience est momentanément indisponible.'}));
 }
}

function projectApplication(project){
 const profiles=project.application_profiles;
 async function apply(profile){
  const suffix=profile.profile==='linked'?'/apply-linked/'+profile.linked_profile_id:'/apply';
  const result=await action(()=>api('/projects/'+project.id+suffix,{method:'POST'}),'Votre candidature est enregistrée.');
  if(result){
   UCPAnalytics.track('application_submitted');
   await go('applications');
  }
 }
 const submitLabel='Proposer ma candidature';
 if(profiles.length===1){
  return el('div',{},matchExplanation({match:{...profiles[0],town:project.town}}),button(submitLabel,()=>apply(profiles[0]),'primary'));
 }
 const box=panel('Choisissez le profil qui candidate','Un seul profil de votre compte peut candidater à ce chantier. Les métiers couverts sont indiqués pour chaque profil.');
 const select=el('select',{name:'application-profile',required:true},
  el('option',{value:'',text:'Sélectionnez un profil'}),
  profiles.map((profile,index)=>el('option',{value:String(index),text:
   (profile.profile==='linked'?profile.alias:'Votre profil individuel')+' · '+profile.trades.map(trade=>trades[trade]||trade).join(', ')})));
 const form=el('form',{},el('label',{},'Profil de candidature',select),el('button',{type:'submit',class:'primary',text:submitLabel}));
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(select.value!=='')apply(profiles[Number(select.value)]);
 });
 box.append(form);
 return box;
}

function showcaseContent(data){
 const n=el('section',{class:'showcase-content'});
 if(data.unavailable){n.append(el('p',{class:'hint',text:'Cette présentation n’est plus disponible.'}));return n}
 n.append(el('p',{class:'hint',text:data.declaration||'Informations déclarées, non vérifiées. Aucune certification ni avis client.'}));
 if(data.intro)n.append(el('p',{class:'case-text',text:data.intro}));
 else n.append(el('p',{class:'muted small',text:'Aucune présentation renseignée.'}));
 n.append(el('h4',{text:'Réalisations déclarées · '+data.works.length}));
 if(!data.works.length)n.append(el('p',{class:'small muted',text:'Aucune réalisation renseignée pour ce profil.'}));
 for(const work of data.works)n.append(el('details',{class:'showcase-work'},el('summary',{text:work.title+' · '+(trades[work.trade]||work.trade)+(work.year?' · '+work.year:'')}),el('p',{class:'case-text',text:work.description})));
 if(data.updated_at)n.append(el('p',{class:'small muted',text:'Présentation actuelle · mise à jour le '+new Date(data.updated_at).toLocaleDateString('fr-FR')}));
 return n;
}
async function candidateShowcase(projectId,applicationId){
 try{return await api('/projects/'+projectId+'/applications/'+applicationId+'/showcase')}
 catch(e){if(e.status===404)return {unavailable:true};throw e}
}
async function openCandidateShowcase(projectId,a){
 const epoch=renderEpoch,dialogToken=dialogEpoch;
 const result=await action(()=>candidateShowcase(projectId,a.id));
 if(result&&epoch===renderEpoch&&dialogToken===dialogEpoch)showDialog('Présentation · '+(a.linked_artisan_alias||a.professional_name),showcaseContent(result));
}
async function renderShowcaseManagement(n){
 const epoch=renderEpoch,box=panel('Votre présentation et vos réalisations','Décrivez votre savoir-faire avec des exemples fictifs. Chaque profil lié conserve sa propre présentation. Les demandeurs la consultent seulement depuis une candidature reçue.');
 const scopeRow=scope=>el('div',{class:'item'},el('h4',{text:scope.alias}),scope.active===false?el('p',{class:'hint',text:'Profil inactif : sa présentation n’est pas visible aux demandeurs.'}):null,
  el('div',{class:'row'},button('Modifier · '+scope.alias,()=>editShowcase(scope.id)),button('Aperçu · '+scope.alias,()=>previewShowcase(scope.id))));
 box.append(scopeRow({id:null,alias:'Mon profil individuel'}));
 const linked=el('div');box.append(linked);n.append(box);
 async function loadLinked(){
  try{
   const data=await api('/enterprise');if(epoch!==renderEpoch)return false;clear(linked);
   for(const member of data.members)linked.append(scopeRow({id:member.id,alias:member.alias,active:!!member.is_active}));
   return {ok:true};
  }catch(e){
   if(e.stale||e.status===401||epoch!==renderEpoch)return false;
   clear(linked);linked.append(el('p',{class:'hint',text:'Les profils liés n’ont pas pu être chargés. Votre profil individuel reste disponible.'}),button('Réessayer les profils liés',()=>action(loadLinked)));
   return false;
  }
 }
 await loadLinked();
}
async function previewShowcase(linked){
 const epoch=renderEpoch,dialogToken=dialogEpoch;
 const data=await action(()=>api('/v4/showcase'+(linked?'?linked_profile_id='+linked:'')));
 if(!data||epoch!==renderEpoch||dialogToken!==dialogEpoch)return;
 const visible={...data,works:data.works.filter(w=>data.scope.trades.includes(w.trade)&&catalog.some(t=>t.id===w.trade))};
 showDialog('Aperçu · '+data.scope.name,el('div',{},el('p',{class:'hint',text:data.scope.active?'Ce contenu déclaratif peut être consulté par les propriétaires des projets auxquels ce profil a candidaté.':'Aperçu personnel : le profil doit être actif et autorisé pour être visible aux demandeurs.'}),showcaseContent(visible)));
}
async function editShowcase(linked){
 const epoch=renderEpoch,dialogToken=dialogEpoch,path='/v4/showcase'+(linked?'?linked_profile_id='+linked:'');
 const data=await action(()=>api(path));if(!data||epoch!==renderEpoch||dialogToken!==dialogEpoch)return;
 const form=el('form',{},el('p',{class:'hint',text:'Données fictives uniquement. Présentation et réalisations sont déclaratives, sans vérification. Ne saisissez ni coordonnées, ni nom de client, ni adresse précise. Photos, avis et justificatifs ne sont pas proposés dans ce formulaire.'}),field('Présentez votre savoir-faire · facultatif','intro','textarea',{value:data.intro,maxlength:1200,required:false}));
 const list=el('div',{class:'showcase-editor'}),count=el('p',{class:'hint','aria-live':'polite'});
 const add=button('Ajouter une réalisation',()=>appendWork({}));
 function sync(){const total=list.children.length;count.textContent=total+' / 6 réalisations';add.disabled=total>=6}
 function appendWork(work){
  if(list.children.length>=6)return;
  const row=el('fieldset',{'data-work':'true'},el('legend',{text:'Réalisation déclarée'}),field('Titre','title','text',{value:work.title||'',minlength:3,maxlength:100}),field('Description','description','textarea',{value:work.description||'',minlength:20,maxlength:1000}),field('Métier du profil','trade','select',{value:work.trade,options:{'':'Choisissez un métier',...Object.fromEntries(data.scope.trades.filter(id=>catalog.some(t=>t.id===id)).map(id=>[id,trades[id]||id]))}}),el('label',{},el('span',{text:'Année · facultative'}),el('input',{name:'year',type:'number',min:1900,max:2100,step:1,value:work.year??''})),button('Retirer de ce formulaire',()=>{row.remove();sync()}));
  list.append(row);sync();
 }
 form.append(list,count,add,el('p',{class:'hint',text:'Les modifications et retraits sont enregistrés uniquement lorsque vous confirmez ci-dessous.'}),el('button',{type:'submit',class:'primary',text:'Enregistrer ma présentation'}));
 for(const work of data.works)appendWork(work);sync();
 form.addEventListener('submit',async e=>{
  e.preventDefault();const formToken=dialogEpoch,viewToken=renderEpoch;const works=[...list.children].map(row=>{const value=name=>row.querySelector('[name='+name+']').value;return {title:value('title'),description:value('description'),trade:value('trade'),year:value('year')===''?null:Number(value('year'))}});
  const result=await action(()=>api(path,{method:'PUT',body:{intro:form.querySelector('[name=intro]').value,works,version:data.version}}),'Présentation enregistrée. Elle reste déclarative.');
  if(result){data.version=result.version;if(formToken!==dialogEpoch||viewToken!==renderEpoch||!$('#dialog').open)return;$('#dialog').close();await render()}
 });
 showDialog('Présentation · '+data.scope.name,form);
}
function candidateFacts(a){
  const terms=[['Métiers déclarés',(a.trades||[a.trade]).map(t=>trades[t]||t).join(' · ')||'Non affichés'],
    ['Communes d’intervention',(a.service_zones||[a.town]).join(' · ')||'Non affichées'],
    ['Statut du profil',a.verification_status==='test_authorized'?'Autorisé pour les tests · aucune certification réelle':a.verification_status==='test_unavailable'?'Profil indisponible pour la sélection':'Statut non renseigné'],
    ['Candidature',labels[a.status]||a.status],
    ['Reçue le',a.submitted_at?new Date(a.submitted_at).toLocaleString('fr-FR'):'Date non renseignée']];
  if(a.public_details_restricted)terms.push(['Informations du profil','Certaines informations ont été masquées par précaution. Cela ne constitue pas une vérification professionnelle.']);
  return el('dl',{class:'candidate-facts'},...terms.flatMap(([t,v])=>[el('dt',{text:t}),el('dd',{text:v})]));
}
function renderCandidateCards(box,apps,projectId=null,suspended=false){
  const chosen=new Set(),checks=[];
  const summary=el('p',{class:'small muted','aria-live':'polite'});
  const compare=button('Comparer les profils sélectionnés',async()=>{
    const epoch=renderEpoch,dialogToken=dialogEpoch,selection=apps.filter(a=>chosen.has(a.id));
    if(selection.length<2||selection.length>3)return;
    const data=await action(async()=>projectId?await Promise.all(selection.map(a=>candidateShowcase(projectId,a.id))):selection.map(()=>null));
    if(!data||epoch!==renderEpoch||dialogToken!==dialogEpoch||chosen.size!==selection.length||selection.some(a=>!chosen.has(a.id)))return;
    const cards=el('div',{class:'candidate-comparison'},...selection.map((a,i)=>el('article',{class:'comparison-card'},
      el('h4',{text:a.professional_name}),a.linked_artisan_alias?el('p',{text:'Profil lié : '+a.linked_artisan_alias}):null,candidateFacts(a),data[i]?showcaseContent(data[i]):null)));
    showDialog('Comparer les candidatures',el('div',{},el('p',{class:'hint',text:'Comparez les métiers, les communes et les réalisations effectivement renseignées. Identités, assurances, avis et justificatifs : aucune vérification réelle disponible dans cette préproduction.'}),cards));
  },'secondary');compare.disabled=true;
  function update(){summary.textContent=chosen.size+' / 3 profils sélectionnés pour la comparaison';compare.disabled=chosen.size<2;for(const c of checks)c.disabled=chosen.size>=3&&!c.checked}
  if(apps.length)box.append(el('p',{class:'candidate-guidance',
   text:'Comparez les spécialités, zones d’intervention et présentations déclarées. Les identités, assurances et réalisations ne sont pas vérifiées dans cette préproduction.'}));
  if(apps.length>1)box.append(el('div',{class:'comparison-toolbar'},summary,compare));
  for(const a of apps){
    const specialties=(a.trades||[a.trade]).map(t=>trades[t]||t).filter(Boolean).join(' · ')||'Métiers à préciser';
    const zones=(a.service_zones||[a.town]).filter(Boolean).slice(0,4).join(' · ')||'Zones non renseignées';
    const item=el('article',{class:'item candidate-card'},
     el('div',{class:'candidate-card-intro'},
      el('div',{class:'candidate-card-avatar','aria-hidden':'true'},icon('profile')),
      el('div',{class:'candidate-card-heading'},el('h4',{text:a.professional_name}),
       a.linked_artisan_alias?el('p',{class:'small muted',text:'Profil présenté : '+a.linked_artisan_alias}):null,
       badge(a.status))),
     el('p',{class:'candidate-card-skill',text:specialties}),
     el('p',{class:'candidate-card-zones',text:'Intervention : '+zones}),
     el('p',{class:'candidate-verification',text:a.verification_status==='test_authorized'?'Profil autorisé pour les tests · identité et assurances non vérifiées':'Profil non certifié · vérification réelle indisponible'}),
     el('details',{class:'candidate-more'},el('summary',{text:'Voir tous les détails déclarés'}),candidateFacts(a)));
    if(apps.length>1){const check=el('input',{type:'checkbox','aria-label':'Comparer le profil de '+a.professional_name});
      check.addEventListener('change',()=>{if(check.checked&&chosen.size<3)chosen.add(a.id);else{chosen.delete(a.id);check.checked=false}update()});checks.push(check);
      item.append(el('label',{class:'candidate-choice'},check,'Ajouter au comparatif'));
    }
    if(a.status==='pending'&&!suspended){
      const select=a.eligible_for_selection!==false?button('Choisir ce professionnel',()=>ask('Choisir ce professionnel ?','Dans cette version, un professionnel peut être retenu par projet. Les autres candidatures seront refusées.',async()=>{const r=await api('/applications/'+a.id+'/accept',{method:'POST'});UCPAnalytics.track('match_confirmed');return r}),'primary'):el('p',{class:'hint',text:'Cette candidature ne peut pas être sélectionnée actuellement.'});
      item.append(el('div',{class:'row'},select,button('Ne pas retenir',()=>ask('Ne pas retenir cette candidature ?','Le professionnel retrouvera ce statut dans son espace.',()=>api('/applications/'+a.id+'/reject',{method:'POST'})))));
    }
    if(projectId)item.append(button('Voir sa présentation',()=>openCandidateShowcase(projectId,a)));
    box.append(item);
  }
  update();
}
function editProject(d){
 let base=d;
 const fields={title:'Titre',town:'Commune',description:'Description',budget_min:'Budget minimum',budget_max:'Budget maximum'};
 const status=el('p',{class:'status-note',role:'status',hidden:true});
 const published=el('section',{class:'status-note',hidden:true});
 const guidance=el('p',{class:'hint'});
 const save=el('button',{class:'primary',type:'submit',text:'Enregistrer les modifications'});
 const reload=button('Charger la version actuelle',async()=>{
  if(acting||!active())return;
  await action(async()=>{
   try{
    const latest=await api('/v4/projects/'+d.id);
    if(!active())return;
    for(const key of Object.keys(fields)){
     const input=f.elements.namedItem(key);
     if((key==='town'&&latest.content_scope_locked)||input.value===String(base[key]??''))input.value=latest[key]??'';
    }
    base=latest;
    setScope();
    published.replaceChildren(el('h4',{text:'Version actuellement publiée'}),
     ...Object.entries(fields).map(([key,label])=>el('p',{},el('strong',{text:label+' · '}),String(latest[key]??'Non renseigné'))),
     el('p',{text:'Métiers · '+tradeNames(latest)}));
    published.hidden=false;
    reload.hidden=true;
    save.disabled=latest.content_editable===false||latest.status!=='open';
    feedback(save.disabled?'Cette annonce est désormais fermée aux modifications.':'Version actuelle chargée. Comparez-la à votre saisie avant d’enregistrer.');
    status.focus();
   }catch(e){if(active()&&!e.stale)feedback(e.message)}
  });
 });
 reload.hidden=true;
 const f=el('form',{},field(fields.title,'title','text',{value:d.title,minlength:5,maxlength:120}),
  field(fields.town,'town','text',{value:d.town,maxlength:90}),
  field(fields.description,'description','textarea',{value:d.description,minlength:20}),
  el('div',{class:'budget-fields'},amountField(fields.budget_min+' facultatif (€)','budget_min',d.budget_min),amountField(fields.budget_max+' facultatif (€)','budget_max',d.budget_max)),
  guidance,status,reload,published,save);
 const inputs=Object.keys(fields).map(key=>f.elements.namedItem(key));
 function setScope(){
  f.elements.namedItem('town').readOnly=!!base.content_scope_locked;
  guidance.textContent=(base.content_scope_locked?'La commune et les métiers sont figés depuis la première candidature. ':'Les métiers restent identiques. ')+'Si le titre, la description ou le budget change, les candidats en attente seront avertis.';
 }
 setScope();
 function feedback(text){status.textContent=text;status.hidden=!text}
 status.tabIndex=-1;
 showDialog('Modifier votre demande',f);
 const token=dialogEpoch,view=renderEpoch;
 function active(){return token===dialogEpoch&&view===renderEpoch&&$('#dialog').open}
 f.addEventListener('submit',async e=>{
  e.preventDefault();
  if(acting||save.disabled||!active())return;
  const values=formValue(f);
  save.disabled=true;
  for(const input of inputs)input.readOnly=true;
  const result=await action(async()=>{
   try{
    return await api('/projects/'+d.id,{method:'PUT',body:{...values,trade:base.trade,content_version:base.content_version,
     budget_min:amountValue(values.budget_min),budget_max:amountValue(values.budget_max)}});
   }catch(e){
    if(active()&&!e.stale){
     feedback(e.message);
     reload.hidden=!['project_content_conflict','project_scope_locked'].includes(e.code);
     published.hidden=true;
     if(reload.hidden)status.focus();else reload.focus();
    }
    return null;
   }
  });
  if(!active())return;
  for(const input of inputs)input.readOnly=false;
  setScope();
  if(result){
   $('#dialog').close();
   const count=result.notified||0;
   msg(result.changed===false?'Aucune modification à enregistrer.':count?`Projet modifié. ${count} candidature(s) en attente avertie(s).`:'Projet modifié.','success');
   await render();
  }
  else save.disabled=!reload.hidden;
 });
}
function startWizard(d=null){clearTimeout(draftSaveTimer);currentDraft=d?structuredClone(d):{title:'',description:'',town:'Toulouse',trades:[],timing:'flexible',budget_min:null,budget_max:null,version:0,photos:[]};wizardStep=1;draftState(currentDraft);UCPAnalytics.track('project_started',{step:1});wizard();document.title='Décrire mon projet · Un Coup de Pouce';focusPageHeading()}
function tradePicker(selected,onChange,professional=false){const wrapper=el('div'),search=el('input',{type:'search',placeholder:'Ex. fuite, électricité, toiture…','aria-label':'Rechercher un métier'}),chosen=el('div',{class:'selected-trades'}),list=el('div',{class:'category-browser'});function draw(){clear(chosen);clear(list);for(const id of selected)chosen.append(button((trades[id]||id)+' ×',()=>{selected.splice(selected.indexOf(id),1);onChange([...selected]);draw()}));const q=normalize(search.value);const filtered=catalog.filter(t=>(!professional||t.id!=='inconnu')&&normalize([t.label,t.group,...t.synonyms].join(' ')).includes(q));for(const group of [...new Set(filtered.map(t=>t.group))]){const details=el('details',{},el('summary',{text:group}));details.open=!!q;const items=el('div',{class:'category-items'});for(const t of filtered.filter(t=>t.group===group)){const input=el('input',{type:'checkbox',value:t.id,checked:selected.includes(t.id),onChange:e=>{if(e.target.checked){if(selected.length>=12){e.target.checked=false;msg('Vous pouvez choisir jusqu’à 12 métiers.','error');return}if(t.id==='inconnu')selected.splice(0);else if(selected.includes('inconnu'))selected.splice(selected.indexOf('inconnu'),1);selected.push(t.id)}else selected.splice(selected.indexOf(t.id),1);onChange([...selected]);draw();const active=[...list.querySelectorAll('input')].find(x=>x.value===t.id);if(active){active.closest('details').open=true;active.focus()}}});items.append(el('label',{},input,t.label))}details.append(items);list.append(details)}if(!filtered.length)list.append(el('p',{class:'status-note',text:'Aucun métier trouvé. Choisissez « Je ne sais pas quel professionnel contacter ».'}))}search.addEventListener('input',draw);wrapper.append(search,chosen,list);draw();return wrapper}
function draftContent(d){return {title:d.title,description:d.description,town:d.town,trades:[...d.trades],timing:d.timing,budget_min:d.budget_min??null,budget_max:d.budget_max??null}}
function draftFingerprint(d){return JSON.stringify(draftContent(d))}
function draftState(d){
 if(!draftSaveStates.has(d)){const initial=draftFingerprint(d);draftSaveStates.set(d,{actor:appState.user,session:appState.csrf,key:crypto.randomUUID(),lastSaved:d.id?initial:null,observed:initial,changed:false,inFlight:null,creation:null,error:null})}
 return draftSaveStates.get(d);
}
function draftActive(d,s){return currentDraft===d&&appState.user===s.actor&&appState.csrf===s.session}
function draftUnsaved(){if(!currentDraft)return false;const s=draftState(currentDraft);return acting||!!s.inFlight||(s.changed&&draftFingerprint(currentDraft)!==s.lastSaved)}
function stopDraft(){clearTimeout(draftSaveTimer);draftSaveTimer=null;currentDraft=null}
function draftSaveStatus(d){
 const s=draftState(d);if(!s.status||!draftActive(d,s))return;
 const dirty=draftFingerprint(d)!==s.lastSaved;
 s.status.textContent=s.inFlight?'Enregistrement du brouillon…':s.error?
  (s.error.status===409?'Conflit de version : aucun écrasement automatique. ': 'Enregistrement non confirmé. ')+s.error.message+' Vos saisies restent dans cette page.':
  s.changed&&dirty?'Modifications en attente d’enregistrement…':d.id?'Brouillon enregistré dans votre compte.':'Sauvegarde automatique après une pause dans votre saisie. Aucune publication automatique.';
 s.retry.hidden=!s.error;s.copy.hidden=!s.error;
}
function draftSavePanel(d){
 const s=draftState(d);s.status=el('p',{class:'draft-save-status',role:'status','aria-live':'polite'});
 s.retry=button('Réessayer l’enregistrement',()=>action(saveDraft,'Brouillon enregistré dans votre compte.'));s.copy=button('Récupérer ma saisie',()=>recoverDraft(d),'link');
 const box=el('section',{class:'status-note'},s.status,el('div',{class:'row'},s.retry,s.copy));draftSaveStatus(d);return box;
}
function queueDraftAutosave(d,edited=false){
 const s=draftState(d);if(!draftActive(d,s))return;
 const fingerprint=draftFingerprint(d);
 if(edited&&fingerprint!==s.observed){s.changed=true;s.observed=fingerprint;if(s.error?.localValidation||s.error?.status===422)s.error=null}
 clearTimeout(draftSaveTimer);draftSaveTimer=null;draftSaveStatus(d);
 if(!s.changed||fingerprint===s.lastSaved||s.error||s.inFlight||acting)return;
 draftSaveTimer=setTimeout(()=>{draftSaveTimer=null;if(!draftActive(d,s)||acting)return;
  saveDraft(false).catch(e=>{if(draftActive(d,s)){s.error=e;draftSaveStatus(d)}});
 },1200);
}
async function saveDraft(flush=true){
 const d=currentDraft;if(!d)throw staleResponse();const s=draftState(d);clearTimeout(draftSaveTimer);draftSaveTimer=null;
 if(!draftActive(d,s))throw staleResponse();
 if(s.inFlight){const result=await s.inFlight;if(!draftActive(d,s))throw staleResponse();if(draftFingerprint(d)===s.lastSaved)return result;return saveDraft(flush)}
 for(const input of document.querySelectorAll('.wizard [name=budget_min],.wizard [name=budget_max]'))if(!input.checkValidity()){
  const e=Object.assign(Error('Corrigez les montants du budget : euros entiers sans valeur négative, ou champs vides.'),{localValidation:true});s.error=e;draftSaveStatus(d);throw e;
 }
 const creating=!d.id;
 if(creating&&!s.creation)s.creation={...draftContent(d),version:d.version};
 const payload=creating?structuredClone(s.creation):{...draftContent(d),version:d.version};
 const operation=(async()=>{
  try{
   const result=await api('/v4/drafts'+(creating?'':'/'+d.id),{method:creating?'POST':'PUT',body:payload,...(creating?{idempotencyKey:s.key}:{})});
   if(!draftActive(d,s))throw staleResponse();
   d.id=result.id;d.version=result.version;
   if(result.changed_since_creation)throw Object.assign(Error('La création a été retrouvée, mais ce brouillon a été modifié ou publié depuis. Récupérez votre saisie avant de charger la version du compte.'),{status:409});
   s.lastSaved=draftFingerprint(payload);s.error=null;
   return result;
  }catch(e){if(draftActive(d,s)){s.error=e;if(creating&&e.status===422)s.creation=null}throw e}
 })();
 s.inFlight=operation;draftSaveStatus(d);
 let result;
 try{result=await operation}finally{s.inFlight=null;draftSaveStatus(d);if(draftActive(d,s))queueDraftAutosave(d)}
 if(flush&&draftActive(d,s)&&draftFingerprint(d)!==s.lastSaved)return saveDraft(true);
 return result;
}
function recoverDraft(d){
 const s=draftState(d);if(!draftActive(d,s)||s.inFlight)return;
 const text=['Titre : '+d.title,'Description : '+d.description,'Commune : '+d.town,'Métiers : '+tradeNames(d),'Début souhaité : '+(timingNames[d.timing]||d.timing),'Budget : '+budgetText(d),'Photos déjà envoyées : '+d.photos.length].join('\n\n');
 const copy=el('textarea',{readonly:'',rows:12,'aria-label':'Copie de votre saisie actuelle',value:text});
 const body=el('div',{},el('p',{text:'Copiez ce texte avant de remplacer ou quitter votre saisie. Les photos déjà envoyées restent liées au brouillon du compte.'}),copy,button('Sélectionner le texte',()=>{copy.focus();copy.select()}),el('p',{class:'hint',text:'Les actions ci-dessous remplacent ou quittent cette copie de travail sans l’envoyer au serveur.'}));
 if(d.id)body.append(button('Charger le brouillon du compte',async()=>{const token=dialogEpoch;const data=await action(()=>api('/v4/drafts'));if(!data||!draftActive(d,s)||token!==dialogEpoch||!$('#dialog').open)return;const saved=data.items.find(x=>x.id===d.id);if(!saved){msg('Ce brouillon a été supprimé ou publié. Vous pouvez toujours copier votre saisie.','error');return}$('#dialog').close();startWizard(saved)}));
 body.append(button('Revenir aux projets sans enregistrer',()=>{if(acting||!draftActive(d,s))return;stopDraft();$('#dialog').close();go('projects')}));
 showDialog('Récupérer votre saisie',body);
}
function wizard(){const n=clear($('#view')),d=currentDraft;n.append(button('← Retour à mes projets',()=>ask('Revenir à vos projets ?','Enregistrez les dernières modifications avant de quitter.',async()=>{await saveDraft();stopDraft();go('projects');return true}),'link'));n.append(button('Besoin d’aide pour mon annonce ?',openGuidedHelp,'link'));const box=el('div',{class:'wizard'});n.append(box);box.append(el('ol',{class:'steps'},...['Vos travaux','Les détails','Vérification'].map((t,i)=>el('li',{class:i+1===wizardStep?'active':'','aria-current':i+1===wizardStep?'step':'false'},el('b',{text:i+1}),t))));const names=['De quoi avez-vous besoin ?','Parlez-nous de votre projet.','Tout est prêt pour publier ?'];box.append(el('h2',{text:names[wizardStep-1]}),el('p',{class:'muted small',text:['Plusieurs métiers ? Sélectionnez tous ceux qui vous concernent.','Quelques précisions pour recevoir des candidatures adaptées.','Relisez votre demande. Vous gardez la main sur le choix du professionnel.'][wizardStep-1]}));const form=el('form');box.append(draftSavePanel(d),form);
if(wizardStep===1){form.append(field('Un titre pour votre projet','title','text',{value:d.title,placeholder:'Ex. Rénover ma salle de bains',required:false,maxlength:120}),field('Votre besoin, avec vos mots','description','textarea',{value:d.description,placeholder:'Ce que vous souhaitez faire, la pièce concernée, ce qui est déjà en place…',required:false}));const content=()=>Object.assign(d,formValue(form));form.addEventListener('input',content);form.addEventListener('change',content);form.append(el('div',{class:'helper'},el('strong',{text:'Vous n’avez pas besoin de connaître le bon terme.'}),el('p',{text:'Recherchez un mot courant ou choisissez « Je ne sais pas ». Les suggestions restent à confirmer.'})));const suggestion=button('Me suggérer des métiers',()=>{const words=normalize(d.description+' '+d.title);const matches=catalog.filter(t=>[t.label,...t.synonyms].some(w=>w.length>3&&words.includes(normalize(w))));const b=el('div',{},el('p',{text:matches.length?'Suggestions par mots-clés : choisissez celles qui correspondent à vos travaux.':'Aucune suggestion fiable. Vous pouvez utiliser le choix « Je ne sais pas ».'}));for(const t of matches.slice(0,6))b.append(button(t.label,()=>{if(!d.trades.includes(t.id)&&d.trades.length<12){d.trades.push(t.id);queueDraftAutosave(d,true)}$('#dialog').close();wizard()}));showDialog('Pour vous aider à choisir',b)},'link');const selector=el('details',{class:'wizard-trade-picker'},el('summary',{text:'Choisir les métiers concernés'}),tradePicker([...d.trades],v=>{d.trades=v;queueDraftAutosave(d,true)}));selector.open=!!d.trades.length;form.append(suggestion,selector)}
if(wizardStep===2){form.append(field('Dans quelle commune ?','town','text',{value:d.town,placeholder:'Toulouse',maxlength:90}),field('Quand souhaitez-vous commencer ?','timing','select',{value:d.timing,options:{flexible:'Je suis flexible',month:'Dans le mois',quarter:'Dans les trois mois',urgent:'Dès que possible'}}),el('p',{class:'hint',text:'Indiquez seulement la commune. L’adresse précise se partage après sélection.'}));form.append(el('h3',{text:'Votre budget · facultatif'}),el('p',{class:'hint',text:'Montants indicatifs en euros entiers, sans valeur de devis. Vous pouvez laisser les deux champs vides. Aucun paiement dans UCP.'}),el('div',{class:'budget-fields'},amountField('Minimum facultatif (€)','budget_min',d.budget_min),amountField('Maximum facultatif (€)','budget_max',d.budget_max)));const details=()=>{const v=formValue(form);Object.assign(d,{town:v.town,timing:v.timing,budget_min:amountValue(v.budget_min),budget_max:amountValue(v.budget_max)})};form.addEventListener('input',details);form.addEventListener('change',details);form.append(el('h3',{text:'Des photos pour mieux comprendre'}),el('p',{class:'hint',text:'Facultatif · 5 photos maximum, 4 Mo par photo. Photos fictives uniquement. Elles seront visibles après votre sélection.'}));const upload=el('input',{type:'file',accept:'image/jpeg,image/png,image/webp','aria-label':'Ajouter une photo de test'});upload.addEventListener('change',async()=>{const file=upload.files[0];if(!file)return;if(file.size>4000000){msg('La photo dépasse 4 Mo.','error');return}const r=await action(async()=>{await saveDraft();const b64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(file)});const p=await api('/v4/drafts/'+d.id+'/photos',{method:'POST',body:{data:b64}});d.photos.push(p.id);d.version=p.version;return p},'Photo enregistrée.');if(r)wizard()});form.append(upload,el('div',{class:'photos'},...d.photos.map(id=>el('div',{class:'photo'},el('img',{src:'/api/v4/photos/'+id,alt:'Photo de votre demande'}),button('Retirer',async()=>{const r=await action(async()=>{await saveDraft();return api('/v4/photos/'+id,{method:'DELETE'})});if(r){d.photos=d.photos.filter(x=>x!==id);d.version=r.version;wizard()}}))))) }
if(wizardStep===3){const rev=el('div',{class:'review'},el('h3',{text:d.title}),el('dl',{},el('dt',{text:'Travaux concernés'}),el('dd',{text:d.trades.map(x=>trades[x]).join(' · ')}),el('dt',{text:'Commune'}),el('dd',{text:d.town}),el('dt',{text:'Description'}),el('dd',{text:d.description}),el('dt',{text:'Début souhaité'}),el('dd',{text:timingNames[d.timing]||'Date flexible'}),el('dt',{text:'Budget indicatif'}),el('dd',{text:budgetText(d)}),el('dt',{text:'Photos privées'}),el('dd',{text:d.photos.length+' photo(s), partagées après sélection'})));form.append(rev,el('label',{},el('input',{type:'checkbox',required:true,name:'confirmed'}),'J’ai vérifié ma demande et elle ne contient aucune coordonnée directe.'))}
form.addEventListener('input',()=>queueDraftAutosave(d,true));form.addEventListener('change',()=>queueDraftAutosave(d,true));
const foot=el('div',{class:'wizard-footer'},button(wizardStep===1?'Enregistrer mon brouillon':'← Précédent',async()=>{if(wizardStep>1){const saved=await action(saveDraft);if(saved){wizardStep--;wizard();focusPageHeading()}return}const r=await action(saveDraft,'Brouillon enregistré dans votre compte.');if(r){stopDraft();go('projects')}},'outline'),el('button',{class:'primary',type:'submit',text:wizardStep===3?'Publier ma demande →':'Continuer →'}));form.append(foot);form.addEventListener('submit',async e=>{e.preventDefault();if(wizardStep===1&&(!d.trades.length||d.title.trim().length<5||d.description.trim().length<20)){if(!d.trades.length){const picker=form.querySelector('.wizard-trade-picker');if(picker)picker.open=true}msg('Indiquez un titre, décrivez vos travaux et sélectionnez au moins un métier (ou « Je ne sais pas »).','error');return}const r=await action(async()=>{await saveDraft();if(wizardStep===3)return await api('/v4/drafts/'+d.id+'/publish',{method:'POST',body:{version:d.version}});return true});if(r){if(wizardStep===3){UCPAnalytics.track('project_published');stopDraft();await render();msg('Votre demande est publiée dans cet environnement de test.','success')}else{wizardStep++;UCPAnalytics.track('project_step_completed',{step:wizardStep-1});wizard();focusPageHeading()}}})}
async function renderProfile(n){n.append(button('Poser une question à l’assistant',openGuidedHelp,'link'));n.append(heading('Votre savoir-faire, bien présenté.','Indiquez vos spécialités et vos communes pour recevoir les bonnes demandes.'));const {profile:p}=await api('/my-profile');const selected=p?[p.trade,...p.additional_trades]:[];const form=el('form',{},field('Votre commune principale','town','text',{value:p?.town||'Toulouse',maxlength:90}),field('Autres communes · séparées par des virgules','zones','text',{value:(p?.service_zones||[]).filter(x=>x!==p.town).join(', '),required:false,placeholder:'Blagnac, Colomiers, Balma'}),field('SIREN de test','siren','text',{value:p?.siren||'',maxlength:9,minlength:9,placeholder:'123456782'}),el('p',{class:'hint',text:'Le format du numéro est contrôlé. L’existence de l’entreprise et ses assurances ne sont pas vérifiées.'}),el('h3',{text:'Vos spécialités · 5 maximum'}),tradePicker(selected,v=>{selected.splice(0,selected.length,...v)},true),el('button',{type:'submit',class:'primary',text:'Enregistrer mon profil →'}));form.addEventListener('submit',async e=>{e.preventDefault();if(!selected.length||selected.length>5){msg('Choisissez entre un et cinq métiers.','error');return}const v=formValue(form);const r=await action(()=>api('/profile',{method:'POST',body:{trade:selected[0],additional_trades:selected.slice(1),town:v.town,siren:v.siren,service_zones:v.zones.split(',').map(s=>s.trim()).filter(Boolean)}}),'Profil enregistré. Il doit être examiné par l’administrateur.');if(r)render()});n.append(el('div',{class:'status-note',text:p?(p.approved?'Profil autorisé pour les tests. Aucune certification réelle.':'Profil en attente de revue.'):'Complétez votre profil pour participer aux tests.'}),el('section',{class:'panel'},form));if(p)await renderShowcaseManagement(n)}
async function renderApplications(n){
 n.append(heading('Vos candidatures.','Suivez vos réponses et les possibilités d’échange pour chaque projet.'));
 const items=(await api('/my-applications')).items;
 if(!items.length){n.append(empty('Tout commence par un projet.','Parcourez les demandes qui correspondent à vos métiers.','Trouver un projet',()=>go('projects')));return}
 const count=fn=>items.filter(fn).length;
 n.append(el('div',{class:'stat-grid'},...[
  ['En attente',count(a=>a.status==='pending'&&a.project_status!=='closed')],
  ['Sélectionnées · projet non clôturé',count(a=>a.status==='accepted'&&a.project_status!=='closed')],
  ['Projets terminés',count(a=>a.project_status==='closed')]
 ].map(([text,value])=>el('div',{class:'stat'},el('strong',{text:value}),text))));
 const filter=field('Afficher les candidatures','application_status','select',{required:false,options:{all:'Toutes',pending:'En attente',accepted:'Sélectionnées · projet non clôturé',rejected:'Non retenues',withdrawn:'Retirées',closed:'Projets terminés',cancelled:'Projets annulés',suspended:'Projets suspendus'}});
 const list=el('div',{'aria-live':'polite'});n.append(filter,list);
 const explanations={not_selected:'La messagerie s’ouvre après sélection et selon les droits de test actifs.',closed:'Projet clôturé : les échanges sont fermés.',project_suspended:'Le demandeur a suspendu le projet. Les échanges sont interrompus jusqu’à sa reprise.',unavailable:'L’accès aux échanges est actuellement suspendu. Consultez votre profil ou contactez l’assistance.',linked_inactive:'Le profil lié est inactif. Consultez Mon entreprise.',test_access_required:'Candidature sélectionnée. L’accès messagerie de test doit être activé par l’administrateur.',available:'Vous pouvez échanger avec le demandeur.'};
 function draw(){
  clear(list);const value=filter.querySelector('select').value;
  const visible=items.filter(a=>value==='all'||(value==='closed'&&a.project_status==='closed')||
   (value==='cancelled'&&a.project_cancelled)||(value==='suspended'&&a.project_suspended)||(a.status===value&&(!['pending','accepted'].includes(value)||a.project_status!=='closed')));
  if(!visible.length){list.append(el('p',{class:'status-note',text:'Aucune candidature pour ce filtre.'}));return}
  for(const a of visible){
   const state=a.conversation_state||(a.status==='accepted'?'unavailable':'not_selected');
   const card=panel(a.title);
   card.id='application-'+a.id;card.tabIndex=-1;
   card.append(el('p',{class:'muted',text:(trades[a.trade]||a.trade)+' · '+a.town}));
   if(!a.project_cancelled||a.status!=='rejected')card.append(badge(a.status));
   if(a.project_status==='closed')card.append(el('span',{class:'chip',text:a.project_cancelled?'Projet annulé':'Projet clôturé'}));
   if(a.project_suspended)card.append(el('span',{class:'chip amber',text:'Projet suspendu'}));
   if(a.project_paused&&!a.project_suspended&&a.project_status==='open')card.append(el('p',{class:'status-note',text:'Le demandeur a mis les nouvelles candidatures en pause. Votre candidature est conservée ; vous pouvez encore la retirer si elle est en attente.'}));
   if(a.linked_artisan_alias)card.append(el('p',{class:'small',text:'Candidature pour le profil lié « '+a.linked_artisan_alias+' »'}));
   if(a.submitted_at)card.append(el('p',{class:'small muted',text:'Envoyée le '+new Date(a.submitted_at).toLocaleString('fr-FR')}));
   if(a.status==='pending'||a.status==='accepted'||state==='closed')card.append(el('p',{class:'hint',text:a.project_cancelled?'Projet annulé par le demandeur. Les échanges sont fermés.':explanations[state]||explanations.unavailable}));
   if(a.status==='pending')card.append(button('Retirer ma candidature',()=>ask('Retirer cette candidature ?','Elle ne pourra pas être renvoyée sur ce projet dans ce laboratoire.',()=>api('/applications/'+a.id+'/withdraw',{method:'POST'}))));
   if(a.status==='accepted'&&state==='project_suspended')card.append(button('Signaler cet échange',()=>report('conversation',a.id),'link'));
   if(a.status==='accepted'&&['available','linked_inactive','test_access_required'].includes(state))card.append(button(state==='available'?'Ouvrir mes messages':'Consulter l’état de mes échanges',()=>go('conversations'),'secondary'));
   list.append(card);
  }
 }
 filter.querySelector('select').addEventListener('change',draw);draw();
}
async function renderConversations(n){n.append(heading('Vos échanges, au même endroit.','Les conversations sont privées et liées à un projet.'));const items=(await api('/conversations')).items;if(!items.length){n.append(empty('Pas encore de conversation.','La messagerie devient disponible après sélection et activation des droits de test du professionnel.'));return}const list=el('div',{class:'conversation-list'}),chat=el('section',{class:'chat'},el('p',{text:'Choisissez un échange pour retrouver les messages.'}));n.append(el('div',{class:'messages'},list,chat));for(const a of items)list.append(button(a.title+' · '+a.peer,()=>openChat(chat,a)))}
async function openChat(n,a){
  const epoch=++chatEpoch;clearInterval(chatTimer);chatTimer=null;clear(n);
  const valid=()=>epoch===chatEpoch;
  n.append(el('h3',{text:a.peer}),el('p',{class:'small muted',text:a.title}));
  const log=el('div',{class:'chat-log','aria-live':'polite','aria-label':'Messages'});
  const send=el('button',{type:'submit',class:'primary',text:'Envoyer le message →',disabled:true});
  const form=el('form',{},field('Votre message','body','textarea',{maxlength:2000}),send);
  const status=el('p',{class:'status-note chat-status',role:'status',hidden:true});
  const retry=button('Réessayer de charger les messages',()=>refresh());retry.hidden=true;
  n.append(log,status,retry,form,button('Signaler cette conversation',()=>report('conversation',a.application_id),'link'));
  let last='',pending=null,busy=false,blocked=true,timer=null;
  function stop(){if(timer)clearInterval(timer);if(chatTimer===timer)chatTimer=null;timer=null}
  function poll(){if(!timer&&valid()){timer=setInterval(()=>{if(!valid()||!document.contains(n))stop();else if(!document.hidden)refresh()},7000);chatTimer=timer}}
  async function refresh(){
    if(!valid()||busy)return;busy=true;retry.disabled=true;
    try{
      const r=await api('/conversations/'+a.application_id+'/messages');if(!valid())return;
      blocked=false;send.disabled=false;status.hidden=true;retry.hidden=true;
      const key=JSON.stringify(r);
      if(key!==last){last=key;clear(log);
        if(!r.items.length)log.append(el('p',{class:'muted small',text:'Présentez-vous et posez vos premières questions.'}));
        for(const x of r.items)log.append(el('div',{class:'bubble '+(x.sender_id===appState.user.id?'mine':'')},el('p',{class:'case-text',text:x.body}),el('time',{text:new Date(x.created_at).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}),x.id?button('Signaler ce message',()=>report('message',x.id),'link report-message'):null));
        log.scrollTop=log.scrollHeight;
      }
      poll();
    }catch(e){
      if(!valid())return;stop();blocked=true;send.disabled=true;
      if(e.status===403||e.status===404){clear(log);last='';}
      // Keep both the last rendered messages and the unsent text in this page.
      status.textContent=e.message+' Votre saisie reste dans cette page. Aucun message n’est renvoyé automatiquement.';
      status.hidden=false;retry.hidden=false;
    }finally{busy=false;retry.disabled=false}
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(acting||blocked||!valid())return;
    const body=formValue(form).body.trim();if(!body)return;
    if(!pending||pending.body!==body)pending={body,key:crypto.randomUUID()};
    const r=await action(()=>api('/conversations/'+a.application_id+'/messages',{method:'POST',body:{body},idempotencyKey:pending.key}));
    if(r&&valid()){pending=null;form.reset();await refresh()}
  });
  await refresh();
}

function report(kind,id){const f=el('form',{},field('Que se passe-t-il ?','reason','textarea',{minlength:10,maxlength:1000,placeholder:'Décrivez le problème pour aider la modération.'}),el('button',{type:'submit',class:'primary',text:'Envoyer mon signalement'}));f.addEventListener('submit',async e=>{e.preventDefault();const r=await action(()=>api('/v4/reports',{method:'POST',body:{kind,target_id:id,reason:formValue(f).reason}}),'Signalement enregistré. Suivez sa réponse dans Assistance.');if(r)$('#dialog').close()});showDialog('Signaler un problème',f)}


function newSupportRequest(categories){
  const form=el('form',{},el('p',{class:'hint',text:'Données fictives uniquement. Ne transmettez aucun mot de passe, code d’accès ou document personnel. Le support de préproduction ne promet aucun délai et n’envoie pas d’email.'}),
    field('Objet de votre demande','subject','text',{minlength:5,maxlength:120}),field('Thème','category','select',{options:{'':'Choisissez un thème',...categories}}),
    field('Expliquez votre demande','body','textarea',{minlength:10,maxlength:2000}),el('button',{type:'submit',class:'primary',text:'Envoyer ma demande'}));
  form.addEventListener('submit',async e=>{e.preventDefault();const result=await action(()=>api('/v4/support',{method:'POST',body:formValue(form)}),'Demande enregistrée. Retrouvez son suivi dans Assistance.');if(result){$('#dialog').close();await render()}});
  showDialog('Contacter le support',form);
}
async function renderOwnSupport(n){
  const data=await api('/v4/support');
  const box=panel('Demandes d’assistance','Pour une question générale liée à votre compte ou à l’utilisation de la plateforme.'),list=el('div'),more=el('div');
  box.append(button('Nouvelle demande d’assistance',()=>newSupportRequest(data.categories),'primary'),button('Actualiser le suivi',()=>action(async()=>{await render();return {ok:true}})),list,more);n.append(box);
  function draw(page){
    if(!list.childNodes.length&&!page.items.length)list.append(el('p',{class:'muted',text:'Aucune demande d’assistance pour le moment.'}));
    for(const t of page.items){const item=el('article',{class:'item'},el('h4',{text:'#'+t.id+' · '+t.subject}),
      el('span',{class:'chip '+(t.status==='open'?'amber':'green'),text:t.status==='open'?'À examiner':'Réponse disponible'}),
      el('p',{class:'small muted',text:(page.categories[t.category]||t.category)+' · '+new Date(t.created_at).toLocaleString('fr-FR')}),el('p',{class:'case-text',text:t.body}));
      if(t.response)item.append(el('h4',{text:'Réponse du support'}),el('p',{class:'case-text',text:t.response}));list.append(item);
    }
    clear(more);if(page.next_before_id)more.append(button('Voir les demandes plus anciennes',()=>action(async()=>draw(await api('/v4/support?before_id='+page.next_before_id)))));
  }
  draw(data);
}
async function renderSupportQueue(n){
  const data=await api('/v4/admin/support'),box=panel('Demandes d’assistance à examiner','Le détail n’est ouvert qu’après saisie d’un motif de consultation.'),list=el('div'),more=el('div');
  box.append(list,more);n.append(box);
  function draw(page){
    if(!list.childNodes.length&&!page.items.length)list.append(el('p',{text:'Aucune demande d’assistance ouverte.'}));
    for(const t of page.items)list.append(el('article',{class:'item'},el('h4',{text:'Demande #'+t.id+' · '+t.subject}),
      el('p',{class:'small muted',text:(page.categories[t.category]||t.category)+' · '+new Date(t.created_at).toLocaleString('fr-FR')}),
      button('Examiner la demande',()=>reviewSupportTicket(t.id,page.categories))));
    clear(more);if(page.next_before_id)more.append(button('Voir les demandes plus anciennes',()=>action(async()=>draw(await api('/v4/admin/support?before_id='+page.next_before_id)))));
  }
  draw(data);
}
function reviewSupportTicket(id,categories){
  const form=el('form',{},el('p',{class:'hint',text:'Votre consultation du dossier et son motif sont journalisés. Aucun contenu privé non lié à cette demande n’est chargé.'}),
    field('Motif de consultation interne','reason','textarea',{minlength:10,maxlength:500}),el('button',{type:'submit',class:'primary',text:'Ouvrir la demande'}));
  form.addEventListener('submit',async e=>{e.preventDefault();const dialogToken=dialogEpoch;const result=await action(()=>api('/v4/admin/support/'+id+'/review',{method:'POST',body:formValue(form)}));if(!result||dialogToken!==dialogEpoch||!$('#dialog').open)return;
    const t=result.ticket,detail=el('div',{},el('h4',{text:t.subject}),el('p',{class:'small muted',text:t.owner_name+' · '+(categories[t.category]||t.category)}),el('p',{class:'case-text',text:t.body}),
      el('p',{class:'hint',text:'Votre réponse sera visible uniquement par l’auteur dans Assistance. Ne recopiez aucun mot de passe ou renseignement privé d’un autre compte.'}),
      button('Répondre et clôturer la demande',()=>adminDecision('Répondre à la demande #'+id,'/v4/admin/support/'+id+'/resolve',true,'Réponse à l’auteur · visible dans Assistance'),'primary'));
    showDialog('Demande d’assistance #'+id,detail);
  });
  showDialog('Examiner la demande #'+id,form);
}
function reportKind(kind){return {project:'Projet',conversation:'Conversation',message:'Message'}[kind]||kind}
async function renderSupport(n){
  n.append(heading('Vos demandes et réponses.','Retrouvez ici le suivi de vos demandes et signalements.'));
  await renderOwnSupport(n);
  n.append(el('p',{class:'hint',text:'Pour signaler un problème, utilisez le bouton du projet, du message ou de la conversation concernés. Cette préproduction ne propose pas de support par email ni de délai de réponse garanti.'}));
  const list=el('div'),more=el('div');n.append(list,more);
  async function load(before=null){
    const data=await api('/v4/reports'+(before?'?before_id='+before:''));
    if(!before&&!data.items.length)list.append(empty('Aucun signalement.','Vos signalements et les réponses de l’équipe apparaîtront ici.'));
    for(const r of data.items){
      const card=panel('Signalement #'+r.id+' · '+reportKind(r.kind)+' #'+r.target_id);
      card.append(el('span',{class:'chip '+(r.status==='open'?'amber':'green'),text:r.status==='open'?'À examiner':'Réponse disponible'}),
        el('p',{class:'small muted',text:new Date(r.created_at).toLocaleString('fr-FR')}),
        el('h4',{text:'Votre demande'}),el('p',{class:'case-text',text:r.reason}));
      if(r.resolution)card.append(el('h4',{text:'Réponse de l’équipe'}),el('p',{class:'case-text',text:r.resolution}));
      list.append(card);
    }
    clear(more);if(data.next_before_id)more.append(button('Voir les signalements plus anciens',()=>action(()=>load(data.next_before_id))));
  }
  await load();
}
function reviewReport(report){
  const form=el('form',{},el('p',{class:'hint',text:'Accès limité au contenu signalé. Votre identité, le dossier et le motif de chaque consultation sont journalisés. Le contenu d’une conversation non signalée reste inaccessible.'}),
    field('Motif de consultation interne','reason','textarea',{minlength:10,maxlength:500}),
    el('button',{type:'submit',class:'primary',text:'Consulter le contenu signalé'}));
  form.addEventListener('submit',async e=>{
    e.preventDefault();const reason=formValue(form).reason;
    async function load(before=null){
      const dialogToken=dialogEpoch;const data=await api('/v4/admin/reports/'+report.id+'/review',{method:'POST',body:{reason,...(before?{before_id:before}:{})}});
      if(dialogToken!==dialogEpoch||!$('#dialog').open)return false;
      const detail=el('div',{},el('p',{class:'case-text',text:data.report.reason}),el('p',{class:'hint',text:'Chaque consultation est tracée. Ne recopiez aucune donnée privée dans la réponse au déclarant.'}));
      const ctx=data.context;
      if(ctx.project)detail.append(el('h4',{text:ctx.project.title}),el('p',{class:'case-text',text:ctx.project.description}),el('p',{text:ctx.project.town}));
      if(ctx.project?.photos?.length)detail.append(el('p',{class:'hint',text:'Chaque consultation de photo est privée, liée à ce dossier et journalisée.'}),el('div',{class:'row'},...ctx.project.photos.map((id,index)=>el('a',{href:'/api/v4/photos/'+id+'?report_id='+report.id,target:'_blank',rel:'noopener',class:'outline',text:'Consulter la photo privée '+(index+1)}))));
      for(const m of ctx.messages)detail.append(el('article',{class:'item'},el('h4',{text:m.sender_name+' · message #'+m.id}),el('p',{class:'case-text',text:m.body}),el('time',{class:'small muted',text:new Date(m.created_at).toLocaleString('fr-FR')})));
      if(!ctx.project&&!ctx.messages.length)detail.append(el('p',{text:'Le contenu n’est plus disponible ou aucun message ne figure dans cette période.'}));
      if(ctx.next_before_id)detail.append(button('Consulter les messages plus anciens',()=>action(()=>load(ctx.next_before_id))));
      detail.append(button('Répondre et clôturer le signalement',()=>adminDecision('Répondre au signalement #'+report.id,'/v4/admin/reports/'+report.id+'/resolve',true,'Réponse au déclarant · visible dans Assistance'),'primary'));
      showDialog('Signalement #'+report.id+' · '+reportKind(report.kind),detail);return data;
    }
    await action(()=>load());
  });
  showDialog('Examiner le signalement #'+report.id,form);
}
async function renderNotifications(n){
 const epoch=renderEpoch,actor=appState.user,valid=()=>epoch===renderEpoch;
 n.append(heading('Votre actualité UCP.','Retrouvez les candidatures, sélections, messages et réponses de l’assistance.'));
 const count=el('p',{class:'status-note','aria-live':'polite',text:'Chargement du compteur…'});
 const filter=field('Afficher les notifications','notification_filter','select',{required:false,options:{all:'Toutes',unread:'Non lues'}}),select=filter.querySelector('select');
 const applied=el('p',{class:'hint'}),status=el('p',{class:'hint',role:'status',hidden:true}),list=el('div'),more=el('div');
 let cursor=null,requestEpoch=0,appliedFilter='all',readers=new Map();
 const markAll=button('Tout marquer comme lu',async()=>{const result=await action(()=>api('/notifications/read-all',{method:'POST'}));if(result&&valid())await load(true)});markAll.disabled=true;
 n.append(count,el('div',{class:'row'},filter,button('Actualiser',()=>load(true)),markAll),applied,status,list,more);
 function counter(value){count.textContent=value+' notification(s) non lue(s)';markAll.disabled=value===0}
 function empty(){if(!readers.size&&!list.querySelector('.notification-empty'))list.append(el('p',{class:'notification-empty muted',text:'Aucune notification dans cette page.'}))}
 function add(note){
  if(readers.has(note.id))return;
  const flag=el('span',{class:'chip '+(!note.read_at?'violet':''),text:note.read_at?'Lue':'Non lue'});
  const card=el('article',{class:'item'},el('p',{text:note.message}),el('time',{class:'small muted',text:new Date(note.created_at).toLocaleString('fr-FR')}),flag);
  if(['project_updated','project_cancelled','project_suspended','project_resumed'].includes(note.event_type)&&actor.role==='professional'){
   card.append(button('Voir ma candidature',async()=>{
    await go('applications');
    if(appState.user===actor&&appState.view==='applications')document.getElementById('application-'+note.entity_id)?.focus();
   }));
  }
  let done=!!note.read_at;const read=button('Marquer comme lue',async()=>{
   if(done||!valid())return;
   const result=await action(()=>api('/notifications/'+note.id+'/read',{method:'POST'}));
   if(!result||!valid()||readers.get(note.id)!==finishRead)return;
   finishRead();if(Number.isInteger(result.unread))counter(result.unread);empty();
  });
  read.setAttribute('aria-label','Marquer comme lue : '+note.message);
  function finishRead(){done=true;read.remove();flag.textContent='Lue';flag.className='chip';if(appliedFilter==='unread'){card.remove();readers.delete(note.id)}}
  if(!done)card.append(read);readers.set(note.id,finishRead);list.append(card);
 }
 async function load(reset){
  if(!valid())return false;
  if(!reset&&!cursor)return false;
  if(!reset&&select.value!==appliedFilter)return load(true);
  const token=++requestEpoch,choice=select.value;
  const query=new URLSearchParams();if(choice==='unread')query.set('unread_only','true');if(!reset)query.set('before_id',cursor);
  status.hidden=false;status.textContent='Chargement des notifications…';clear(more);
  try{
   const encoded=query.toString();const data=await api('/notifications'+(encoded?'?'+encoded:''));if(!valid()||token!==requestEpoch)return false;
   if(!Array.isArray(data.items)||!Number.isInteger(data.unread))throw Error('Réponse de notifications incomplète');
   if(reset){clear(list);readers=new Map()}list.querySelector('.notification-empty')?.remove();
   appliedFilter=choice;applied.textContent=choice==='unread'?'Affichage : notifications non lues.':'Affichage : toutes les notifications.';
   counter(data.unread);for(const note of data.items)add(note);cursor=data.next_before_id||null;empty();status.hidden=true;
   if(cursor)more.append(button('Voir les notifications plus anciennes',()=>load(false)));
   return {ok:true};
  }catch(e){
   if(e.stale||e.status===401||!valid()||token!==requestEpoch)return false;
   status.hidden=false;status.textContent='Impossible de charger les notifications. Les résultats précédents restent affichés.';
   more.append(button('Réessayer le chargement',()=>load(reset)));return false;
  }
 }
 select.addEventListener('change',()=>load(true));await load(true);
}
async function renderAdmin(n){n.append(heading('Le pouls de votre bêta.','Indicateurs calculés sur les données de test. Aucun chiffre commercial.'));const m=(await api('/admin/metrics')).counts;n.append(el('div',{class:'stat-grid'},...[['Demandes',m.projects],['Candidatures',m.applications],['Mises en relation',m.accepted_applications],['Messages',m.messages]].map(([t,v])=>el('div',{class:'stat'},el('strong',{text:v}),t))));const queue=(await api('/admin/queue')).items;const box=panel('Profils professionnels','La revue autorise le scénario de test ; elle ne vérifie ni l’activité ni l’assurance.');for(const p of queue)box.append(el('div',{class:'item'},el('h4',{text:p.name}),el('p',{class:'small muted',text:(trades[p.trade]||p.trade)+' · '+p.town}),el('div',{class:'row'},badge(p.approved?'Autorisé en test':'À examiner'),button(p.approved?'Suspendre le profil':'Autoriser les tests',async()=>{const r=await action(()=>api('/admin/professionals/'+p.id+(p.approved?'/suspend':'/approve'),{method:'POST'}));if(r)render()}),p.approved&&!p.subscription_active?button('Activer l’accès messagerie de test',async()=>{const r=await action(()=>api('/admin/professionals/'+p.id+'/activate-test-subscription',{method:'POST'}));if(r)render()}):null)));if(!queue.length)box.append(el('p',{text:'Aucun profil à examiner.'}));n.append(box);const audit=panel('Journal d’audit','Actions sensibles enregistrées par le serveur.');for(const e of(await api('/admin/audit')).items.slice(0,20))audit.append(el('p',{class:'mini',text:e.created_at+' · '+e.action+' · #'+e.target_id}));n.append(audit)}
function classifyProject(p){let selected=[];const f=el('form',{},el('p',{text:p.description}),tradePicker(selected,v=>selected=v,true),field('Motif du classement','reason','textarea',{minlength:10,maxlength:500}),el('button',{type:'submit',class:'primary',text:'Confirmer les métiers'}));f.addEventListener('submit',async e=>{e.preventDefault();const r=await action(()=>api('/v4/admin/projects/'+p.id+'/classify',{method:'POST',body:{trades:selected,reason:formValue(f).reason}}),'Besoin classé et rendu accessible aux métiers concernés.');if(r){$('#dialog').close();render()}});showDialog('Classer ce besoin après lecture',f)}
function adminDecision(title,path,value,label='Motif de la décision'){const f=el('form',{},field(label,'reason','textarea',{minlength:10,maxlength:500}),el('button',{class:'primary',type:'submit',text:'Enregistrer la décision'}));f.addEventListener('submit',async e=>{e.preventDefault();const r=await action(()=>api(path,{method:'POST',body:{value,reason:formValue(f).reason}}),'Décision appliquée et journalisée.');if(r){$('#dialog').close();render()}});showDialog(title,f)}
async function renderModeration(n){n.append(heading('Un espace de confiance.','Signalez, examinez et agissez avec une trace de chaque décision.'));await renderSupportQueue(n);const d=await api('/v4/admin');const reports=panel('Signalements à examiner');for(const r of d.reports.filter(x=>x.status==='open'))reports.append(el('div',{class:'item'},el('h4',{text:'Signalement #'+r.id+' · '+reportKind(r.kind)+' #'+r.target_id}),el('p',{text:r.reason}),button('Examiner le signalement',()=>reviewReport(r))));if(!d.reports.some(x=>x.status==='open'))reports.append(el('p',{text:'Aucun signalement ouvert.'}));n.append(reports);const projects=panel('Demandes publiées');for(const p of d.projects)projects.append(el('div',{class:'item line'},el('strong',{text:p.title}),p.trade==='inconnu'?button('Classer le besoin',()=>classifyProject(p)):null,button(p.hidden?'Rendre visible':'Masquer',()=>adminDecision('Modérer la demande','/v4/admin/projects/'+p.id+'/hide',!p.hidden))));n.append(projects);const users=panel('Comptes utilisateurs');for(const u of d.users.filter(x=>x.role!=='admin'))users.append(el('div',{class:'item line'},el('strong',{text:u.name}),el('span',{class:'small',text:u.role}),button(u.suspended?'Rétablir le compte':'Suspendre le compte',()=>adminDecision('Gérer le compte','/v4/admin/users/'+u.id+'/suspend',!u.suspended))));n.append(users)}
async function renderCatalog(n){n.append(heading('Tous les savoir-faire ont leur place.','Ajoutez ou mettez à jour les métiers sans modifier le code.'));const form=el('form',{},field('Identifiant stable','id','text',{placeholder:'etude-thermique'}),field('Nom du métier','label','text',{placeholder:'Étude thermique'}),field('Grande catégorie','group','text',{placeholder:'Études et expertise'}),field('Synonymes · séparés par des virgules','synonyms','text',{required:false}),el('button',{type:'submit',class:'primary',text:'Enregistrer ce métier'}));form.addEventListener('submit',async e=>{e.preventDefault();const d=formValue(form);d.synonyms=d.synonyms.split(',').map(x=>x.trim()).filter(Boolean);d.active=true;const r=await action(()=>api('/v4/admin/catalog',{method:'PUT',body:d}),'Métier enregistré.');if(r){await loadCatalog();render()}});n.append(el('section',{class:'panel'},form));const all=(await api('/v4/admin')).taxonomy;for(const t of all)n.append(el('div',{class:'item line'},el('strong',{text:t.label}),el('span',{class:'small muted',text:t.group_name+' · '+t.id}),button(t.active?'Désactiver':'Réactiver',async()=>{const r=await action(()=>api('/v4/admin/catalog',{method:'PUT',body:{id:t.id,label:t.label,group:t.group_name,synonyms:JSON.parse(t.synonyms),active:!t.active}}));if(r){await loadCatalog();render()}})))}

async function renderEnterprise(target){
  const data=await api('/enterprise');
  const overview=panel('Entreprise multi-artisans fictive','Option A de laboratoire : un seul gestionnaire, des profils artisan sans comptes personnels. Ce n’est pas un produit Stripe.');
  if(!data.enterprise){
    const f=el('form');f.append(field('Nom fictif de l’entreprise','label','text',{minlength:3,placeholder:'Atelier UCP Test'}),
      el('button',{type:'submit',class:'primary',text:'Créer mon Entreprise de test'}));
    f.addEventListener('submit',async e=>{e.preventDefault();const result=await action(()=>api('/enterprise',{method:'POST',body:formValue(f)}),'Entreprise de démonstration créée.');if(result)await render()});
    overview.append(el('p',{class:'hint',text:'Vous devez d’abord enregistrer votre profil de gestionnaire et obtenir l’approbation fictive de l’administrateur.'}),f);
    target.append(overview);return;
  }
  const pr=data.pricing;
  overview.append(el('p',{text:data.enterprise.label}),
    el('div',{class:'line'},el('span',{class:'chip violet',text:pr.active_artisans+' profil(s) actif(s) dans la simulation'}),
      el('span',{class:'chip',text:pr.monthly_ht+' € HT/mois — SIMULATION'})),
    el('p',{class:'quiet',text:'Calcul simulé : 20 € HT/mois de base + 15 € HT/mois par profil artisan actif, gestionnaire compris seulement s’il possède son propre profil actif. Aucun prorata ni prélèvement Stripe ; validation juridique et recette requises.'}));
  overview.append(el('p',{class:'quiet',text:pr.linked_artisans_active+' profils liés actifs · Gestionnaire artisan : '+(pr.manager_counted_as_artisan?'OUI (siège actif fictif)':'NON (gestion administrative seule)')}));
  overview.append(button(pr.manager_counted_as_artisan?'Désactiver mon siège artisan fictif':'Activer mon siège artisan fictif',async()=>{
    const result=await action(()=>api('/enterprise/manager-profile',{method:'POST',body:{active:!pr.manager_counted_as_artisan}}),'Mode gestionnaire de test actualisé, sans paiement.');
    if(result)await render();
  }));
  target.append(overview);
  const formBox=panel('Ajouter un profil artisan fictif','Un profil lié représente une spécialité gérée par le compte Entreprise ; aucun login supplémentaire n’est créé.');
  const f=el('form');f.append(field('Alias du profil','alias','text',{minlength:3,placeholder:'Équipe menuiserie test'}),
    field('Métiers (codes séparés par des virgules)','trades','text',{placeholder:'menuiserie, peinture'}),
    field('Communes (séparées par des virgules)','zones','text',{placeholder:'Toulouse, Blagnac'}),
    el('button',{type:'submit',class:'primary',text:'Ajouter un profil de test'}));
  f.addEventListener('submit',async e=>{e.preventDefault();const v=formValue(f);const body={alias:v.alias,trades:v.trades.split(',').map(x=>x.trim()).filter(Boolean),zones:v.zones.split(',').map(x=>x.trim()).filter(Boolean)};const result=await action(()=>api('/enterprise/artisans',{method:'POST',body}),'Profil artisan fictif ajouté.');if(result)await render()});
  formBox.append(f);target.append(formBox);
  const profiles=panel('Artisans liés à l’entreprise','Désactiver un profil retire ses candidatures en attente et bloque le chat de ses candidatures sélectionnées. Les participants concernés sont informés dans leurs notifications internes.');
  if(!data.members.length)profiles.append(el('p',{class:'empty',text:'Aucun profil artisan lié à ce compte de test.'}));
  for(const x of data.members){
    const line=el('div',{class:'item'},el('h4',{text:x.alias}),el('p',{text:x.trades.map(x=>trades[x]||x).join(' · ')+' — '+x.zones.join(', ')}),
      el('span',{class:'chip',text:x.is_active?'Actif — facturation fictive':'Inactif — non comptabilisé'}));
    line.append(button(x.is_active?'Désactiver ce profil':'Réactiver ce profil',()=>ask(
      x.is_active?'Désactiver ce profil lié ?':'Réactiver ce profil lié ?',
      x.is_active?'Les candidatures en attente de « '+x.alias+' » seront retirées. Les sélections restent dans le suivi, mais leurs messages deviennent inaccessibles tant que ce profil est inactif. Les participants concernés recevront une notification interne. Aucun prélèvement réel.':'Les candidatures retirées ne seront pas rétablies. Le chat sera de nouveau contrôlé selon toutes les autorisations ; la réactivation ne garantit pas son ouverture. Les participants concernés recevront une notification interne. Aucun prélèvement réel.',
      ()=>api(`/enterprise/artisans/${x.id}/set-active`,{method:'POST',body:{active:!x.is_active}})
    )));profiles.append(line);
  }
  target.append(profiles);
}

function passwordPanel(available){
 const box=panel('Mot de passe',available?'Enregistrez votre nouveau mot de passe, puis reconnectez-vous. Toutes les sessions seront fermées.':'Le mot de passe de ce compte de démonstration est géré par l’opérateur.');
 if(!available)return box;
 const current=el('input',{name:'current_password',type:'password',autocomplete:'current-password',maxlength:128,required:true});
 const next=el('input',{name:'new_password',type:'password',autocomplete:'new-password',minlength:12,maxlength:128,required:true});
 const confirm=el('input',{type:'password',autocomplete:'new-password',required:true});
 const form=el('form',{},el('label',{},'Mot de passe actuel',current),el('label',{},'Nouveau mot de passe (12 caractères minimum)',next),
  el('label',{},'Confirmer le nouveau mot de passe',confirm),el('button',{type:'submit',class:'primary',text:'Changer mon mot de passe'}));
 const resetValidity=()=>confirm.setCustomValidity('');
 next.addEventListener('input',resetValidity);
 confirm.addEventListener('input',resetValidity);
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(acting)return;
  if(next.value!==confirm.value){
   confirm.setCustomValidity('Les deux nouveaux mots de passe doivent être identiques.');
   confirm.reportValidity();
   return;
  }
  const result=await action(()=>api('/account/password',{method:'POST',body:formValue(form)}));
  form.reset();
  if(!result)return;
  await clearAccountSession();
  authTab(false);
  msg('Mot de passe modifié. Reconnectez-vous avec le nouveau mot de passe.','success');
 });
 box.append(form);
 return box;
}

async function renderPersonalData(target){
  target.append(heading('Mon compte','Retrouvez vos informations personnelles, les réglages de votre session et vos données.'));
  const box=panel('Mes informations','Données fictives uniquement dans cette préproduction privée.');
  const data=await api('/account/export');
  const form=el('form',{},field('Votre nom affiché','name','text',{value:data.user.name,minlength:2,maxlength:100}),el('button',{type:'submit',text:'Enregistrer mon nom',class:'outline'}));form.addEventListener('submit',async e=>{e.preventDefault();const r=await action(()=>api('/v4/account',{method:'PUT',body:formValue(form)}),'Nom enregistré.');if(r){appState.user.name=r.name;render()}});box.append(form);
  box.append(el('p',{text:`Compte : ${data.user.name} · ${data.user.email} · rôle ${data.user.role}`}));
  if(data.user.login_alias)box.append(el('p',{text:'Identifiant de connexion : '+data.user.login_alias}));
  box.append(el('p',{text:`Projets personnels : ${data.own_projects.length} · Candidatures : ${data.own_applications.length} · Messages écrits : ${data.own_messages.length}`}));
  const sessions=await api('/account/sessions');
  box.append(el('p',{class:'quiet',text:`Sessions actives dans ce laboratoire : ${sessions.active_sessions}`}));
  if(sessions.active_sessions>1)box.append(button('Déconnecter les autres sessions',async()=>{
    const result=await action(()=>api('/account/sessions/revoke-others',{method:'POST'}),'Les autres sessions ont été invalidées.');
    if(result)await render();
  }));
  const activity=await api('/account/activity');
  const log=panel('Mes actions de démonstration','Journal limité à vos 50 événements les plus récents ; aucune activité d’un autre compte.');
  if(!activity.items.length)log.append(el('p',{class:'empty',text:'Pas encore d’événement suivi.'}));
  for(const event of activity.items)log.append(el('p',{class:'mini',text:`${event.created_at} — ${event.action} — ${event.target_type} #${event.target_id}`}));
  box.append(button('Télécharger mon export JSON local',()=>{
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=el('a',{href:url,download:'ucp-lab-donnees-fictives.json'});
    document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
  }));
  const history=el('details',{class:'account-history'},el('summary',{text:'Afficher mon historique d’activité'}),log);
  target.append(box,passwordPanel(sessions.password_change_available),history);
}
async function loadCatalog(){catalog=(await api('/catalog')).items;for(const t of catalog)trades[t.id]=t.label}
let entrySpace='requester';
function selectEntrySpace(role,focus=false){
 if(!['requester','professional'].includes(role))return;
 entrySpace=role;const pro=role==='professional';
 $('#space-requester').setAttribute('aria-pressed',String(!pro));$('#space-professional').setAttribute('aria-pressed',String(pro));
 $('#welcome-eyebrow').textContent=pro?'ESPACE PROFESSIONNEL':'ESPACE PARTICULIER';
 clear($('#welcome-title')).append(pro?'Les bons chantiers.':'Les bons pros.',el('br'),pro?'Pour votre ': 'Pour vos ',el('span',{text:pro?'savoir-faire.':'projets de travaux.'}));
 $('#welcome-description').textContent=pro?'Trouvez les projets accessibles dans vos métiers et vos communes. Proposez votre candidature et suivez vos échanges.':'Décrivez vos travaux, comparez les candidatures et choisissez avec qui échanger.';
 const steps=pro?['Présentez vos métiers et vos communes','Trouvez des projets adaptés','Suivez vos candidatures et vos échanges']:['Décrivez votre besoin','Comparez les candidatures reçues','Choisissez et échangez avec le professionnel'];
 clear($('#welcome-steps')).append(...steps.map((text,i)=>el('p',{},el('b',{text:'0'+(i+1)}),text)));
 $('#auth-title').textContent=pro?'Votre espace professionnel.':'Votre espace particulier.';
 $('#auth-space').textContent=pro?'Votre activité, vos candidatures et vos messages.':'Vos demandes, vos brouillons et vos échanges.';
 $('#register-form [name=role]').value=role;
 $('#login-form [name=email]').placeholder='Votre identifiant ou email de test';
 if(!appState.user)document.body.dataset.space=role;
 if(focus)$('#auth-title').focus();
}
$('#space-requester').addEventListener('click',()=>selectEntrySpace('requester'));
$('#space-professional').addEventListener('click',()=>selectEntrySpace('professional'));
$('#register-form [name=role]').addEventListener('change',e=>selectEntrySpace(e.target.value));
selectEntrySpace(location.pathname==='/professionnel'?'professional':'requester');
function authTab(register){$('#tab-login').classList.toggle('selected',!register);$('#tab-register').classList.toggle('selected',register);$('#login-form').hidden=register;$('#register-form').hidden=!register;msg('')}
$('#tab-login').addEventListener('click',()=>authTab(false));$('#tab-register').addEventListener('click',()=>authTab(true));
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const r=await action(()=>api('/login',{method:'POST',body:formValue(e.currentTarget)}));if(r){$('#login-form [name=password]').value='';appState.user={id:r.user_id,name:r.name,role:r.role};appState.projectFilters=null;appState.csrf=r.csrf;appState.view=null;const token=renderEpoch+1;await render();if(token===renderEpoch)focusPageHeading()}});
$('#register-form').addEventListener('submit',async e=>{e.preventDefault();const d=formValue(e.currentTarget);const r=await action(()=>api('/register',{method:'POST',body:d}));if(r){$('#register-form [name=password]').value='';UCPAnalytics.track('account_created',{role:d.role});authTab(false);$('#login-form [name=email]').value=d.email;$('#login-form [name=password]').focus();msg('Votre compte de test est créé. Connectez-vous pour commencer.','success')}});
function clearAccountSession(){
 $('#login-form').reset();$('#register-form').reset();selectEntrySpace(entrySpace);
 $('#dialog').close();clear($('#dialog-content'));clear($('#view'));
 appState.user=null;appState.csrf=null;appState.view=null;appState.projectFilters=null;
 stopDraft();UCPAnalytics.reset();
 return render();
}
$('#logout').addEventListener('click',async()=>{const r=await action(()=>api('/logout',{method:'POST'}));if(r)await clearAccountSession()});
$('#navigation-toggle').addEventListener('click',()=>setNavigationOpen($('#navigation-toggle').getAttribute('aria-expanded')!=='true'));
$('.sidebar').addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#navigation-toggle').getAttribute('aria-expanded')==='true'){e.preventDefault();setNavigationOpen(false);$('#navigation-toggle').focus()}});
$('#dialog').addEventListener('close',()=>{if($('#dialog').open)return;const previous=dialogReturnFocus;dialogReturnFocus=null;if(previous?.isConnected&&!previous.disabled&&!previous.closest('[hidden],dialog:not([open])'))previous.focus();else focusPageHeading()});
$('#dialog-close').addEventListener('click',()=>$('#dialog').close());
$('#release-notes').addEventListener('click',()=>{
 const details=el('div',{class:'release-notes-dialog'},
  el('p',{text:'Mise à jour UX/UI du 6 novembre 2026. L’interface UCP conserve sa charte graphique ; voici les changements à retrouver dans votre espace.'}),
  el('ul',{},
   el('li',{text:'Accueil particulier : une prochaine étape adaptée à vos annonces, brouillons ou conversations. Les statistiques sont dans « Voir toute mon activité ».'}),
   el('li',{text:'Accueil professionnel : accès direct aux chantiers et à l’action prioritaire selon votre profil et vos candidatures.'}),
   el('li',{text:'Menu professionnel : quatre rubriques principales ; favoris, entreprise, compte et autres fonctions dans « Mon activité et réglages ».'}),
   el('li',{text:'Recherche : filtres particuliers et professionnels séparés ; métier et commune visibles en premier pour les professionnels.'}),
   el('li',{text:'Artisans : spécialités et zones plus lisibles ; informations détaillées repliables et vérifications non réalisées clairement signalées.'}),
   el('li',{text:'Navigation : le retour et l’avancement du navigateur fonctionnent entre les rubriques avec sauvegarde du brouillon avant de quitter.'})
  ),
  el('p',{class:'small muted',text:'Version 2026.11.06. Les modifications concernent les espaces connectés. Une partie des informations est accessible après ouverture des sections repliables.'})
 );
 showDialog('Les nouveautés UX/UI d’UCP',details);
});
$('#privacy-open').addEventListener('click',()=>showDialog('Vos données dans cette version',el('div',{},el('p',{text:'Cette version privée conserve les comptes, projets et messages dans la base de cet environnement (PostgreSQL en préproduction, SQLite en local). N’utilisez que des données fictives. Aucun traceur PostHog, enregistrement de session ou paiement n’est activé.'}),el('p',{text:'Les photos sont réencodées sans métadonnées GPS. Elles ne sont accessibles qu’à leur propriétaire, à la modération et au professionnel sélectionné autorisé.'}),el('p',{text:'L’export est disponible dans Mon compte. La suppression d’un compte ayant un historique nécessite une intervention opérateur. Les conditions et durées de conservation doivent être validées avant toute ouverture.'}))));
$('#reset-open').addEventListener('click',()=>{const f=el('form',{},el('p',{text:'Dans ce laboratoire, l’opérateur génère un code temporaire avec la commande recovery.py. Aucun email n’est envoyé. Saisissez le code ici.'}),field('Code de récupération','token','text',{minlength:20,maxlength:128}),field('Nouveau mot de passe','password','password',{minlength:12,maxlength:128}),el('button',{type:'submit',class:'primary',text:'Réinitialiser mon mot de passe'}));f.addEventListener('submit',async e=>{e.preventDefault();const r=await action(()=>api('/v4/account/reset',{method:'POST',body:formValue(f)}),'Mot de passe remplacé. Les anciennes sessions ont été révoquées.');if(r)$('#dialog').close()});showDialog('Récupérer votre accès',f)});
const guidedHelp=(window.UCPAssistantAI||window.UCPGuidedHelp)?.create({
 local:window.UCPLocalAI||{status:()=>({configured:false,reason:'Moteur local introuvable.'}),send:async()=>{throw Error('Moteur local introuvable.')},reset:()=>{}},
 search:async filters=>{
  const actor=appState.user;
  if(actor?.role!=='professional')return false;
  const allowed=new Set(catalog.filter(t=>t.active!==false).map(t=>t.id));
  if(filters.trade&&!allowed.has(filters.trade))return false;
  const values={};
  for(const k of ['q','trade','town','timing','published_within','budget_from','budget_to','sort'])if(filters[k]!=null&&filters[k]!=='')values[k]=filters[k];
  appState.projectFilters={owner:actor.id,values};
  $('#dialog').close();await go('projects');return true;
 },
 el,button,context:()=>{
  const actor=appState.user,role=actor?.role;
  return {actor,session:appState.csrf,role,catalog,wizardStep:currentDraft?wizardStep:null,
   draftContext:role==='requester'&&currentDraft?draftContent(currentDraft):null,
   searchContext:role==='professional'&&appState.projectFilters?.owner===actor.id?{...appState.projectFilters.values}:null};
 },
 show:content=>{
  showDialog('Yahya',content);
  $('#dialog-title').append(el('span',{class:'ai-chat-subtitle',text:'Assistant IA'}));
 },close:()=>$('#dialog').close(),
 navigate:async view=>{const allowed=appState.user?.role==='professional'?['profile','projects','favorites','applications','conversations','support']:['projects','conversations','support'];if(!allowed.includes(view))return;$('#dialog').close();await go(view)},
 apply:async proposal=>{
  const actor=appState.user,session=appState.csrf,previous=currentDraft,dialogToken=dialogEpoch;
  if(actor?.role!=='requester')return false;
  if(previous){const saved=await action(saveDraft);if(!saved)return false}
  if(actor!==appState.user||session!==appState.csrf||currentDraft!==previous||dialogToken!==dialogEpoch||!$('#dialog').open)return false;
  if(proposal.trades.some(id=>!catalog.some(t=>t.id===id&&t.active!==false)))return false;
  stopDraft();$('#dialog').close();appState.view='projects';menu();startWizard(proposal);return true;
 }
})||null;
function openGuidedHelp(){if(guidedHelp)guidedHelp.open();else msg('L’assistant n’a pas pu être chargé. Rechargez la page pour réessayer.','error')}

$('#chatbot-launcher').addEventListener('click',openGuidedHelp);
window.addEventListener('beforeunload',e=>{if(draftUnsaved()){e.preventDefault();e.returnValue=''}});
(async()=>{try{await loadCatalog();try{const me=await api('/session');appState.user=me;appState.csrf=me.csrf}catch{}await render()}catch(e){msg('Le serveur ne répond pas. Démarrez UCP puis rechargez cette page.','error')}})();
