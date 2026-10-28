'use strict';
const $=s=>document.querySelector(s);
const appState={user:null,csrf:null,view:null},trades={};
let catalog=[],renderEpoch=0,currentDraft=null,wizardStep=1,chatTimer=null,chatEpoch=0;
const labels={open:'Ouvert aux candidatures',selected:'Professionnel sélectionné',closed:'Clôturé',pending:'En attente',accepted:'Sélectionnée',rejected:'Non retenue',withdrawn:'Retirée'};
const icons={projects:'M4 7h16v14H4z M8 7V3h8v4 M4 12h16',messages:'M4 4h16v13H9l-5 4z',profile:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21v-2a7 7 0 0 1 14 0v2',new:'M12 4v16 M4 12h16',arrow:'M5 12h14 M13 6l6 6-6 6',check:'m5 12 4 4L19 6',settings:'M4 6h16 M4 12h16 M4 18h16',bell:'M6 16V9a6 6 0 0 1 12 0v7l2 2H4z M10 21h4'};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',icons[name]||icons.projects);svg.append(p);return svg}
function el(tag,attrs={},...children){const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k.startsWith('on'))n.addEventListener(k.slice(2).toLowerCase(),v);else if(k==='text')n.textContent=v;else if(['value','checked','hidden','disabled','required','selected'].includes(k))n[k]=v;else if(k==='class')n.className=v;else if(k==='htmlFor')n.htmlFor=v;else n.setAttribute(k,v)}for(const c of children.flat(Infinity))if(c!=null)n.append(c.nodeType?c:document.createTextNode(String(c)));return n}
function clear(n){n.replaceChildren();return n}function formValue(f){return Object.fromEntries(new FormData(f))}
function button(t,fn,cl='outline'){return el('button',{type:'button',class:cl,text:t,onClick:fn})}
function msg(t,kind=''){const n=$('#alert');n.textContent=t;n.className=kind;n.hidden=!t;if(t)n.focus({preventScroll:true})}
function field(t,name,type='text',o={}){const l=el('label',{},el('span',{text:t}));let n;if(type==='select'){n=el('select',{name});for(const[v,t]of Object.entries(o.options||{}))n.append(el('option',{value:v,text:t}))}else n=el(type==='textarea'?'textarea':'input',{name,...(type==='textarea'?{}:{type}),minlength:o.minlength||0,maxlength:o.maxlength||5000,placeholder:o.placeholder||''});n.required=o.required!==false;if(o.value!=null)n.value=o.value;l.append(n);return l}
function panel(t,p){const n=el('section',{class:'panel'},el('h3',{text:t}));if(p)n.append(el('p',{class:'muted small',text:p}));return n}
function empty(t,p,cta,fn){return el('section',{class:'empty'},el('h3',{text:t}),el('p',{text:p}),cta?button(cta,fn,'primary'):null)}
function heading(t,p,cta,fn){return el('div',{class:'page-head'},el('div',{},el('div',{class:'eyebrow',text:'UN COUP DE POUCE'}),el('h2',{text:t}),el('p',{text:p})),cta?button(cta,fn,'primary'):null)}
function badge(status){return el('span',{class:'chip '+({open:'green',accepted:'green',pending:'amber',selected:'violet'}[status]||''),text:labels[status]||status})}
function viewError(n,e){n.append(empty('Impossible de charger cette page',e.message,'Réessayer',render))}
async function api(path,o={}){const method=o.method||'GET',headers={Accept:'application/json'};if(method!=='GET')headers['x-ucp-csrf']=appState.csrf||'';if(o.body!=null)headers['Content-Type']='application/json';if(o.idempotencyKey)headers['Idempotency-Key']=o.idempotencyKey;let res;try{res=await fetch('/api'+path,{method,headers,credentials:'same-origin',body:o.body!=null?JSON.stringify(o.body):undefined,signal:AbortSignal.timeout(15000)})}catch{UCPAnalytics.track('technical_error',{kind:'network'});throw Object.assign(Error('Connexion interrompue. Vos saisies sont conservées dans cette page. Réessayez.'),{status:0,retryable:true})}let d;try{d=await res.json()}catch{d={}}if(!res.ok){if(res.status>=500)UCPAnalytics.track('technical_error',{kind:'server'});let t=d.detail||'Action impossible. Réessayez.';if(Array.isArray(t))t=t.map(x=>x.msg.replace('Value error, ','')).join(' · ');if(res.status===401&&appState.user){$('#dialog').close();clear($('#dialog-content'));clear($('#view'));currentDraft=null;appState.projectFilters=null;appState.user=null;appState.csrf=null;await render();t='Votre session a expiré. Reconnectez-vous.'}throw Object.assign(Error(t),{status:res.status,retryable:res.status>=500||res.status===408||res.status===429})}return d}
let acting=false;
async function action(fn,success){if(acting)return null;acting=true;msg('');const buttons=[...document.querySelectorAll('button:not([disabled])')];buttons.forEach(b=>b.disabled=true);try{const r=await fn();if(success)msg(success,'success');return r}catch(e){msg(e.message,'error');return null}finally{acting=false;buttons.forEach(b=>b.disabled=false)}}
async function go(v){if(currentDraft){const saved=await action(saveDraft,'Brouillon enregistré avant de changer de page.');if(!saved)return;currentDraft=null}appState.view=v;await render()}
function showDialog(title,content){const n=clear($('#dialog-content'));n.append(el('h3',{text:title}),content);$('#dialog').showModal()}
function ask(title,desc,fn){const body=el('div',{},el('p',{text:desc}),button('Confirmer',async()=>{const r=await action(fn);if(r){$('#dialog').close();await render()}},'primary'));showDialog(title,body)}
function menu(){const r=appState.user.role;const items=r==='requester'?[['projects','Mes projets','projects'],['conversations','Messages','messages']]:r==='professional'?[['projects','Trouver des projets','projects'],['applications','Mes candidatures','check'],['conversations','Messages','messages'],['profile','Mon profil','profile'],['enterprise','Mon entreprise','settings']]:[['admin','Vue d’ensemble','settings'],['moderation','Modération','projects'],['catalog','Métiers du bâtiment','settings']];items.push(['support','Assistance','messages'],['notifications','Notifications','bell'],['personal-data','Mon compte','profile']);const n=clear($('#tabs'));for(const[key,t,i]of items)n.append(el('button',{class:'navlink '+(appState.view===key?'active':''),type:'button','aria-current':appState.view===key?'page':'false',onClick:()=>go(key)},icon(i),t))}
async function render(){++chatEpoch;const epoch=++renderEpoch;clearInterval(chatTimer);chatTimer=null;const u=appState.user;$('#anonymous').hidden=!!u;$('#dashboard').hidden=!u;$('#logout').hidden=!u;if(!u)return;$('#actor-role').textContent={requester:'ESPACE PARTICULIER',professional:'ESPACE PROFESSIONNEL',admin:'ADMINISTRATION'}[u.role];$('#actor-title').textContent='Bonjour, '+u.name;if(!appState.view)appState.view=u.role==='admin'?'admin':'projects';menu();const target=clear($('#view'));target.append(el('div',{class:'loading',text:'Chargement de votre espace…'}));const fragment=document.createElement('div');try{const f={projects:renderProjects,applications:renderApplications,conversations:renderConversations,profile:renderProfile,enterprise:renderEnterprise,admin:renderAdmin,moderation:renderModeration,catalog:renderCatalog,support:renderSupport,notifications:renderNotifications,'personal-data':renderPersonalData}[appState.view];await f(fragment);if(epoch===renderEpoch)target.replaceChildren(...fragment.childNodes)}catch(e){if(epoch===renderEpoch){clear(target);viewError(target,e)}}}
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
  const who=p.match.profile==='linked'?'Profil lié « '+p.match.alias+' »':'Votre profil individuel';
  return el('p',{class:'match-reason small',text:who+' : '+p.match.trades.map(t=>trades[t]||t).join(' · ')+' ; commune couverte : '+p.match.town+'.'});
}
const timingNames={flexible:'Date flexible',month:'Dans le mois',quarter:'Dans les trois mois',urgent:'Dès que possible'};
async function renderProjects(n){
  const req=appState.user.role==='requester',epoch=renderEpoch,owner=appState.user.id;
  n.append(heading(req?'Vos projets, en bonne voie.':'Le prochain projet est ici.',req?'Retrouvez vos demandes et choisissez avec qui échanger.':'Seules les missions autorisées pour vos profils et vos communes sont affichées.',req?'+ Décrire mon projet':null,()=>startWizard()));
  const initial=await api('/projects'),items=initial.items;
  if(req){const ds=(await api('/v4/drafts')).items;if(ds.length){const box=panel('À reprendre','Vos brouillons sont enregistrés dans votre compte.');for(const d of ds)box.append(el('div',{class:'item line'},el('strong',{text:d.title||'Nouveau projet'}),button('Continuer',()=>startWizard(d)),button('Supprimer',()=>ask('Supprimer ce brouillon ?','La demande n’a pas été publiée. Ses photos seront également supprimées.',()=>api('/v4/drafts/'+d.id,{method:'DELETE'})))));n.append(box)}}
  if(!req&&initial.search_scope!=='ready'&&initial.search_scope){
    n.append(empty(initial.search_scope==='profile_required'?'Complétez votre profil.':'Votre profil attend son examen.',
      'Les métiers, les communes et l’autorisation de test déterminent les missions que vous pouvez consulter.','Vérifier mon profil',()=>go('profile')));return;
  }
  const saved=appState.projectFilters?.owner===owner?appState.projectFilters.values:{};
  const form=el('form',{class:'project-search',role:'search','aria-label':'Rechercher les projets'});
  const q=field('Rechercher','q','search',{value:saved.q||'',maxlength:120,required:false,placeholder:'Mots-clés, métier, commune…'});
  const select=(label,name,options)=>{const node=field(label,name,'select',{options,required:false});node.querySelector('select').value=saved[name]||'';return node};
  const towns=[...new Set([...items.map(p=>p.town),...(saved.town?[saved.town]:[])])].sort((a,b)=>a.localeCompare(b,'fr'));
  const groups=[...new Set(catalog.map(t=>t.group))].sort((a,b)=>a.localeCompare(b,'fr'));
  const advanced=el('details',{},el('summary',{text:'Affiner la recherche'}),el('div',{class:'search-grid'},
    select('Métier','trade',{'':'Tous les métiers',...Object.fromEntries(catalog.map(t=>[t.id,t.label]))}),
    select('Commune','town',{'':'Toutes les communes disponibles',...Object.fromEntries(towns.map(t=>[t,t]))}),
    select('Catégorie','category',{'':'Toutes les catégories',...Object.fromEntries(groups.map(t=>[t,t]))}),
    select('Début souhaité','timing',{'':'Tous les délais',...timingNames}),
    select('Publication','published_within',{'':'Toutes les dates','1':'Dernières 24 heures','7':'Sept derniers jours','30':'Trente derniers jours'}),
    amountField('Budget recherché · minimum (€)','budget_from',saved.budget_from),amountField('Budget recherché · maximum (€)','budget_to',saved.budget_to),
    el('p',{class:'hint budget-filter-note',text:'Le budget annoncé doit recouper votre plage. Les projets sans budget sont exclus uniquement lorsque vous utilisez ce filtre.'}),
    req?select('Statut','status',{'':'Tous les projets',open:'Ouverts',selected:'Professionnel sélectionné',closed:'Clôturés'}):null));
  advanced.open=Object.entries(saved).some(([k,v])=>v&&!['q','sort'].includes(k));
  const order=select('Trier','sort',{newest:'Plus récents',oldest:'Plus anciens'});order.querySelector('select').value=saved.sort||'newest';
  const reset=button('Effacer les filtres',()=>{for(const c of form.querySelectorAll('input,select'))c.value=c.name==='sort'?'newest':'';action(()=>load())});
  form.append(q,advanced,el('div',{class:'search-actions'},order,el('button',{type:'submit',class:'primary',text:'Rechercher'}),reset));
  const list=el('div',{class:'project-list'}),count=el('p',{class:'count',role:'status','aria-live':'polite'});
  n.append(form,count,list);
  if(!req)n.append(el('p',{class:'hint',text:'La commune correspond aux zones déclarées de votre profil ou d’un profil lié actif. Aucun rayon ni temps de trajet n’est calculé.'}));
  function draw(rows){
    clear(list);count.textContent=rows.length+' projet'+(rows.length>1?'s':'')+' selon vos critères';
    for(const p of rows){
      const info=el('div',{},el('div',{class:'line'},badge(p.status),p.hidden?el('span',{class:'chip red',text:'En modération'}):null),
        el('h3',{text:p.title}),el('p',{text:p.town+' · '+tradeNames(p)}),el('p',{class:'small muted',text:'Début souhaité : '+(timingNames[p.timing]||'Date flexible')}),el('p',{class:'small muted',text:'Budget indicatif : '+budgetText(p)}),!req?matchExplanation(p):null);
      list.append(el('article',{class:'project-row'},el('div',{class:'project-icon'},icon('projects')),info,
        el('div',{class:'row-actions'},button(req?'Voir les candidatures →':'Voir le projet →',()=>projectDetail(p)))));
    }
    if(!rows.length)list.append(empty(req?'Aucun projet ne correspond.':'Aucune mission ne correspond.',
      'Effacez les filtres ou vérifiez vos métiers et vos communes. Les droits d’accès restent appliqués.',req?'Créer une demande':'Vérifier mon profil',()=>req?startWizard():go('profile')));
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
}
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
async function projectDetail(p){await action(async()=>{const d=await api('/v4/projects/'+p.id);const n=clear($('#view')),req=appState.user.role==='requester';n.append(button('← Mes projets',render,'link'),heading(d.title,d.town+' · '+tradeNames(d)),badge(d.status),el('section',{class:'panel'},el('h3',{text:'Le projet en quelques mots'}),el('p',{text:d.description}),el('p',{class:'small muted',text:'Début souhaité : '+({flexible:'flexible',month:'dans le mois',quarter:'dans les trois mois',urgent:'dès que possible'}[d.timing]||'flexible')})));n.append(el('p',{class:'hint',text:'Budget indicatif : '+budgetText(d)+'. Montant déclaré par le demandeur, sans valeur de devis ni paiement dans UCP.'}));if(!req&&p.match)n.append(matchExplanation(p));if(d.photos.length)n.append(el('div',{class:'photos'},...d.photos.map(id=>el('a',{href:'/api/v4/photos/'+id,target:'_blank',rel:'noopener'},el('img',{src:'/api/v4/photos/'+id,alt:'Photo de test du projet',width:160,height:120})))));
if(req){const apps=(await api('/projects/'+p.id+'/applications')).items;const box=panel('Les professionnels intéressés','Comparez les profils déclarés avant de choisir. Une candidature ne constitue pas un devis. Dans cette préproduction, le chat nécessite une sélection et des droits de test actifs.');if(!apps.length)box.append(empty('Pas encore de candidature','Votre demande reste disponible pour les professionnels éligibles.'));renderCandidateCards(box,apps);n.append(box);if(d.status!=='closed')n.append(button('Clôturer le projet',()=>ask('Clôturer votre projet ?','Les candidatures s’arrêtent et la conversation devient inaccessible dans ce laboratoire.',()=>api('/projects/'+d.id+'/close',{method:'POST'}))));if(!apps.length&&d.status==='open')n.append(button('Modifier la demande',()=>editProject(d)))}else n.append(button('Proposer ma candidature',async()=>{const r=await action(()=>api('/projects/'+p.id+(p.matching_individual_profile===false&&p.matching_linked_profile_id?'/apply-linked/'+p.matching_linked_profile_id:'/apply'),{method:'POST'}),'Votre candidature est enregistrée.');if(r){UCPAnalytics.track('application_submitted');go('applications')}},'primary'));n.append(button('Signaler un problème',()=>report('project',p.id),'link'));UCPAnalytics.track('project_viewed');return true})}

function candidateFacts(a){
  const terms=[['Métiers déclarés',(a.trades||[a.trade]).map(t=>trades[t]||t).join(' · ')],
    ['Communes d’intervention',(a.service_zones||[a.town]).join(' · ')],
    ['Statut du profil',a.verification_status==='test_authorized'?'Autorisé pour les tests · aucune certification réelle':a.verification_status==='test_unavailable'?'Profil indisponible pour la sélection':'Statut non renseigné'],
    ['Candidature',labels[a.status]||a.status],
    ['Reçue le',a.submitted_at?new Date(a.submitted_at).toLocaleString('fr-FR'):'Date non renseignée']];
  return el('dl',{class:'candidate-facts'},...terms.flatMap(([t,v])=>[el('dt',{text:t}),el('dd',{text:v})]));
}
function renderCandidateCards(box,apps){
  const chosen=new Set(),checks=[];
  const summary=el('p',{class:'small muted','aria-live':'polite'});
  const compare=button('Comparer les profils sélectionnés',()=>{
    const cards=el('div',{class:'candidate-comparison'},...apps.filter(a=>chosen.has(a.id)).map(a=>el('article',{class:'comparison-card'},
      el('h4',{text:a.professional_name}),a.linked_artisan_alias?el('p',{text:'Profil lié : '+a.linked_artisan_alias}):null,candidateFacts(a))));
    showDialog('Comparer les candidatures',el('div',{},el('p',{class:'hint',text:'Profils déclaratifs actuels. L’autorisation de test ne vérifie ni l’entreprise ni ses assurances. Avis et réalisations ne sont pas disponibles dans cette version.'}),cards));
  },'secondary');compare.disabled=true;
  function update(){summary.textContent=chosen.size+' / 3 profils sélectionnés pour la comparaison';compare.disabled=chosen.size<2;for(const c of checks)c.disabled=chosen.size>=3&&!c.checked}
  if(apps.length>1)box.append(el('div',{class:'comparison-toolbar'},summary,compare));
  for(const a of apps){
    const item=el('article',{class:'item'},el('h4',{text:a.professional_name}),a.linked_artisan_alias?el('p',{class:'small',text:'Profil lié : '+a.linked_artisan_alias}):null,badge(a.status),candidateFacts(a));
    if(apps.length>1){const check=el('input',{type:'checkbox','aria-label':'Comparer le profil de '+a.professional_name});
      check.addEventListener('change',()=>{if(check.checked&&chosen.size<3)chosen.add(a.id);else{chosen.delete(a.id);check.checked=false}update()});checks.push(check);
      item.append(el('label',{class:'candidate-choice'},check,'Ajouter au comparatif'));
    }
    if(a.status==='pending'){
      const select=a.eligible_for_selection!==false?button('Choisir ce professionnel',()=>ask('Choisir ce professionnel ?','Dans cette version, un professionnel peut être retenu par projet. Les autres candidatures seront refusées.',async()=>{const r=await api('/applications/'+a.id+'/accept',{method:'POST'});UCPAnalytics.track('match_confirmed');return r}),'primary'):el('p',{class:'hint',text:'Cette candidature ne peut pas être sélectionnée actuellement.'});
      item.append(el('div',{class:'row'},select,button('Ne pas retenir',()=>ask('Ne pas retenir cette candidature ?','Le professionnel retrouvera ce statut dans son espace.',()=>api('/applications/'+a.id+'/reject',{method:'POST'})))));
    }
    box.append(item);
  }
  update();
}
function editProject(d){const f=el('form',{},field('Titre','title','text',{value:d.title,minlength:5,maxlength:120}),field('Commune','town','text',{value:d.town,maxlength:90}),field('Description','description','textarea',{value:d.description,minlength:20}),el('div',{class:'budget-fields'},amountField('Budget minimum facultatif (€)','budget_min',d.budget_min),amountField('Budget maximum facultatif (€)','budget_max',d.budget_max)),el('p',{class:'hint',text:'Les métiers restent identiques. Les modifications sont bloquées après la première candidature.'}),el('button',{class:'primary',type:'submit',text:'Enregistrer les modifications'}));f.addEventListener('submit',async e=>{e.preventDefault();const r=await action(()=>api('/projects/'+d.id,{method:'PUT',body:{...formValue(f),trade:d.trade,budget_min:amountValue(formValue(f).budget_min),budget_max:amountValue(formValue(f).budget_max)}}),'Projet modifié.');if(r){$('#dialog').close();render()}});showDialog('Modifier votre demande',f)}
function startWizard(d=null){currentDraft=d?structuredClone(d):{title:'',description:'',town:'Toulouse',trades:[],timing:'flexible',budget_min:null,budget_max:null,version:0,photos:[]};wizardStep=1;UCPAnalytics.track('project_started',{step:1});wizard()}
function tradePicker(selected,onChange,professional=false){const wrapper=el('div'),search=el('input',{type:'search',placeholder:'Ex. fuite, électricité, toiture…','aria-label':'Rechercher un métier'}),chosen=el('div',{class:'selected-trades'}),list=el('div',{class:'category-browser'});function draw(){clear(chosen);clear(list);for(const id of selected)chosen.append(button((trades[id]||id)+' ×',()=>{selected.splice(selected.indexOf(id),1);onChange([...selected]);draw()}));const q=normalize(search.value);const filtered=catalog.filter(t=>(!professional||t.id!=='inconnu')&&normalize([t.label,t.group,...t.synonyms].join(' ')).includes(q));for(const group of [...new Set(filtered.map(t=>t.group))]){const details=el('details',{},el('summary',{text:group}));details.open=!!q;const items=el('div',{class:'category-items'});for(const t of filtered.filter(t=>t.group===group)){const input=el('input',{type:'checkbox',value:t.id,checked:selected.includes(t.id),onChange:e=>{if(e.target.checked){if(selected.length>=12){e.target.checked=false;msg('Vous pouvez choisir jusqu’à 12 métiers.','error');return}if(t.id==='inconnu')selected.splice(0);else if(selected.includes('inconnu'))selected.splice(selected.indexOf('inconnu'),1);selected.push(t.id)}else selected.splice(selected.indexOf(t.id),1);onChange([...selected]);draw();const active=[...list.querySelectorAll('input')].find(x=>x.value===t.id);if(active){active.closest('details').open=true;active.focus()}}});items.append(el('label',{},input,t.label))}details.append(items);list.append(details)}if(!filtered.length)list.append(el('p',{class:'status-note',text:'Aucun métier trouvé. Choisissez « Je ne sais pas quel professionnel contacter ».'}))}search.addEventListener('input',draw);wrapper.append(search,chosen,list);draw();return wrapper}
async function saveDraft(){for(const input of document.querySelectorAll('.wizard [name=budget_min],.wizard [name=budget_max]'))if(!input.checkValidity())throw Error('Corrigez les montants du budget : euros entiers sans valeur négative, ou champs vides.');const d=currentDraft;const payload={title:d.title,description:d.description,town:d.town,trades:d.trades,timing:d.timing,budget_min:d.budget_min??null,budget_max:d.budget_max??null,version:d.version};const r=await api('/v4/drafts'+(d.id?'/'+d.id:''),{method:d.id?'PUT':'POST',body:payload});Object.assign(d,r);return r}
function wizard(){const n=clear($('#view')),d=currentDraft;n.append(button('← Retour à mes projets',()=>ask('Revenir à vos projets ?','Enregistrez les dernières modifications avant de quitter.',async()=>{await saveDraft();currentDraft=null;go('projects');return true}),'link'));const box=el('div',{class:'wizard'});n.append(box);box.append(el('ol',{class:'steps'},...['Vos travaux','Les détails','Vérification'].map((t,i)=>el('li',{class:i+1===wizardStep?'active':'','aria-current':i+1===wizardStep?'step':'false'},el('b',{text:i+1}),t))));const names=['De quoi avez-vous besoin ?','Parlez-nous de votre projet.','Tout est prêt pour publier ?'];box.append(el('h2',{text:names[wizardStep-1]}),el('p',{class:'muted small',text:['Plusieurs métiers ? Sélectionnez tous ceux qui vous concernent.','Quelques précisions pour recevoir des candidatures adaptées.','Relisez votre demande. Vous gardez la main sur le choix du professionnel.'][wizardStep-1]}));const form=el('form');box.append(form);
if(wizardStep===1){form.append(field('Un titre pour votre projet','title','text',{value:d.title,placeholder:'Ex. Rénover ma salle de bains',required:false,maxlength:120}),field('Votre besoin, avec vos mots','description','textarea',{value:d.description,placeholder:'Ce que vous souhaitez faire, la pièce concernée, ce qui est déjà en place…',required:false}));form.addEventListener('input',()=>Object.assign(d,formValue(form)));form.append(el('div',{class:'helper'},el('strong',{text:'Vous n’avez pas besoin de connaître le bon terme.'}),el('p',{text:'Recherchez un mot courant ou choisissez « Je ne sais pas ». Les suggestions restent à confirmer.'})));const suggestion=button('Me suggérer des métiers',()=>{const words=normalize(d.description+' '+d.title);const matches=catalog.filter(t=>[t.label,...t.synonyms].some(w=>w.length>3&&words.includes(normalize(w))));const b=el('div',{},el('p',{text:matches.length?'Suggestions par mots-clés : choisissez celles qui correspondent à vos travaux.':'Aucune suggestion fiable. Vous pouvez utiliser le choix « Je ne sais pas ».'}));for(const t of matches.slice(0,6))b.append(button(t.label,()=>{if(!d.trades.includes(t.id)&&d.trades.length<12)d.trades.push(t.id);$('#dialog').close();wizard()}));showDialog('Pour vous aider à choisir',b)},'link');form.append(suggestion,tradePicker([...d.trades],v=>d.trades=v))}
if(wizardStep===2){form.append(field('Dans quelle commune ?','town','text',{value:d.town,placeholder:'Toulouse',maxlength:90}),field('Quand souhaitez-vous commencer ?','timing','select',{value:d.timing,options:{flexible:'Je suis flexible',month:'Dans le mois',quarter:'Dans les trois mois',urgent:'Dès que possible'}}),el('p',{class:'hint',text:'Indiquez seulement la commune. L’adresse précise se partage après sélection.'}));form.append(el('h3',{text:'Votre budget · facultatif'}),el('p',{class:'hint',text:'Montants indicatifs en euros entiers, sans valeur de devis. Vous pouvez laisser les deux champs vides. Aucun paiement dans UCP.'}),el('div',{class:'budget-fields'},amountField('Minimum facultatif (€)','budget_min',d.budget_min),amountField('Maximum facultatif (€)','budget_max',d.budget_max)));const details=()=>{const v=formValue(form);Object.assign(d,{town:v.town,timing:v.timing,budget_min:amountValue(v.budget_min),budget_max:amountValue(v.budget_max)})};form.addEventListener('input',details);form.addEventListener('change',details);form.append(el('h3',{text:'Des photos pour mieux comprendre'}),el('p',{class:'hint',text:'Facultatif · 5 photos maximum, 4 Mo par photo. Photos fictives uniquement. Elles seront visibles après votre sélection.'}));const upload=el('input',{type:'file',accept:'image/jpeg,image/png,image/webp','aria-label':'Ajouter une photo de test'});upload.addEventListener('change',async()=>{const file=upload.files[0];if(!file)return;if(file.size>4000000){msg('La photo dépasse 4 Mo.','error');return}const r=await action(async()=>{await saveDraft();const b64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(file)});const p=await api('/v4/drafts/'+d.id+'/photos',{method:'POST',body:{data:b64}});d.photos.push(p.id);d.version=p.version;return p},'Photo enregistrée.');if(r)wizard()});form.append(upload,el('div',{class:'photos'},...d.photos.map(id=>el('div',{class:'photo'},el('img',{src:'/api/v4/photos/'+id,alt:'Photo de votre demande'}),button('Retirer',async()=>{const r=await action(()=>api('/v4/photos/'+id,{method:'DELETE'}));if(r){d.photos=d.photos.filter(x=>x!==id);d.version=r.version;wizard()}}))))) }
if(wizardStep===3){const rev=el('div',{class:'review'},el('h3',{text:d.title}),el('dl',{},el('dt',{text:'Travaux concernés'}),el('dd',{text:d.trades.map(x=>trades[x]).join(' · ')}),el('dt',{text:'Commune'}),el('dd',{text:d.town}),el('dt',{text:'Description'}),el('dd',{text:d.description}),el('dt',{text:'Début souhaité'}),el('dd',{text:timingNames[d.timing]||'Date flexible'}),el('dt',{text:'Budget indicatif'}),el('dd',{text:budgetText(d)}),el('dt',{text:'Photos privées'}),el('dd',{text:d.photos.length+' photo(s), partagées après sélection'})));form.append(rev,el('label',{},el('input',{type:'checkbox',required:true,name:'confirmed'}),'J’ai vérifié ma demande et elle ne contient aucune coordonnée directe.'))}
const foot=el('div',{class:'wizard-footer'},button(wizardStep===1?'Enregistrer mon brouillon':'← Précédent',async()=>{if(wizardStep>1){const saved=await action(saveDraft);if(saved){wizardStep--;wizard()}return}const r=await action(saveDraft,'Brouillon enregistré dans votre compte.');if(r){currentDraft=null;go('projects')}},'outline'),el('button',{class:'primary',type:'submit',text:wizardStep===3?'Publier ma demande →':'Continuer →'}));form.append(foot);form.addEventListener('submit',async e=>{e.preventDefault();if(wizardStep===1&&(!d.trades.length||d.title.trim().length<5||d.description.trim().length<20)){msg('Ajoutez un titre (5 caractères), une description (20) et au moins un métier.','error');return}const r=await action(async()=>{await saveDraft();if(wizardStep===3)return await api('/v4/drafts/'+d.id+'/publish',{method:'POST',body:{version:d.version}});return true});if(r){if(wizardStep===3){UCPAnalytics.track('project_published');currentDraft=null;await render();msg('Votre demande est publiée dans cet environnement de test.','success')}else{wizardStep++;UCPAnalytics.track('project_step_completed',{step:wizardStep-1});wizard()}}})}
async function renderProfile(n){n.append(heading('Votre savoir-faire, bien présenté.','Indiquez vos spécialités et vos communes pour recevoir les bonnes demandes.'));const {profile:p}=await api('/my-profile');const selected=p?[p.trade,...p.additional_trades]:[];const form=el('form',{},field('Votre commune principale','town','text',{value:p?.town||'Toulouse',maxlength:90}),field('Autres communes · séparées par des virgules','zones','text',{value:(p?.service_zones||[]).filter(x=>x!==p.town).join(', '),required:false,placeholder:'Blagnac, Colomiers, Balma'}),field('SIREN de test','siren','text',{value:p?.siren||'',maxlength:9,minlength:9,placeholder:'123456782'}),el('p',{class:'hint',text:'Le format du numéro est contrôlé. L’existence de l’entreprise et ses assurances ne sont pas vérifiées.'}),el('h3',{text:'Vos spécialités · 5 maximum'}),tradePicker(selected,v=>{selected.splice(0,selected.length,...v)},true),el('button',{type:'submit',class:'primary',text:'Enregistrer mon profil →'}));form.addEventListener('submit',async e=>{e.preventDefault();if(!selected.length||selected.length>5){msg('Choisissez entre un et cinq métiers.','error');return}const v=formValue(form);const r=await action(()=>api('/profile',{method:'POST',body:{trade:selected[0],additional_trades:selected.slice(1),town:v.town,siren:v.siren,service_zones:v.zones.split(',').map(s=>s.trim()).filter(Boolean)}}),'Profil enregistré. Il doit être examiné par l’administrateur.');if(r)render()});n.append(el('div',{class:'status-note',text:p?(p.approved?'Profil autorisé pour les tests. Aucune certification réelle.':'Profil en attente de revue.'):'Complétez votre profil pour participer aux tests.'}),el('section',{class:'panel'},form))}
async function renderApplications(n){n.append(heading('Vos candidatures.','Une vue claire sur les projets qui vous intéressent.'));const items=(await api('/my-applications')).items;if(!items.length)n.append(empty('Tout commence par un projet.','Parcourez les demandes qui correspondent à vos métiers.','Trouver un projet',()=>go('projects')));for(const a of items)n.append(el('section',{class:'panel'},el('h3',{text:a.title}),el('p',{class:'muted',text:(trades[a.trade]||a.trade)+' · '+a.town}),badge(a.status),a.status==='pending'?button('Retirer ma candidature',()=>ask('Retirer cette candidature ?','Elle ne pourra pas être renvoyée sur ce projet dans ce laboratoire.',()=>api('/applications/'+a.id+'/withdraw',{method:'POST'}))):a.status==='accepted'?button('Ouvrir mes messages',()=>go('conversations'),'secondary'):null))}
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
  form.addEventListener('submit',async e=>{e.preventDefault();const result=await action(()=>api('/v4/admin/support/'+id+'/review',{method:'POST',body:formValue(form)}));if(!result)return;
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
      const data=await api('/v4/admin/reports/'+report.id+'/review',{method:'POST',body:{reason,...(before?{before_id:before}:{})}});
      const detail=el('div',{},el('p',{class:'case-text',text:data.report.reason}),el('p',{class:'hint',text:'Chaque consultation est tracée. Ne recopiez aucune donnée privée dans la réponse au déclarant.'}));
      const ctx=data.context;
      if(ctx.project)detail.append(el('h4',{text:ctx.project.title}),el('p',{class:'case-text',text:ctx.project.description}),el('p',{text:ctx.project.town}));
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
async function renderNotifications(n){n.append(heading('Votre actualité UCP.','Les nouvelles candidatures, sélections et messages.'));const d=await api('/notifications');if(!d.items.length)n.append(empty('Vous êtes à jour.','Les prochains événements apparaîtront ici.'));if(d.unread)n.append(button('Tout marquer comme lu',async()=>{const r=await action(()=>api('/notifications/read-all',{method:'POST'}));if(r)render()}));for(const x of d.items)n.append(el('div',{class:'item'},el('p',{text:x.message}),el('span',{class:'small muted',text:new Date(x.created_at).toLocaleString('fr-FR')}),!x.read_at?el('span',{class:'chip violet',text:'Nouveau'}):null))}
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
    el('div',{class:'line'},el('span',{class:'chip violet',text:pr.active_artisans+' profil(s) artisan actif(s) facturé(s)'}),
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
  const profiles=panel('Artisans liés à l’entreprise','Désactiver un profil bloque immédiatement ses futures candidatures et le chat de ses candidatures acceptées.');
  if(!data.members.length)profiles.append(el('p',{class:'empty',text:'Aucun profil artisan lié à ce compte de test.'}));
  for(const x of data.members){
    const line=el('div',{class:'item'},el('h4',{text:x.alias}),el('p',{text:x.trades.map(x=>trades[x]||x).join(' · ')+' — '+x.zones.join(', ')}),
      el('span',{class:'chip',text:x.is_active?'Actif — facturation fictive':'Inactif — non comptabilisé'}));
    line.append(button(x.is_active?'Désactiver ce profil':'Réactiver ce profil',async()=>{
      const result=await action(()=>api(`/enterprise/artisans/${x.id}/set-active`,{method:'POST',body:{active:!x.is_active}}),'Statut du profil fictif actualisé.');if(result)await render();
    }));profiles.append(line);
  }
  target.append(profiles);
}

async function renderPersonalData(target){
  const box=panel('Mes données de laboratoire','Toutes les données affichées proviennent exclusivement de votre compte fictif. Aucun transfert externe.');
  const data=await api('/account/export');
  const form=el('form',{},field('Votre nom affiché','name','text',{value:data.user.name,minlength:2,maxlength:100}),el('button',{type:'submit',text:'Enregistrer mon nom',class:'outline'}));form.addEventListener('submit',async e=>{e.preventDefault();const r=await action(()=>api('/v4/account',{method:'PUT',body:formValue(form)}),'Nom enregistré.');if(r){appState.user.name=r.name;render()}});box.append(form);
  box.append(el('p',{text:`Compte : ${data.user.name} · ${data.user.email} · rôle ${data.user.role}`}));
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
  box.append(log);
  box.append(button('Télécharger mon export JSON local',()=>{
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=el('a',{href:url,download:'ucp-lab-donnees-fictives.json'});
    document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
  }));
  target.append(box);
}
async function loadCatalog(){catalog=(await api('/catalog')).items;for(const t of catalog)trades[t.id]=t.label}
function authTab(register){$('#tab-login').classList.toggle('selected',!register);$('#tab-register').classList.toggle('selected',register);$('#login-form').hidden=register;$('#register-form').hidden=!register;msg('')}
$('#tab-login').addEventListener('click',()=>authTab(false));$('#tab-register').addEventListener('click',()=>authTab(true));
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const r=await action(()=>api('/login',{method:'POST',body:formValue(e.currentTarget)}));if(r){appState.user={id:r.user_id,name:r.name,role:r.role};appState.projectFilters=null;appState.csrf=r.csrf;appState.view=null;await render()}});
$('#register-form').addEventListener('submit',async e=>{e.preventDefault();const d=formValue(e.currentTarget);const r=await action(()=>api('/register',{method:'POST',body:d}));if(r){UCPAnalytics.track('account_created',{role:d.role});authTab(false);$('#login-form [name=email]').value=d.email;$('#login-form [name=password]').focus();msg('Votre compte de test est créé. Connectez-vous pour commencer.','success')}});
$('#logout').addEventListener('click',async()=>{const r=await action(()=>api('/logout',{method:'POST'}));if(r){$('#dialog').close();clear($('#dialog-content'));clear($('#view'));appState.user=null;appState.csrf=null;appState.view=null;appState.projectFilters=null;currentDraft=null;UCPAnalytics.reset();render()}});
$('#dialog-close').addEventListener('click',()=>$('#dialog').close());
$('#privacy-open').addEventListener('click',()=>showDialog('Vos données dans cette version',el('div',{},el('p',{text:'Cette version privée conserve les comptes, projets et messages dans une base locale. N’utilisez que des données fictives. Aucun traceur PostHog, enregistrement de session ou paiement n’est activé.'}),el('p',{text:'Les photos sont réencodées sans métadonnées GPS. Elles ne sont accessibles qu’à leur propriétaire, à la modération et au professionnel sélectionné autorisé.'}),el('p',{text:'L’export est disponible dans Mon compte. La suppression d’un compte ayant un historique nécessite une intervention opérateur. Les conditions et durées de conservation doivent être validées avant toute ouverture.'}))));
$('#reset-open').addEventListener('click',()=>{const f=el('form',{},el('p',{text:'Dans ce laboratoire, l’opérateur génère un code temporaire avec la commande recovery.py. Aucun email n’est envoyé. Saisissez le code ici.'}),field('Code de récupération','token','text',{minlength:20,maxlength:128}),field('Nouveau mot de passe','password','password',{minlength:12,maxlength:128}),el('button',{type:'submit',class:'primary',text:'Réinitialiser mon mot de passe'}));f.addEventListener('submit',async e=>{e.preventDefault();const r=await action(()=>api('/v4/account/reset',{method:'POST',body:formValue(f)}),'Mot de passe remplacé. Les anciennes sessions ont été révoquées.');if(r)$('#dialog').close()});showDialog('Récupérer votre accès',f)});
window.addEventListener('beforeunload',e=>{if(currentDraft){e.preventDefault();e.returnValue=''}});
(async()=>{try{await loadCatalog();try{const me=await api('/session');appState.user=me;appState.csrf=me.csrf}catch{}await render()}catch(e){msg('Le serveur ne répond pas. Démarrez UCP puis rechargez cette page.','error')}})();
