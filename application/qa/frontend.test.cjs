/* DOM simulation, not a real browser, rendering or accessibility audit. */
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const root=path.join(__dirname,'../backend/static');
const tick=()=>new Promise(r=>setTimeout(r,12));
async function boot(overrides={},configure=null,url='http://localhost:8765/#projects'){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url,runScripts:'outside-only'});
 const w=dom.window,calls=[];
 w.structuredClone=structuredClone;w.AbortSignal.timeout=AbortSignal.timeout;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.crypto.randomUUID=crypto.randomUUID;
 const defaults={'/api/catalog':{items:JSON.parse(fs.readFileSync(path.join(root,'../taxonomy.json'),'utf8'))},'/api/session':{id:1,name:'Camille',role:'requester',csrf:'test-token'},'/api/projects':{items:[]},'/api/saved-searches':{items:[],limit:10},'/api/v4/drafts':{items:[]},'/api/my-profile':{profile:null},'/api/v4/reports':{items:[],next_before_id:null},'/api/v4/support':{items:[],next_before_id:null,categories:{other:'Autre demande'}},'/api/v4/admin/support':{items:[],next_before_id:null,categories:{other:'Autre demande'}}};
 w.fetch=async(url,opts={})=>{
  const call={url,method:opts.method||'GET',body:opts.body?JSON.parse(opts.body):null,headers:opts.headers};calls.push(call);
  let r=overrides[call.method+' '+url]??overrides[url]??defaults[url];
  if(typeof r==='function')r=await r(call);
  if(r===undefined)throw Error('Unhandled mock route: '+call.method+' '+url);
  return {ok:!(r.status>=400),status:r.status||200,json:async()=>r.data??r};
 };
 if(configure)configure(w);
 w.eval(fs.readFileSync(path.join(root,'analytics.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'guided-help.js'),'utf8'));
 new (require('node:vm').Script)(fs.readFileSync(path.join(root,'app.js'),'utf8')).runInContext(dom.getInternalVMContext());
 await tick();return {dom,w,calls,close:()=>w.close()};
}
function input(w,selector,value){const n=w.document.querySelector(selector);assert.ok(n,selector);n.value=value;n.dispatchEvent(new w.Event('input',{bubbles:true}));}
function submit(w,selector){w.document.querySelector(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}

test('chat retry preserves idempotency key after lost response',async()=>{
 let attempts=0;
 const x=await boot({'GET /api/conversations/12/messages':{items:[]},'POST /api/conversations/12/messages':()=>{if(++attempts===1)throw Error('response lost');return {id:3,ok:true}}});
 try{
  const holder=x.w.document.createElement('section');x.w.document.body.append(holder);
  await x.w.openChat(holder,{application_id:12,peer:'Atelier',title:'Projet fictif'});
  const field=holder.querySelector('textarea'),form=holder.querySelector('form');
  field.value='Bonjour';form.dispatchEvent(new x.w.Event('submit',{cancelable:true}));await tick();
  assert.equal(field.value,'Bonjour');
  form.dispatchEvent(new x.w.Event('submit',{cancelable:true}));await tick();
  const sent=x.calls.filter(c=>c.method==='POST');
  assert.equal(sent.length,2);assert.ok(sent[0].headers['Idempotency-Key']);
  assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);
  assert.equal(field.value,'');
  field.value='Bonjour';form.dispatchEvent(new x.w.Event('submit',{cancelable:true}));await tick();
  assert.notEqual(x.calls.filter(c=>c.method==='POST')[2].headers['Idempotency-Key'],sent[0].headers['Idempotency-Key']);
 }finally{x.close()}
});

test('guided publication uses three steps, CSRF, version and one publish',async()=>{
 let version=0;
 const x=await boot({'POST /api/v4/drafts':()=>({id:5,version:++version}),'PUT /api/v4/drafts/5':()=>({id:5,version:++version}),'POST /api/v4/drafts/5/publish':{id:9,status:'open'}});const {w,calls}=x;
 try{
  w.startWizard();input(w,'[name=title]','Rénover ma salle de bains');input(w,'.wizard [name=description]','Remplacer les équipements et les revêtements de la pièce.');
  const check=w.document.querySelector('input[value=plomberie]');check.checked=true;check.dispatchEvent(new w.Event('change',{bubbles:true}));
  submit(w,'.wizard form');await tick();assert.match(w.document.querySelector('.wizard h2').textContent,/Parlez-nous/,JSON.stringify({alert:w.document.querySelector('#alert').textContent,calls}));
  input(w,'[name=town]','Blagnac');submit(w,'.wizard form');await tick();assert.match(w.document.querySelector('.wizard h2').textContent,/Tout est prêt/);
  w.document.querySelector('[name=confirmed]').checked=true;submit(w,'.wizard form');submit(w,'.wizard form');await tick();
  const publish=calls.filter(x=>x.url.endsWith('/publish'));assert.equal(publish.length,1);assert.equal(publish[0].body.version,3);assert.equal(publish[0].headers['x-ucp-csrf'],'test-token');assert.match(w.document.querySelector('#alert').textContent,/publiée/);
 }finally{x.close()}
});

test('network failure retains the draft and permits retry',async()=>{
 const x=await boot({'POST /api/v4/drafts':()=>{throw Error('offline')}});try{
  x.w.startWizard();input(x.w,'[name=title]','Projet conservé');
  const b=[...x.w.document.querySelectorAll('button')].find(x=>x.textContent==='Enregistrer mon brouillon');b.click();await tick();
  assert.equal(x.w.document.querySelector('[name=title]').value,'Projet conservé');assert.match(x.w.document.querySelector('#alert').textContent,/Connexion interrompue/);assert.equal(b.disabled,false);
 }finally{x.close()}
});

test('professional picker excludes unknown and permits keyboard continuation',async()=>{
 const x=await boot();try{
  const holder=x.w.document.createElement('div');await x.w.renderProfile(holder);
  assert.equal(holder.querySelector('input[value=inconnu]'),null);
  x.w.document.body.append(holder);const c=holder.querySelector('input[value=plomberie]');c.checked=true;c.dispatchEvent(new x.w.Event('change',{bubbles:true}));
  assert.equal(x.w.document.activeElement.value,'plomberie');assert.equal(x.w.document.activeElement.closest('details').open,true);
 }finally{x.close()}
});

test('project text stays text even when it resembles executable markup',async()=>{
 const x=await boot({'/api/projects':{items:[{id:3,title:'<img src=x onerror=alert(1)>',description:'test',trade:'plomberie',town:'Toulouse',status:'open'}]}});try{
  assert.ok(x.w.document.querySelector('.project-row h3').textContent.includes('<img'));assert.equal(x.w.document.querySelector('.project-row img'),null);
 }finally{x.close()}
});

test('enterprise matching sends the linked application route',async()=>{
 const x=await boot({'/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},'/api/v4/projects/8':{id:8,title:'Travaux de test',description:'Description fictive',town:'Toulouse',trades:['plomberie'],status:'open',photos:[]},'POST /api/projects/8/apply-linked/4':{id:12},'/api/my-applications':{items:[]}});try{
  await x.w.projectDetail({id:8,matching_individual_profile:false,matching_linked_profile_id:4});
  [...x.w.document.querySelectorAll('button')].find(b=>b.textContent==='Proposer ma candidature').click();await tick();
  assert.ok(x.calls.some(c=>c.url==='/api/projects/8/apply-linked/4'));
 }finally{x.close()}
});

test('catalog selection cannot mix unknown with precise trades',async()=>{
 const x=await boot();try{
  const picked=[];const n=x.w.tradePicker(picked,()=>{});x.w.document.body.append(n);
  for(const id of ['inconnu','plomberie']){const c=n.querySelector('input[value='+id+']');c.checked=true;c.dispatchEvent(new x.w.Event('change',{bubbles:true}));}
  assert.deepEqual(picked,['plomberie']);
 }finally{x.close()}
});

test('analytics is off by default and strips private properties',async()=>{
 const x=await boot();try{
  const got=[],a=x.w.UCPAnalytics;a.configure(event=>got.push(event));a.track('project_viewed');assert.equal(got.length,0);
  a.setConsent(true);a.track('project_viewed',{email:'private@example.com',body:'secret',town:'address',step:2});assert.equal(got.length,1);
  assert.deepEqual(Object.keys(got[0].properties).sort(),['$geoip_disable','$process_person_profile','distinct_id','environment','step','viewport'].sort());
  assert.equal(a.track('unknown_event'),false);a.reset();assert.equal(a.enabled(),false);
 }finally{x.close()}
});

test('a message report targets only that message and preserves text as text',async()=>{
 const x=await boot({'GET /api/conversations/12/messages':{items:[{id:41,sender_id:2,body:'<img src=x onerror=alert(1)>',created_at:'2026-10-27T12:00:00Z'}]},'POST /api/v4/reports':{id:6,status:'open'}});
 try{
  const holder=x.w.document.createElement('section');x.w.document.body.append(holder);
  await x.w.openChat(holder,{application_id:12,peer:'Atelier',title:'Projet fictif'});
  assert.equal(holder.querySelector('.bubble img'),null);
  holder.querySelector('.report-message').click();
  input(x.w,'#dialog [name=reason]','Ce message fictif demande un examen.');submit(x.w,'#dialog form');await tick();
  const sent=x.calls.find(c=>c.method==='POST'&&c.url==='/api/v4/reports');
  assert.equal(sent.body.kind,'message');assert.equal(sent.body.target_id,41);
  assert.match(x.w.document.querySelector('#alert').textContent,/Assistance/);
 }finally{x.close()}
});

test('support shows own case response and requests older pages without leaking markup',async()=>{
 const x=await boot({'/api/v4/reports':{items:[{id:9,kind:'message',target_id:41,reason:'Ma demande de test',status:'resolved',resolution:'<script>private()</script>',created_at:'2026-10-27T12:00:00Z'}],next_before_id:9},'/api/v4/reports?before_id=9':{items:[],next_before_id:null}});
 try{
  [...x.w.document.querySelectorAll('#tabs button')].find(b=>b.textContent==='Assistance').click();await tick();
  assert.match(x.w.document.querySelector('#view').textContent,/Réponse disponible/);
  assert.match(x.w.document.querySelector('#view').textContent,/<script>private/);
  assert.equal(x.w.document.querySelector('#view script'),null);
  [...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent.includes('plus anciens')).click();await tick();
  assert.ok(x.calls.some(c=>c.url==='/api/v4/reports?before_id=9'));
 }finally{x.close()}
});

test('admin case content requires explicit reason and case review before showing the response action',async()=>{
 const x=await boot({'/api/session':{id:99,name:'Admin',role:'admin',csrf:'admin-token'},'/api/admin/metrics':{counts:{}},'/api/admin/queue':{items:[]},'/api/admin/audit':{items:[]},'/api/v4/admin':{reports:[{id:6,kind:'message',target_id:41,reason:'Un signalement fictif',status:'open'}],projects:[],users:[]},'POST /api/v4/admin/reports/6/review':{report:{reason:'Un signalement fictif'},context:{project:null,messages:[{id:41,sender_name:'Atelier',body:'<img src=x>',created_at:'2026-10-27T12:00:00Z'}],next_before_id:null}},'POST /api/v4/admin/reports/6/resolve':{ok:true}});
 try{
  await x.w.go('moderation');
  assert.equal(x.calls.some(c=>c.url.endsWith('/review')),false);
  [...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent==='Examiner le signalement').click();
  assert.equal(x.calls.some(c=>c.url.endsWith('/review')),false);
  input(x.w,'#dialog [name=reason]','Examen nécessaire pour le dossier.');submit(x.w,'#dialog form');await tick();
  const reviewed=x.calls.find(c=>c.url.endsWith('/review'));
  assert.equal(reviewed.body.reason,'Examen nécessaire pour le dossier.');assert.equal(reviewed.headers['x-ucp-csrf'],'admin-token');
  assert.equal(x.w.document.querySelector('#dialog img'),null);assert.match(x.w.document.querySelector('#dialog').textContent,/<img src=x>/);
  [...x.w.document.querySelectorAll('#dialog button')].find(b=>b.textContent==='Répondre et clôturer le signalement').click();
  assert.match(x.w.document.querySelector('#dialog label').textContent,/visible dans Assistance/);
  input(x.w,'#dialog [name=reason]','Votre signalement a bien été examiné.');submit(x.w,'#dialog form');await tick();
  assert.ok(x.calls.some(c=>c.url.endsWith('/resolve')&&c.body.reason.includes('bien été examiné')));
 }finally{x.close()}
});

test('requester comparison selects two or three profiles, stays textual and shows actual team trades',async()=>{
 const x=await boot();try{
  const apps=[1,2,3,4].map(id=>({id,status:'pending',professional_name:'Atelier '+id,trade:'electricite',town:'Toulouse',trades:['plomberie'],service_zones:['Blagnac'],linked_artisan_alias:'<img src=x>',verification_status:'test_authorized',eligible_for_selection:true,submitted_at:'2026-10-27T12:00:00Z'}));
  const box=x.w.document.createElement('section');x.w.document.querySelector('#view').replaceChildren(box);x.w.renderCandidateCards(box,apps);
  const compare=[...box.querySelectorAll('button')].find(b=>b.textContent==='Comparer les profils sélectionnés'),checks=[...box.querySelectorAll('input[type=checkbox]')];
  assert.equal(compare.disabled,true);
  for(const c of checks.slice(0,3)){c.checked=true;c.dispatchEvent(new x.w.Event('change'));}
  assert.equal(compare.disabled,false);assert.equal(checks[3].disabled,true);
  compare.click();await tick();
  assert.equal(x.w.document.querySelectorAll('.comparison-card').length,3);assert.equal(x.w.document.querySelector('#dialog img'),null);
  const card=x.w.document.querySelector('.comparison-card');assert.match(card.textContent,/Plomberie/);assert.match(card.textContent,/Blagnac/);assert.doesNotMatch(card.textContent,/Électricité/);
  assert.match(x.w.document.querySelector('#dialog').textContent,/aucune certification réelle/);
  checks[0].checked=false;checks[0].dispatchEvent(new x.w.Event('change'));assert.equal(checks[3].disabled,false);
  checks[1].checked=false;checks[1].dispatchEvent(new x.w.Event('change'));assert.equal(compare.disabled,true);
 }finally{x.close()}
});

test('unavailable application does not offer a select button',async()=>{
 const x=await boot();try{
  const box=x.w.document.createElement('section');x.w.renderCandidateCards(box,[{id:1,status:'pending',professional_name:'Atelier',trade:'plomberie',town:'Toulouse',verification_status:'test_unavailable',eligible_for_selection:false}]);
  assert.equal([...box.querySelectorAll('button')].some(b=>b.textContent==='Choisir ce professionnel'),false);
  assert.match(box.textContent,/ne peut pas être sélectionnée/);
 }finally{x.close()}
});

function loadPWA(x){x.w.eval(fs.readFileSync(path.join(root,'pwa.js'),'utf8'))}
test('PWA registration is scoped, installation requires a user gesture and acceptance is not confirmation',async()=>{
 let registrations=[],prompts=0;
 const x=await boot({},w=>{
  Object.defineProperty(w,'isSecureContext',{value:true});w.matchMedia=()=>({matches:false,addEventListener(){}});
  Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async(...args)=>{registrations.push(args)}}});
 });try{
  loadPWA(x);assert.equal(registrations[0][0],'/ucp-sw.js');assert.equal(registrations[0][1].scope,'/');assert.equal(registrations[0][1].updateViaCache,'none');
  const e=new x.w.Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{prompts++};e.userChoice=Promise.resolve({outcome:'accepted'});
  x.w.dispatchEvent(e);assert.equal(e.defaultPrevented,true);assert.equal(prompts,0);
  x.w.document.querySelector('#install-app').click();
  const b=[...x.w.document.querySelectorAll('#dialog button')].find(b=>b.textContent==='Lancer l’installation');b.click();b.click();await tick();
  assert.equal(prompts,1);assert.match(x.w.document.querySelector('#alert').textContent,/Demande d’installation acceptée/);
  assert.equal(x.w.document.querySelector('#install-app').hidden,false);
  x.w.dispatchEvent(new x.w.Event('appinstalled'));assert.equal(x.w.document.querySelector('#install-app').hidden,true);
 }finally{x.close()}
});
test('manual installation help works without a service worker or install event',async()=>{
 const x=await boot();try{
  loadPWA(x);x.w.document.querySelector('#install-help').click();const text=x.w.document.querySelector('#dialog').textContent;
  assert.match(text,/iPhone · Safari/);assert.match(text,/Android/);assert.match(text,/sans téléchargement depuis un store/);
  assert.match(text,/connexion Internet/);assert.equal([...x.w.document.querySelectorAll('#dialog button')].some(b=>b.textContent==='Lancer l’installation'),false);
 }finally{x.close()}
});
test('standalone mode is detected without storing an installation flag',async()=>{
 const x=await boot({},w=>{w.matchMedia=()=>({matches:true,addEventListener(){}})});try{
  loadPWA(x);assert.equal(x.w.document.querySelector('#install-app').hidden,true);
  x.w.document.querySelector('#install-help').click();assert.match(x.w.document.querySelector('#dialog').textContent,/ouvert en mode application/);
 }finally{x.close()}
});
test('online/offline events preserve text and never replay writes',async()=>{
 const x=await boot({'GET /api/conversations/12/messages':{items:[]}});try{
  loadPWA(x);const holder=x.w.document.createElement('section');x.w.document.body.append(holder);
  await x.w.openChat(holder,{application_id:12,peer:'Atelier',title:'Test'});holder.querySelector('textarea').value='Texte privé non envoyé';
  x.w.dispatchEvent(new x.w.Event('offline'));assert.match(x.w.document.querySelector('#connection-status').textContent,/hors connexion/);
  x.w.dispatchEvent(new x.w.Event('online'));assert.match(x.w.document.querySelector('#connection-status').textContent,/rien n’a été envoyé/);
  assert.equal(holder.querySelector('textarea').value,'Texte privé non envoyé');assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 }finally{x.close()}
});

for(const errorStatus of [0,403])test('chat recovers after '+(errorStatus?'revoked rights':'a network failure')+' without losing draft or replaying a message',async()=>{
 let reads=0,timers=[];
 const data={items:[{id:8,sender_id:2,body:'Message serveur déjà reçu',created_at:'2026-10-28T10:00:00Z'}]};
 const x=await boot({'GET /api/conversations/12/messages':()=>{if(++reads===2){if(!errorStatus)throw Error('offline');return {status:errorStatus,data:{detail:'Accès suspendu'}}}return data}},w=>{
  Object.defineProperty(w.document,'hidden',{value:false});w.setInterval=fn=>{timers.push(fn);return timers.length};w.clearInterval=()=>{};
 });try{
  const holder=x.w.document.createElement('section');x.w.document.body.append(holder);await x.w.openChat(holder,{application_id:12,peer:'Atelier',title:'Test'});
  holder.querySelector('textarea').value='Mon brouillon privé';timers[0]();await tick();
  assert.equal(holder.querySelector('textarea').value,'Mon brouillon privé');assert.equal(holder.querySelector('form').hidden,false);
  assert.equal(holder.querySelector('button[type=submit]').disabled,true);
  assert.equal(holder.querySelector('.chat-log').textContent.includes('Message serveur déjà reçu'),!errorStatus);
  const retry=[...holder.querySelectorAll('button')].find(b=>b.textContent==='Réessayer de charger les messages');assert.equal(retry.hidden,false);retry.click();await tick();
  assert.match(holder.querySelector('.chat-log').textContent,/Message serveur déjà reçu/);assert.equal(holder.querySelector('button[type=submit]').disabled,false);
  assert.equal(holder.querySelector('textarea').value,'Mon brouillon privé');assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 }finally{x.close()}
});
test('late failure from an old conversation cannot hide the current chat or stop its timer',async()=>{
 let finish,timers=[],cleared=[];
 const x=await boot({'GET /api/conversations/11/messages':()=>new Promise(r=>finish=r),'GET /api/conversations/12/messages':{items:[{sender_id:2,body:'Conversation actuelle',created_at:'2026-10-28T10:00:00Z'}]}},w=>{
  w.setInterval=fn=>{timers.push(fn);return timers.length};w.clearInterval=id=>cleared.push(id);
 });try{
  const holder=x.w.document.createElement('section');x.w.document.body.append(holder);
  const old=x.w.openChat(holder,{application_id:11,peer:'Ancien',title:'Ancien'});
  await x.w.openChat(holder,{application_id:12,peer:'Actuel',title:'Actuel'});const current=timers.length;
  finish({status:403,data:{detail:'Ancien accès révoqué'}});await old;
  assert.match(holder.textContent,/Conversation actuelle/);assert.doesNotMatch(holder.textContent,/Ancien accès révoqué/);
  assert.equal(cleared.includes(current),false);assert.equal(holder.querySelector('button[type=submit]').disabled,false);
 }finally{x.close()}
});

test('search sends combined criteria to server, explains the applying profile and resets filters',async()=>{
 const item={id:3,title:'Fuite fictive',description:'Description',trade:'plomberie',town:'Toulouse',status:'open',timing:'urgent',match:{profile:'linked',alias:'Équipe test',trades:['plomberie'],town:'Toulouse'}};
 const x=await boot({'/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},'/api/projects':{items:[item],search_scope:'ready'},'/api/projects?q=fuite&trade=plomberie&town=Toulouse&timing=urgent&published_within=7&sort=oldest':{items:[item]},'/api/projects?sort=newest':{items:[item]}});
 try{
  input(x.w,'.project-search [name=q]','fuite');
  for(const [name,value] of Object.entries({trade:'plomberie',town:'Toulouse',timing:'urgent',published_within:'7',sort:'oldest'}))x.w.document.querySelector('.project-search [name='+name+']').value=value;
  submit(x.w,'.project-search');await tick();
  assert.ok(x.calls.some(c=>c.url.includes('q=fuite&trade=plomberie&town=Toulouse&timing=urgent&published_within=7&sort=oldest')));
  assert.match(x.w.document.querySelector('.match-reason').textContent,/Équipe test.*Plomberie.*Toulouse/);
  assert.match(x.w.document.querySelector('#view').textContent,/Aucun rayon/);
  [...x.w.document.querySelectorAll('.project-search button')].find(b=>b.textContent==='Effacer les filtres').click();await tick();
  assert.ok(x.calls.some(c=>c.url==='/api/projects?sort=newest'));assert.equal(x.w.document.querySelector('[name=q]').value,'');
 }finally{x.close()}
});
test('an empty search still offers the form and a failed request retains the last results',async()=>{
 const item={id:3,title:'Projet à conserver',description:'Description',trade:'plomberie',town:'Toulouse',status:'open'};
 const x=await boot({'/api/projects':{items:[item]},'/api/projects?q=panne&sort=newest':()=>{throw Error('offline')},'/api/projects?q=aucun&sort=newest':{items:[]}});
 try{
  input(x.w,'.project-search [name=q]','panne');submit(x.w,'.project-search');await tick();
  assert.match(x.w.document.querySelector('.project-row').textContent,/Projet à conserver/);assert.match(x.w.document.querySelector('.count').textContent,/résultats précédents/);
  input(x.w,'.project-search [name=q]','aucun');submit(x.w,'.project-search');await tick();
  assert.equal(x.w.document.querySelectorAll('.project-row').length,0);assert.ok(x.w.document.querySelector('.project-search'));
 }finally{x.close()}
});
test('unapproved professional sees an explanation without mission identifiers',async()=>{
 const x=await boot({'/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},'/api/projects':{items:[],search_scope:'pending_review'}});
 try{assert.match(x.w.document.querySelector('#view').textContent,/profil attend son examen/);assert.equal(x.w.document.querySelectorAll('.project-row').length,0);}finally{x.close()}
});

test('general support creates a categorized case and displays its private response as text',async()=>{
 let created=false;
 const x=await boot({'/api/v4/support':()=>({items:created?[{id:71,subject:'Question de test',category:'other',body:'Mon besoin entièrement fictif.',status:'resolved',response:'<script>never()</script>',created_at:'2026-10-28T10:00:00Z'}]:[],next_before_id:null,categories:{other:'Autre demande'}}),'POST /api/v4/support':()=>{created=true;return {id:71,status:'open'}}});
 try{
  await x.w.go('support');[...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent==='Nouvelle demande d’assistance').click();
  input(x.w,'#dialog [name=subject]','Question de test');x.w.document.querySelector('#dialog [name=category]').value='other';
  input(x.w,'#dialog [name=body]','Mon besoin entièrement fictif.');submit(x.w,'#dialog form');await tick();await tick();
  const sent=x.calls.find(c=>c.method==='POST'&&c.url==='/api/v4/support');assert.equal(sent.body.category,'other');assert.equal(sent.headers['x-ucp-csrf'],'test-token');
  assert.match(x.w.document.querySelector('#view').textContent,/Question de test/);assert.match(x.w.document.querySelector('#view').textContent,/<script>never/);assert.equal(x.w.document.querySelector('#view script'),null);
 }finally{x.close()}
});
test('support failure keeps the form and never resends automatically',async()=>{
 const x=await boot({'POST /api/v4/support':()=>{throw Error('response lost')}});try{
  await x.w.go('support');[...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent==='Nouvelle demande d’assistance').click();
  input(x.w,'#dialog [name=subject]','Demande à conserver');x.w.document.querySelector('#dialog [name=category]').value='other';input(x.w,'#dialog [name=body]','Texte privé non perdu lors de la panne.');
  submit(x.w,'#dialog form');await tick();
  assert.equal(x.w.document.querySelector('#dialog').open,true);assert.equal(x.w.document.querySelector('#dialog [name=body]').value,'Texte privé non perdu lors de la panne.');
  x.w.dispatchEvent(new x.w.Event('online'));await tick();assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
 }finally{x.close()}
});
test('admin general support review is explicit and precedes its response action',async()=>{
 const x=await boot({'/api/session':{id:99,name:'Admin',role:'admin',csrf:'admin-token'},'/api/admin/metrics':{counts:{}},'/api/admin/queue':{items:[]},'/api/admin/audit':{items:[]},'/api/v4/admin':{reports:[],projects:[],users:[]},'/api/v4/admin/support':{items:[{id:71,subject:'Question de test',category:'other',status:'open',created_at:'2026-10-28T10:00:00Z'}],next_before_id:null,categories:{other:'Autre demande'}},'POST /api/v4/admin/support/71/review':{ticket:{id:71,subject:'Question de test',category:'other',body:'<img src=x>',owner_name:'Camille'}},'POST /api/v4/admin/support/71/resolve':{ok:true,status:'resolved'}});
 try{
  await x.w.go('moderation');assert.equal(x.calls.some(c=>c.url.endsWith('/71/review')),false);
  [...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent==='Examiner la demande').click();
  input(x.w,'#dialog [name=reason]','Examen pour répondre au dossier.');submit(x.w,'#dialog form');await tick();
  assert.equal(x.w.document.querySelector('#dialog img'),null);assert.match(x.w.document.querySelector('#dialog').textContent,/<img src=x>/);
  [...x.w.document.querySelectorAll('#dialog button')].find(b=>b.textContent==='Répondre et clôturer la demande').click();
  assert.match(x.w.document.querySelector('#dialog label').textContent,/visible dans Assistance/);
  input(x.w,'#dialog [name=reason]','Votre demande de test a été examinée.');submit(x.w,'#dialog form');await tick();
  assert.ok(x.calls.some(c=>c.url.endsWith('/71/resolve')&&c.body.reason.includes('examinée')));
 }finally{x.close()}
});
test('session expiry clears private dialogs and the previous account view',async()=>{
 const x=await boot({'/api/expired-private-request':{status:401,data:{detail:'Session expirée'}}});try{
  x.w.document.querySelector('#view').textContent='Contenu privé du compte précédent';x.w.showDialog('Dossier privé',x.w.el('p',{text:'Corps privé du support'}));
  await assert.rejects(()=>x.w.api('/expired-private-request'),/session a expiré/);
  assert.equal(x.w.document.querySelector('#dialog').open,false);assert.equal(x.w.document.querySelector('#dialog-content').textContent,'');assert.equal(x.w.document.querySelector('#view').textContent,'');
  assert.equal(x.w.document.querySelector('#anonymous').hidden,false);
 }finally{x.close()}
});

test('wizard preserves optional budget, distinguishes explicit zero and refuses invalid autosave',async()=>{
 for(const minimum of ['', '0']){
  let version=0;
  const x=await boot({'POST /api/v4/drafts':()=>({id:61,version:++version}),'PUT /api/v4/drafts/61':()=>({id:61,version:++version})});
  try{
   x.w.startWizard();input(x.w,'.wizard [name=title]','Budget de test');input(x.w,'.wizard [name=description]','Travaux fictifs pour la recette du budget facultatif.');
   const trade=x.w.document.querySelector('.wizard input[value=plomberie]');trade.checked=true;trade.dispatchEvent(new x.w.Event('change',{bubbles:true}));submit(x.w,'.wizard form');await tick();
   input(x.w,'.wizard [name=budget_min]','-1');const leave=[...x.w.document.querySelectorAll('#tabs button')].find(b=>b.textContent==='Messages');leave.click();await tick();
   assert.equal(x.calls.filter(c=>c.method==='PUT').length,0);assert.match(x.w.document.querySelector('#alert').textContent,/Corrigez les montants/);
   input(x.w,'.wizard [name=budget_min]',minimum);input(x.w,'.wizard [name=budget_max]',minimum===''?'':'1200');submit(x.w,'.wizard form');await tick();
   const sent=x.calls.filter(c=>c.method==='PUT').at(-1).body;
   assert.equal(sent.budget_min,minimum===''?null:0);assert.equal(sent.budget_max,minimum===''?null:1200);
   const review=x.w.document.querySelector('.review');assert.match(review.textContent,/Budget indicatif/);assert.match(review.textContent,/Début souhaité/);
   if(minimum==='')assert.match(review.textContent,/Non renseigné/);else assert.match(review.textContent,/0/);
  }finally{x.close()}
 }
});
test('budget search sends explicit zero bounds and explains missing budgets',async()=>{
 const x=await boot({'/api/projects?budget_from=0&budget_to=0&sort=newest':{items:[]}});try{
  input(x.w,'.project-search [name=budget_from]','0');input(x.w,'.project-search [name=budget_to]','0');submit(x.w,'.project-search');await tick();
  assert.ok(x.calls.some(c=>c.url==='/api/projects?budget_from=0&budget_to=0&sort=newest'));
  assert.match(x.w.document.querySelector('.budget-filter-note').textContent,/sans budget sont exclus/);
 }finally{x.close()}
});
test('project editor sends numeric budget values and explicit null for a cleared bound',async()=>{
 const x=await boot({'PUT /api/projects/18':{ok:true}});try{
  x.w.editProject({id:18,title:'Budget de travaux fictif',description:'Description fictive suffisamment longue pour la modification.',trade:'plomberie',town:'Toulouse',budget_min:1000,budget_max:3000});
  input(x.w,'#dialog [name=budget_min]','');input(x.w,'#dialog [name=budget_max]','0');submit(x.w,'#dialog form');await tick();
  const sent=x.calls.find(c=>c.method==='PUT');assert.equal(sent.body.budget_min,null);assert.equal(sent.body.budget_max,0);
 }finally{x.close()}
});


test('previous wizard step refuses an invalid budget without discarding the entered value',async()=>{
 const x=await boot({'POST /api/v4/drafts':{id:61,version:1},'PUT /api/v4/drafts/61':{id:61,version:2}});
 try{
  x.w.startWizard({id:61,version:1,title:'Projet fictif',description:'Description suffisamment longue pour une demande fictive.',town:'Toulouse',trades:['plomberie'],timing:'flexible',photos:[]});
  submit(x.w,'.wizard form');await tick();
  input(x.w,'.wizard [name=budget_min]','-2');const count=x.calls.filter(c=>c.method==='PUT').length;
  [...x.w.document.querySelectorAll('.wizard button')].find(b=>b.textContent==='← Précédent').click();await tick();
  assert.equal(x.w.document.querySelector('.wizard [name=budget_min]').value,'-2');
  assert.equal(x.calls.filter(c=>c.method==='PUT').length,count);
  assert.match(x.w.document.querySelector('#alert').textContent,/Corrigez les montants/);
 }finally{x.close()}
});

test('application tracking distinguishes closed projects and filters without suggesting inaccessible messages',async()=>{
 const x=await boot({'/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},'/api/my-applications':{items:[
  {id:31,title:'Projet fermé',trade:'plomberie',town:'Toulouse',status:'accepted',project_status:'closed',conversation_state:'closed'},
  {id:32,title:'Projet actif',trade:'plomberie',town:'Toulouse',status:'accepted',project_status:'selected',conversation_state:'test_access_required',linked_artisan_alias:'<img src=x>'},
  {id:33,title:'Projet en attente',trade:'plomberie',town:'Toulouse',status:'pending',project_status:'open',conversation_state:'not_selected'}
 ]}});try{
  await x.w.go('applications');assert.match(x.w.document.querySelector('#view').textContent,/Projet clôturé : les échanges sont fermés/);
  assert.match(x.w.document.querySelector('#view').textContent,/doit être activé par l’administrateur/);assert.equal(x.w.document.querySelector('#view img'),null);
  const select=x.w.document.querySelector('[name=application_status]');select.value='closed';select.dispatchEvent(new x.w.Event('change'));
  assert.match(x.w.document.querySelector('#view [aria-live]').textContent,/Projet fermé/);assert.doesNotMatch(x.w.document.querySelector('#view [aria-live]').textContent,/Projet actif/);
  assert.equal(x.w.document.querySelector('#view [aria-live] button'),null);
  select.value='accepted';select.dispatchEvent(new x.w.Event('change'));assert.match(x.w.document.querySelector('#view [aria-live]').textContent,/Projet actif/);
  select.value='withdrawn';select.dispatchEvent(new x.w.Event('change'));assert.match(x.w.document.querySelector('#view [aria-live]').textContent,/Aucune candidature pour ce filtre/);
 }finally{x.close()}
});

// Adversarial audit: delayed responses and changing interface permissions.
test('audit: old account response cannot return private data after logout',async()=>{
 let finish;const x=await boot({'/api/slow-private':()=>new Promise(resolve=>finish=resolve),'POST /api/logout':{ok:true}});
 try{
  const pending=x.w.api('/slow-private').then(v=>({value:v}),e=>({error:e}));await tick();
  x.w.document.querySelector('#logout').click();await tick();finish({body:'Private previous account'});
  const result=await pending;assert.ok(result.error?.stale,'a successful stale response must be discarded');
 }finally{x.close()}
});
test('audit: delayed project detail never overwrites a newer navigation',async()=>{
 let finish;const x=await boot({'/api/v4/projects/91':()=>new Promise(resolve=>finish=resolve),'/api/projects/91/applications':{items:[]},'/api/notifications':{items:[]}});
 try{
  const pending=x.w.projectDetail({id:91});await tick();await x.w.go('notifications');
  finish({id:91,title:'Ancien projet privé',description:'Ancienne description privée.',trade:'plomberie',trades:['plomberie'],town:'Toulouse',status:'open',photos:[]});await pending;
  assert.doesNotMatch(x.w.document.querySelector('#view').textContent,/Ancien projet privé/);
  assert.match(x.w.document.querySelector('#view').textContent,/actualité/);
 }finally{x.close()}
});
test('audit: action completion preserves a comparison disabled while the request was pending',async()=>{
 let finish;const x=await boot();try{
  const box=x.w.document.querySelector('#view');x.w.renderCandidateCards(box,[{id:1,professional_name:'Pro un',status:'rejected',trade:'plomberie',town:'Toulouse'},{id:2,professional_name:'Pro deux',status:'rejected',trade:'plomberie',town:'Toulouse'}]);
  const checks=box.querySelectorAll('.candidate-choice input');for(const c of checks){c.checked=true;c.dispatchEvent(new x.w.Event('change'))}
  const compare=[...box.querySelectorAll('button')].find(b=>b.textContent==='Comparer les profils sélectionnés');assert.equal(compare.disabled,false);
  const pending=x.w.action(()=>new Promise(resolve=>finish=resolve));checks[0].checked=false;checks[0].dispatchEvent(new x.w.Event('change'));assert.equal(compare.disabled,true);
  finish({ok:true});await pending;assert.equal(compare.disabled,true);
 }finally{x.close()}
});

test('audit: existing candidature replaces the apply action even after withdrawal',async()=>{
 for(const status of ['pending','accepted','rejected','withdrawn']){
  const x=await boot({'/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},'/api/v4/projects/91':{id:91,title:'Projet fictif',description:'Description fictive du projet.',trade:'plomberie',trades:['plomberie'],town:'Toulouse',status:'open',photos:[],own_application:{id:61,status}}});
  try{await x.w.projectDetail({id:91});assert.doesNotMatch(x.w.document.querySelector('#view').textContent,/Proposer ma candidature/);assert.match(x.w.document.querySelector('#view').textContent,/déjà enregistrée/);assert.ok([...x.w.document.querySelectorAll('#view button')].some(b=>b.textContent==='Voir ma candidature'))}finally{x.close()}
 }
});
test('audit: closed project does not offer an application and dialog has an accessible name',async()=>{
 const x=await boot({'/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},'/api/v4/projects/91':{id:91,title:'Projet fictif',trade:'plomberie',trades:['plomberie'],town:'Toulouse',status:'closed',photos:[],own_application:null}});
 try{await x.w.projectDetail({id:91});assert.doesNotMatch(x.w.document.querySelector('#view').textContent,/Proposer ma candidature/);x.w.showDialog('Dossier de test',x.w.el('p',{text:'Texte'}));const d=x.w.document.querySelector('#dialog');assert.equal(x.w.document.getElementById(d.getAttribute('aria-labelledby')).textContent,'Dossier de test')}finally{x.close()}
});

test('audit: old unauthorized response cannot log out a newly connected account and passwords clear',async()=>{
 let finish;const x=await boot({'/api/old-session':()=>new Promise(resolve=>finish=resolve),'POST /api/logout':{ok:true},'POST /api/login':{user_id:8,name:'Second compte',role:'requester',csrf:'new-csrf'}});
 try{
  const pending=x.w.api('/old-session').catch(e=>e);await tick();
  input(x.w,'#login-form [name=password]','Old-test-password');x.w.document.querySelector('#logout').click();await tick();assert.equal(x.w.document.querySelector('#login-form [name=password]').value,'');
  input(x.w,'#login-form [name=email]','second@ucp.test');input(x.w,'#login-form [name=password]','New-fictional-password');submit(x.w,'#login-form');await tick();
  assert.equal(x.w.document.querySelector('#login-form [name=password]').value,'');
  finish({status:401,data:{detail:'Old session expired'}});const result=await pending;assert.equal(result.stale,true);
  assert.equal(x.w.document.querySelector('#dashboard').hidden,false);assert.match(x.w.document.querySelector('#actor-title').textContent,/Second compte/);
 }finally{x.close()}
});
test('audit: late support review cannot replace a dialog the administrator opened afterwards',async()=>{
 let finish;const x=await boot({'POST /api/v4/admin/support/7/review':()=>new Promise(resolve=>finish=resolve)});
 try{
  x.w.reviewSupportTicket(7,{other:'Autre'});input(x.w,'#dialog [name=reason]','Examen fictif du dossier.');submit(x.w,'#dialog form');await tick();
  x.w.showDialog('Autre dossier',x.w.el('p',{text:'Écran plus récent'}));finish({ticket:{subject:'Ancien dossier',body:'Corps privé retardé',category:'other'}});await tick();
  assert.match(x.w.document.querySelector('#dialog').textContent,/Écran plus récent/);assert.doesNotMatch(x.w.document.querySelector('#dialog').textContent,/Corps privé retardé/);
 }finally{x.close()}
});

test('declared showcase editor preserves a conflicting form and sends the correct linked scope and version',async()=>{
 const original={intro:'Présentation fictive à adapter.',works:[{title:'Réalisation fictive',description:'Description suffisamment longue et entièrement fictive.',trade:'peinture',year:2025}],version:3,scope:{name:'Équipe liée',trades:['peinture'],active:true}};
 const x=await boot({'/api/v4/showcase?linked_profile_id=7':original,'PUT /api/v4/showcase?linked_profile_id=7':{status:409,data:{detail:'Cette présentation a changé.'}}});try{
  await x.w.editShowcase(7);input(x.w,'#dialog [name=intro]','Ma saisie fictive à conserver.');submit(x.w,'#dialog form');await tick();
  const call=x.calls.find(c=>c.method==='PUT');assert.equal(call.url,'/api/v4/showcase?linked_profile_id=7');assert.equal(call.body.version,3);assert.equal(call.body.works[0].trade,'peinture');assert.equal(call.body.works[0].year,2025);
  assert.equal(x.w.document.querySelector('#dialog [name=intro]').value,'Ma saisie fictive à conserver.');assert.equal(x.w.document.querySelector('#dialog').open,true);
  x.w.dispatchEvent(new x.w.Event('online'));await tick();assert.equal(x.calls.filter(c=>c.method==='PUT').length,1);
 }finally{x.close()}
});
test('candidate comparison loads the two authorized showcases and renders declarations as text',async()=>{
 const x=await boot({'/api/projects/5/applications/31/showcase':{intro:'<script>never()</script>',works:[],profile_name:'Pro un'},'/api/projects/5/applications/32/showcase':{intro:'Présentation de l’équipe liée.',works:[{title:'Exemple fictif',description:'<img src=x onerror=never()>',trade:'peinture',year:2024}],profile_name:'Équipe liée'}});try{
  const box=x.w.document.querySelector('#view');x.w.renderCandidateCards(box,[{id:31,professional_name:'Pro un',status:'pending',trade:'plomberie',town:'Toulouse'},{id:32,professional_name:'Gestionnaire',linked_artisan_alias:'Équipe liée',status:'pending',trade:'peinture',town:'Toulouse'}],5);
  assert.equal(x.calls.some(c=>c.url.endsWith('/showcase')),false);
  for(const c of box.querySelectorAll('.candidate-choice input')){c.checked=true;c.dispatchEvent(new x.w.Event('change'))}
  [...box.querySelectorAll('button')].find(b=>b.textContent==='Comparer les profils sélectionnés').click();await tick();
  const dialog=x.w.document.querySelector('#dialog');assert.match(dialog.textContent,/Présentation de l’équipe liée/);assert.match(dialog.textContent,/<script>never/);assert.equal(dialog.querySelector('script,img'),null);
  assert.equal(dialog.querySelectorAll('.comparison-card').length,2);assert.match(dialog.textContent,/Réalisations déclarées/);
 }finally{x.close()}
});
test('showcase editor limits works to six and supports explicit clearing without erasing the private legal profile',async()=>{
 const works=Array.from({length:6},(_,i)=>({title:'Réalisation '+i,description:'Exemple de chantier entièrement fictif à présenter.',trade:'plomberie',year:null}));
 const x=await boot({'/api/v4/showcase':{intro:'',works,version:1,scope:{name:'Pro',trades:['plomberie'],active:true}},'PUT /api/v4/showcase':{ok:true,version:2}});try{
  await x.w.editShowcase(null);const add=[...x.w.document.querySelectorAll('#dialog button')].find(b=>b.textContent==='Ajouter une réalisation');assert.equal(add.disabled,true);
  for(const b of [...x.w.document.querySelectorAll('#dialog button')].filter(b=>b.textContent==='Retirer de ce formulaire'))b.click();assert.equal(add.disabled,false);
  submit(x.w,'#dialog form');await tick();const body=x.calls.find(c=>c.method==='PUT').body;assert.equal(body.works.length,0);assert.equal(body.intro,'');assert.equal(body.version,1);
  assert.equal(x.calls.some(c=>c.url==='/api/profile'),false);
 }finally{x.close()}
});
test('saving a showcase cannot close a newer dialog',async()=>{
 let finish;const x=await boot({'/api/v4/showcase':{intro:'Texte fictif.',works:[],version:1,scope:{name:'Pro',trades:['plomberie'],active:true}},'PUT /api/v4/showcase':()=>new Promise(resolve=>finish=resolve)});try{
  await x.w.editShowcase(null);submit(x.w,'#dialog form');await tick();x.w.showDialog('Nouvelle fenêtre',x.w.el('p',{text:'Nouvel écran'}));finish({ok:true,version:2});await tick();
  assert.equal(x.w.document.querySelector('#dialog').open,true);assert.match(x.w.document.querySelector('#dialog').textContent,/Nouvel écran/);
 }finally{x.close()}
});

test('a pending showcase comparison is discarded when the chosen profiles change',async()=>{
 let finish;const x=await boot({'/api/projects/5/applications/31/showcase':()=>new Promise(resolve=>finish=resolve),'/api/projects/5/applications/32/showcase':{intro:'Exemple',works:[]}});try{
  const box=x.w.document.querySelector('#view');x.w.renderCandidateCards(box,[{id:31,professional_name:'Pro un',status:'rejected',trade:'plomberie',town:'Toulouse'},{id:32,professional_name:'Pro deux',status:'rejected',trade:'plomberie',town:'Toulouse'}],5);
  const checks=box.querySelectorAll('.candidate-choice input');for(const c of checks){c.checked=true;c.dispatchEvent(new x.w.Event('change'))}
  [...box.querySelectorAll('button')].find(b=>b.textContent==='Comparer les profils sélectionnés').click();await tick();checks[0].checked=false;checks[0].dispatchEvent(new x.w.Event('change'));
  finish({intro:'Ancienne sélection',works:[]});await tick();assert.equal(x.w.document.querySelector('#dialog').open,false);
 }finally{x.close()}
});

test('a failure loading linked showcase profiles never hides the editable professional profile',async()=>{
 let attempts=0;const x=await boot({'/api/my-profile':{profile:{trade:'plomberie',additional_trades:[],town:'Toulouse',service_zones:['Toulouse'],siren:'123456782',approved:true}},'/api/enterprise':()=>++attempts===1?{status:503,data:{detail:'Erreur temporaire'}}:{members:[{id:7,alias:'Équipe fictive',is_active:true}]}});
 try{
  await x.w.go('profile');assert.ok(x.w.document.querySelector('#view [name=siren]'));assert.match(x.w.document.querySelector('#view').textContent,/Modifier · Mon profil individuel/);
  input(x.w,'#view [name=town]','Blagnac');[...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent==='Réessayer les profils liés').click();await tick();
  assert.equal(x.w.document.querySelector('#view [name=town]').value,'Blagnac');assert.match(x.w.document.querySelector('#view').textContent,/Équipe fictive/);
 }finally{x.close()}
});

test('professional overview counts only active applications and conversations actually accessible',async()=>{
 const x=await boot({'/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},'/api/projects':{items:[{id:91,title:'Mission autorisée',town:'Toulouse',trade:'plomberie',status:'open'}],search_scope:'ready'},'/api/my-applications':{items:[{id:1,title:'En attente',status:'pending',project_status:'open'},{id:2,title:'Historique clôturé',status:'pending',project_status:'closed'},{id:3,title:'Sélection active',status:'accepted',project_status:'selected'}]},'/api/conversations':{items:[{application_id:3,subscription_active:1,linked_profile_id:null},{application_id:4,subscription_active:0},{application_id:5,subscription_active:1,linked_profile_id:7,linked_active:0}]},'/api/notifications?unread_only=true':{unread:2,items:[{message:'Notification fictive',read_at:null}]},'/api/my-profile':{profile:{approved:true,subscription_active:true}}});try{
  await x.w.go('professional-home');const panels=[...x.w.document.querySelectorAll('.overview-grid>.panel')],get=title=>panels.find(p=>p.querySelector('h3').textContent===title);
  assert.equal(get('Missions ouvertes accessibles').querySelector('.overview-count').textContent,'1');
  assert.deepEqual([...get('Vos candidatures').querySelectorAll('dd')].map(n=>n.textContent),['1','1']);
  assert.equal(get('Conversations accessibles').querySelector('.overview-count').textContent,'1');assert.match(get('Conversations accessibles').textContent,/2 échange/);
  assert.equal(get('Notifications non lues').querySelector('.overview-count').textContent,'2');assert.match(get('Profil et accès de test').textContent,/autorisé pour les tests/);
  assert.equal(x.calls.some(c=>c.method!=='GET'),false);
 }finally{x.close()}
});
test('professional overview isolates a failed section, never invents a zero and retries only that source',async()=>{
 let attempts=0;const x=await boot({'/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},'/api/projects':()=>++attempts===2?{status:503,data:{detail:'Erreur temporaire'}}:{items:[],search_scope:'ready'},'/api/my-applications':{items:[]},'/api/conversations':{items:[]},'/api/notifications?unread_only=true':{unread:3,items:[]}});try{
  await x.w.go('professional-home');const find=title=>[...x.w.document.querySelectorAll('.overview-grid>.panel')].find(p=>p.querySelector('h3').textContent===title);
  const failed=find('Missions ouvertes accessibles');assert.match(failed.textContent,/Information indisponible/);assert.equal(failed.querySelector('.overview-count'),null);
  assert.equal(find('Notifications non lues').querySelector('.overview-count').textContent,'3');const before=x.calls.length;
  [...failed.querySelectorAll('button')].find(b=>b.textContent==='Réessayer cette rubrique').click();await tick();
  assert.equal(x.calls.length,before+1);assert.equal(failed.querySelector('.overview-count').textContent,'0');
 }finally{x.close()}
});
test('professional overview navigation stays reserved to the professional menu',async()=>{
 const x=await boot();try{assert.equal([...x.w.document.querySelectorAll('#tabs button')].some(b=>b.textContent==='Vue d’ensemble'),false);await x.w.go('professional-home');assert.match(x.w.document.querySelector('#view').textContent,/réservée à l’espace professionnel/);assert.equal(x.calls.some(c=>c.url==='/api/my-applications'),false)}finally{x.close()}
});

test('a mission opened from the professional overview returns to that overview',async()=>{
 const project={id:91,title:'Mission fictive',description:'Description entièrement fictive de la mission.',trade:'plomberie',trades:['plomberie'],town:'Toulouse',status:'open',photos:[],own_application:null};
 const x=await boot({'/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},'/api/projects':{items:[project],search_scope:'ready'},'/api/my-applications':{items:[]},'/api/conversations':{items:[]},'/api/notifications?unread_only=true':{unread:0,items:[]},'/api/v4/projects/91':project});try{
  await x.w.go('professional-home');[...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent==='Consulter ce projet').click();await tick();
  const back=[...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent==='← Vue d’ensemble');assert.ok(back);back.click();await tick();assert.ok(x.w.document.querySelector('.overview-grid'));
 }finally{x.close()}
});

test('notification center paginates unread history and marks only the selected notification',async()=>{
 const note=id=>({id,message:'Notification fictive '+id,created_at:'2026-10-28T10:00:00Z',read_at:null});
 const x=await boot({'/api/notifications':{unread:2,items:[note(9)],next_before_id:9},'/api/notifications?unread_only=true':{unread:2,items:[note(9)],next_before_id:9},'/api/notifications?unread_only=true&before_id=9':{unread:2,items:[note(8)],next_before_id:null},'POST /api/notifications/9/read':{ok:true,read_at:'2026-10-28T11:00:00Z',unread:1}});try{
  await x.w.go('notifications');const filter=x.w.document.querySelector('[name=notification_filter]');filter.value='unread';filter.dispatchEvent(new x.w.Event('change'));await tick();
  [...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent==='Voir les notifications plus anciennes').click();await tick();assert.equal(x.w.document.querySelectorAll('#view article').length,2);
  [...x.w.document.querySelectorAll('#view article button')][0].click();await tick();assert.equal(x.w.document.querySelectorAll('#view article').length,1);assert.match(x.w.document.querySelector('#view').textContent,/1 notification\(s\) non lue/);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,1);assert.equal(x.calls.find(c=>c.method==='POST').url,'/api/notifications/9/read');
 }finally{x.close()}
});
test('notification history preserves visible results and cursor after a page load failure',async()=>{
 let attempts=0;const x=await boot({'/api/notifications':{unread:2,items:[{id:9,message:'À conserver',created_at:'2026-10-28T10:00:00Z',read_at:null}],next_before_id:9},'/api/notifications?before_id=9':()=>++attempts===1?{status:503,data:{detail:'Panne temporaire'}}:{unread:2,items:[{id:8,message:'Page reprise',created_at:'2026-10-28T10:00:00Z',read_at:null}],next_before_id:null}});try{
  await x.w.go('notifications');[...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent==='Voir les notifications plus anciennes').click();await tick();assert.match(x.w.document.querySelector('#view').textContent,/À conserver/);assert.match(x.w.document.querySelector('#view').textContent,/résultats précédents/);
  [...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent==='Réessayer le chargement').click();await tick();assert.equal(x.w.document.querySelectorAll('#view article').length,2);
 }finally{x.close()}
});
test('an older unread filter response cannot replace a newer all-notifications result',async()=>{
 let finish;const x=await boot({'/api/notifications':{unread:0,items:[{id:9,message:'Notification déjà lue',read_at:'2026-10-28',created_at:'2026-10-28'}],next_before_id:null},'/api/notifications?unread_only=true':()=>new Promise(resolve=>finish=resolve)});try{
  await x.w.go('notifications');const filter=x.w.document.querySelector('[name=notification_filter]');filter.value='unread';filter.dispatchEvent(new x.w.Event('change'));await tick();filter.value='all';filter.dispatchEvent(new x.w.Event('change'));await tick();finish({unread:1,items:[{id:10,message:'Ancien résultat non lu',read_at:null,created_at:'2026-10-28'}]});await tick();
  assert.match(x.w.document.querySelector('#view').textContent,/Notification déjà lue/);assert.doesNotMatch(x.w.document.querySelector('#view').textContent,/Ancien résultat non lu/);
 }finally{x.close()}
});

test('marking all notifications read preserves the unread filter and refreshes its actual empty state',async()=>{
 let done=false;const note={id:9,message:'À lire',created_at:'2026-10-28',read_at:null};
 const x=await boot({'/api/notifications':{unread:1,items:[note],next_before_id:null},'/api/notifications?unread_only=true':()=>({unread:done?0:1,items:done?[]:[note],next_before_id:null}),'POST /api/notifications/read-all':()=>{done=true;return {ok:true,count:1,unread:0}}});try{
  await x.w.go('notifications');const filter=x.w.document.querySelector('[name=notification_filter]');filter.value='unread';filter.dispatchEvent(new x.w.Event('change'));await tick();
  const mark=[...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent==='Tout marquer comme lu');mark.click();await tick();await tick();
  assert.equal(filter.value,'unread');assert.equal(mark.disabled,true);assert.equal(x.w.document.querySelectorAll('#view article').length,0);assert.match(x.w.document.querySelector('#view').textContent,/0 notification\(s\) non lue/);
  assert.equal(x.calls.find(c=>c.method==='POST').headers['x-ucp-csrf'],'test-token');
 }finally{x.close()}
});

const savedProSession={id:2,name:'Pro fictif',role:'professional',csrf:'pro-token'};
function savedButton(w,label,scope='.saved-searches'){return [...w.document.querySelectorAll(scope+' button')].find(b=>b.textContent===label)}
function chooseSaved(w,id){const s=w.document.querySelector('[name=saved_search]');s.value=String(id);s.dispatchEvent(new w.Event('change'))}

test('saved search persists entered criteria including zero and prevents a double submission',async()=>{
 let stored=[];
 const x=await boot({'/api/session':savedProSession,'/api/projects':{items:[],search_scope:'ready'},'/api/saved-searches':()=>({items:stored}),
 'POST /api/saved-searches':c=>{const item={id:6,...c.body};stored=[item];return item}});
 try{
  input(x.w,'.project-search [name=q]','fuite');input(x.w,'.project-search [name=budget_from]','0');input(x.w,'.saved-searches [name=label]','Mes critères');
  submit(x.w,'.saved-searches form');submit(x.w,'.saved-searches form');await tick();await tick();
  const posts=x.calls.filter(c=>c.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].body.criteria.budget_from,0);assert.equal(posts[0].body.criteria.q,'fuite');assert.equal(posts[0].headers['x-ucp-csrf'],'pro-token');
  assert.equal(x.w.document.querySelector('[name=saved_search]').value,'6');assert.equal(x.w.document.querySelector('.project-search [name=q]').value,'fuite');assert.match(x.w.document.querySelector('.saved-searches').textContent,/1 \/ 10/);
 }finally{x.close()}
});

test('applying a stored search queries current authorized results with all its criteria',async()=>{
 const criteria={q:'fuite',trade:'plomberie',town:'Toulouse',budget_from:0,sort:'oldest'};
 const path='/api/projects?q=fuite&trade=plomberie&town=Toulouse&budget_from=0&sort=oldest';
 const x=await boot({'/api/session':savedProSession,'/api/projects':{items:[],search_scope:'ready'},'/api/saved-searches':{items:[{id:6,label:'Toulouse',criteria}]},[path]:{items:[]}});
 try{
  chooseSaved(x.w,6);savedButton(x.w,'Appliquer la recherche').click();await tick();
  assert.ok(x.calls.some(c=>c.url===path));assert.equal(x.w.document.querySelector('.project-search [name=budget_from]').value,'0');assert.equal(x.w.document.querySelector('.project-search [name=q]').value,'fuite');
  assert.match(x.w.document.querySelector('.count').textContent,/0 projet/);assert.equal(x.calls.filter(c=>c.method!=='GET').length,0);
 }finally{x.close()}
});

test('a saved-search outage does not block project results or erase criteria on retry',async()=>{
 let rejectPending,attempts=0;
 const first=new Promise((resolve,reject)=>{rejectPending=reject});
 const project={id:7,title:'Projet à conserver',town:'Toulouse',trade:'plomberie',status:'open'};
 const x=await boot({'/api/session':savedProSession,'/api/projects':{items:[project],search_scope:'ready'},'/api/saved-searches':()=>++attempts===1?first:{items:[{id:6,label:'<img src=x onerror=oops()>',criteria:{}}]}});
 try{
  assert.match(x.w.document.querySelector('.project-list').textContent,/Projet à conserver/);input(x.w,'.project-search [name=q]','Ma saisie');rejectPending(Error('offline'));await tick();
  assert.match(x.w.document.querySelector('.saved-searches').textContent,/Impossible de charger/);savedButton(x.w,'Actualiser les recherches').click();await tick();
  assert.equal(x.w.document.querySelector('.project-search [name=q]').value,'Ma saisie');assert.match(x.w.document.querySelector('.project-list').textContent,/Projet à conserver/);assert.equal(x.w.document.querySelector('.saved-searches img'),null);assert.match(x.w.document.querySelector('[name=saved_search]').textContent,/<img src=x/);
 }finally{x.close()}
});

test('a rejected saved-search creation retains the chosen name and unsent search criteria',async()=>{
 const x=await boot({'/api/session':savedProSession,'/api/projects':{items:[],search_scope:'ready'},'POST /api/saved-searches':{status:409,data:{detail:'Une recherche porte déjà ce nom.'}}});
 try{
  input(x.w,'.project-search [name=q]','À conserver');input(x.w,'.saved-searches [name=label]','Nom existant');submit(x.w,'.saved-searches form');await tick();
  assert.equal(x.w.document.querySelector('.project-search [name=q]').value,'À conserver');assert.equal(x.w.document.querySelector('.saved-searches [name=label]').value,'Nom existant');assert.match(x.w.document.querySelector('#alert').textContent,/déjà ce nom/);
 }finally{x.close()}
});

test('deleting a stored search requires its confirmation and preserves the current search form',async()=>{
 let stored=[{id:6,label:'À supprimer',criteria:{q:'ancien'}}];
 const x=await boot({'/api/session':savedProSession,'/api/projects':{items:[],search_scope:'ready'},'/api/saved-searches':()=>({items:stored}),'DELETE /api/saved-searches/6':()=>{stored=[];return {ok:true}}});
 try{
  input(x.w,'.project-search [name=q]','Ma recherche actuelle');chooseSaved(x.w,6);savedButton(x.w,'Supprimer la recherche').click();assert.equal(x.calls.filter(c=>c.method==='DELETE').length,0);
  savedButton(x.w,'Supprimer','#dialog').click();await tick();await tick();
  assert.equal(x.calls.filter(c=>c.method==='DELETE').length,1);assert.equal(x.w.document.querySelector('.project-search [name=q]').value,'Ma recherche actuelle');assert.match(x.w.document.querySelector('.saved-searches').textContent,/0 \/ 10/);
 }finally{x.close()}
});

test('late saved-search results cannot replace a page visited afterwards',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve});
 const x=await boot({'/api/session':savedProSession,'/api/projects':{items:[],search_scope:'ready'},'/api/saved-searches':()=>pending,'/api/notifications':{items:[],unread:0,next_before_id:null}});
 try{
  await x.w.go('notifications');release({items:[{id:6,label:'Ancienne page privée',criteria:{}}]});await tick();
  assert.equal(x.w.document.querySelector('.saved-searches'),null);assert.doesNotMatch(x.w.document.querySelector('#view').textContent,/Ancienne page privée/);
 }finally{x.close()}
});

test('requester project navigation does not request or display professional saved searches',async()=>{
 const x=await boot();try{assert.equal(x.w.document.querySelector('.saved-searches'),null);assert.ok(!x.calls.some(c=>c.url==='/api/saved-searches'))}finally{x.close()}
});

test('unavailable stored options remain explicit and a failed application preserves previous results',async()=>{
 const criteria={trade:'ancien-metier',town:'Commune sans missions',published_within:14,sort:'newest'};
 const query='/api/projects?trade=ancien-metier&town=Commune+sans+missions&published_within=14&sort=newest';
 const project={id:7,title:'Derniers résultats autorisés',town:'Toulouse',trade:'plomberie',status:'open'};
 const x=await boot({'/api/session':savedProSession,'/api/projects':{items:[project],search_scope:'ready'},'/api/saved-searches':{items:[{id:6,label:'Ancien périmètre',criteria}]},[query]:{status:503,data:{detail:'Indisponible'}}});
 try{
  chooseSaved(x.w,6);savedButton(x.w,'Appliquer la recherche').click();await tick();
  assert.equal(x.w.document.querySelector('.project-search [name=trade]').value,'ancien-metier');assert.equal(x.w.document.querySelector('.project-search [name=town]').value,'Commune sans missions');assert.equal(x.w.document.querySelector('.project-search [name=published_within]').value,'14');
  assert.match(x.w.document.querySelector('.project-list').textContent,/Derniers résultats autorisés/);assert.match(x.w.document.querySelector('.count').textContent,/Recherche non appliquée/);assert.match(x.w.document.querySelector('.project-search [name=trade]').textContent,/critère enregistré/);
 }finally{x.close()}
});

function draftClock(w){
 const timers=new Map(),set=w.setTimeout.bind(w),clear=w.clearTimeout.bind(w);let id=100000;
 w.setTimeout=(fn,delay,...args)=>{if(delay!==1200)return set(fn,delay,...args);const key=++id;timers.set(key,()=>fn(...args));return key};
 w.clearTimeout=key=>{if(!timers.delete(key))clear(key)};
 return {size:()=>timers.size,fire(){assert.equal(timers.size,1);const [key,fn]=timers.entries().next().value;timers.delete(key);fn()}};
}
const resumedDraft={id:51,version:1,title:'Projet déjà enregistré',description:'Description fictive suffisamment détaillée pour une demande.',town:'Toulouse',trades:['plomberie'],timing:'flexible',budget_min:null,budget_max:null,photos:[]};
function draftButton(w,label,scope='.wizard'){return [...w.document.querySelectorAll(scope+' button')].find(b=>b.textContent===label)}

test('draft autosave waits for a pause, stores only the latest text and does not move focus',async()=>{
 let clock;const x=await boot({'POST /api/v4/drafts':{id:51,version:1}},w=>{clock=draftClock(w)});
 try{
  x.w.startWizard();const title=x.w.document.querySelector('.wizard [name=title]');title.focus();input(x.w,'.wizard [name=title]','Première saisie');input(x.w,'.wizard [name=title]','Dernière saisie');
  assert.equal(clock.size(),1);assert.equal(x.calls.filter(c=>c.method==='POST').length,0);clock.fire();await tick();
  const calls=x.calls.filter(c=>c.method==='POST');assert.equal(calls.length,1);assert.equal(calls[0].body.title,'Dernière saisie');assert.ok(calls[0].headers['Idempotency-Key'].length>=16);
  assert.equal(x.w.document.activeElement,title);assert.match(x.w.document.querySelector('.draft-save-status').textContent,/Brouillon enregistré/);assert.equal(clock.size(),0);
 }finally{x.close()}
});

test('manual continuation waits for an initial autosave then flushes text entered while it was pending',async()=>{
 let clock,release;
 const x=await boot({'POST /api/v4/drafts':()=>new Promise(resolve=>{release=resolve}),'PUT /api/v4/drafts/51':{id:51,version:2}},w=>{clock=draftClock(w)});
 try{
  x.w.startWizard();input(x.w,'.wizard [name=title]','Titre avant réponse');input(x.w,'.wizard [name=description]','Description fictive saisie avant la première sauvegarde.');
  const trade=x.w.document.querySelector('.wizard input[value=plomberie]');trade.checked=true;trade.dispatchEvent(new x.w.Event('change',{bubbles:true}));
  clock.fire();await tick();input(x.w,'.wizard [name=title]','Titre saisi pendant la sauvegarde');submit(x.w,'.wizard form');await tick();assert.equal(x.calls.filter(c=>c.method==='PUT').length,0);
  release({id:51,version:1});await tick();await tick();
  assert.equal(x.calls.filter(c=>c.method==='POST').length,1);const put=x.calls.find(c=>c.method==='PUT');assert.equal(put.body.title,'Titre saisi pendant la sauvegarde');assert.equal(put.body.version,1);assert.match(x.w.document.querySelector('.wizard h2').textContent,/Parlez-nous/);
 }finally{x.close()}
});

test('a lost creation response pauses autosave and explicit retry recovers the same intent before saving newer text',async()=>{
 let clock,attempts=0;
 const x=await boot({'POST /api/v4/drafts':()=>{if(++attempts===1)throw Error('response lost');return {id:51,version:1}},'PUT /api/v4/drafts/51':{id:51,version:2}},w=>{clock=draftClock(w)});
 try{
  x.w.startWizard();input(x.w,'.wizard [name=title]','Texte envoyé initialement');clock.fire();await tick();assert.match(x.w.document.querySelector('.draft-save-status').textContent,/non confirmé/);assert.equal(x.w.document.querySelector('#alert').textContent,'');
  input(x.w,'.wizard [name=title]','Texte conservé pendant la panne');assert.equal(clock.size(),0);draftButton(x.w,'Réessayer l’enregistrement').click();await tick();await tick();
  const creates=x.calls.filter(c=>c.method==='POST');assert.equal(creates.length,2);assert.deepEqual(creates[0].body,creates[1].body);assert.equal(creates[0].headers['Idempotency-Key'],creates[1].headers['Idempotency-Key']);
  const put=x.calls.find(c=>c.method==='PUT');assert.equal(put.body.title,'Texte conservé pendant la panne');assert.equal(put.body.version,1);assert.equal(x.w.document.querySelector('.wizard [name=title]').value,'Texte conservé pendant la panne');assert.match(x.w.document.querySelector('.draft-save-status').textContent,/Brouillon enregistré/);
 }finally{x.close()}
});

test('a draft version conflict stops automatic writes and offers a copy before explicitly loading the server version',async()=>{
 let clock;const server={...resumedDraft,title:'Version du compte à conserver',version:3};
 const x=await boot({'PUT /api/v4/drafts/51':{status:409,data:{detail:'Ce brouillon a changé dans une autre fenêtre.'}},'/api/v4/drafts':{items:[server]}},w=>{clock=draftClock(w)});
 try{
  x.w.startWizard(resumedDraft);input(x.w,'.wizard [name=title]','<img src=x> Ma copie locale');clock.fire();await tick();
  assert.match(x.w.document.querySelector('.draft-save-status').textContent,/aucun écrasement automatique/);input(x.w,'.wizard [name=title]','Ma saisie la plus récente');assert.equal(clock.size(),0);
  draftButton(x.w,'Récupérer ma saisie').click();assert.match(x.w.document.querySelector('#dialog textarea').value,/Ma saisie la plus récente/);assert.equal(x.w.document.querySelector('#dialog img'),null);
  draftButton(x.w,'Charger le brouillon du compte','#dialog').click();await tick();
  assert.equal(x.w.document.querySelector('.wizard [name=title]').value,server.title);assert.equal(x.calls.filter(c=>c.method==='PUT').length,1);assert.equal(clock.size(),0);
 }finally{x.close()}
});

test('invalid budget blocks automatic writes, then a correction can be saved without losing zero',async()=>{
 let clock,version=1;const x=await boot({'PUT /api/v4/drafts/51':()=>({id:51,version:++version})},w=>{clock=draftClock(w)});
 try{
  x.w.startWizard(resumedDraft);submit(x.w,'.wizard form');await tick();const initial=x.calls.filter(c=>c.method==='PUT').length;
  input(x.w,'.wizard [name=budget_min]','-1');clock.fire();await tick();assert.equal(x.calls.filter(c=>c.method==='PUT').length,initial);assert.equal(x.w.document.querySelector('.wizard [name=budget_min]').value,'-1');
  input(x.w,'.wizard [name=budget_min]','0');clock.fire();await tick();const last=x.calls.filter(c=>c.method==='PUT').at(-1);assert.equal(last.body.budget_min,0);assert.equal(last.body.version,2);assert.match(x.w.document.querySelector('.draft-save-status').textContent,/Brouillon enregistré/);
 }finally{x.close()}
});

test('a late autosave response after logout cannot restore private draft UI or issue another write',async()=>{
 let clock,release;const x=await boot({'POST /api/v4/drafts':()=>new Promise(resolve=>{release=resolve}),'POST /api/logout':{ok:true}},w=>{clock=draftClock(w)});
 try{
  x.w.startWizard();input(x.w,'.wizard [name=title]','Saisie privée de l’ancien compte');clock.fire();await tick();x.w.document.querySelector('#logout').click();await tick();
  release({id:51,version:1});await tick();assert.equal(x.w.document.querySelector('.wizard'),null);assert.equal(x.w.document.querySelector('#anonymous').hidden,false);assert.equal(x.calls.filter(c=>c.method==='PUT').length,0);assert.equal(clock.size(),0);assert.doesNotMatch(x.w.document.querySelector('#alert').textContent,/Saisie privée|Réponse ignorée/);
 }finally{x.close()}
});

test('leaving a draft warns only for unsaved or pending work, not a confirmed save',async()=>{
 let clock,release;const x=await boot({'PUT /api/v4/drafts/51':()=>new Promise(resolve=>{release=resolve})},w=>{clock=draftClock(w)});
 function warned(){const event=new x.w.Event('beforeunload',{cancelable:true});x.w.dispatchEvent(event);return event.defaultPrevented}
 try{
  x.w.startWizard(resumedDraft);assert.equal(warned(),false);input(x.w,'.wizard [name=title]','Modification non envoyée');assert.equal(warned(),true);clock.fire();await tick();assert.equal(warned(),true);
  release({id:51,version:2});await tick();assert.equal(warned(),false);
 }finally{x.close()}
});

test('searching the trade picker does not create an empty draft but selecting and removing a trade are saved',async()=>{
 let clock;const x=await boot({'POST /api/v4/drafts':{id:51,version:1},'PUT /api/v4/drafts/51':{id:51,version:2}},w=>{clock=draftClock(w)});
 try{
  x.w.startWizard();input(x.w,'.wizard input[aria-label="Rechercher un métier"]','plomb');assert.equal(clock.size(),0);
  const trade=x.w.document.querySelector('.wizard input[value=plomberie]');trade.checked=true;trade.dispatchEvent(new x.w.Event('change',{bubbles:true}));clock.fire();await tick();assert.deepEqual(x.calls.find(c=>c.method==='POST').body.trades,['plomberie']);
  x.w.document.querySelector('.wizard .selected-trades button').click();clock.fire();await tick();assert.deepEqual(x.calls.find(c=>c.method==='PUT').body.trades,[]);
 }finally{x.close()}
});

test('recovering a lost initial response cannot confirm or overwrite a draft changed in another window',async()=>{
 let clock,attempts=0;
 const x=await boot({'POST /api/v4/drafts':()=>{if(++attempts===1)throw Error('lost');return {id:51,version:1,changed_since_creation:true}}},w=>{clock=draftClock(w)});
 try{
  x.w.startWizard();input(x.w,'.wizard [name=title]','Ma copie privée à préserver');clock.fire();await tick();draftButton(x.w,'Réessayer l’enregistrement').click();await tick();
  assert.match(x.w.document.querySelector('.draft-save-status').textContent,/Conflit de version/);assert.doesNotMatch(x.w.document.querySelector('.draft-save-status').textContent,/Brouillon enregistré/);assert.equal(x.calls.filter(c=>c.method==='PUT').length,0);assert.equal(clock.size(),0);
  draftButton(x.w,'Récupérer ma saisie').click();assert.match(x.w.document.querySelector('#dialog textarea').value,/Ma copie privée à préserver/);assert.ok(draftButton(x.w,'Charger le brouillon du compte','#dialog'));
 }finally{x.close()}
});

test('a change-only title edit is synchronized before the draft autosave snapshot',async()=>{
 let clock;const x=await boot({'POST /api/v4/drafts':{id:51,version:1}},w=>{clock=draftClock(w)});
 try{
  x.w.startWizard();const title=x.w.document.querySelector('.wizard [name=title]');title.value='Modification par remplissage';title.dispatchEvent(new x.w.Event('change',{bubbles:true}));clock.fire();await tick();assert.equal(x.calls.find(c=>c.method==='POST').body.title,title.value);
 }finally{x.close()}
});

test('removing a draft photo waits for autosave and keeps the photo mutation version for the next write',async()=>{
 let clock,release,puts=0;
 const x=await boot({'PUT /api/v4/drafts/51':()=>{if(++puts===2)return new Promise(resolve=>{release=resolve});return {id:51,version:puts===1?2:5}},'DELETE /api/v4/photos/7':{ok:true,version:4}},w=>{clock=draftClock(w)});
 try{
  x.w.startWizard({...resumedDraft,photos:[7]});submit(x.w,'.wizard form');await tick();input(x.w,'.wizard [name=town]','Blagnac');clock.fire();await tick();draftButton(x.w,'Retirer').click();await tick();assert.equal(x.calls.filter(c=>c.method==='DELETE').length,0);
  release({id:51,version:3});await tick();await tick();assert.equal(x.calls.filter(c=>c.method==='DELETE').length,1);input(x.w,'.wizard [name=budget_min]','0');clock.fire();await tick();assert.equal(x.calls.filter(c=>c.method==='PUT').at(-1).body.version,4);
 }finally{x.close()}
});

test('project report photos appear only after motivated review and are not fetched automatically',async()=>{
 const x=await boot({'/api/session':{id:99,name:'Admin',role:'admin',csrf:'admin-token'},'/api/admin/metrics':{counts:{}},'/api/admin/queue':{items:[]},'/api/admin/audit':{items:[]},'POST /api/v4/admin/reports/6/review':{report:{reason:'Projet fictif signalé'},context:{project:{id:7,title:'Projet fictif',description:'Description fictive',town:'Toulouse',photos:[31,32]},messages:[],next_before_id:null}}});
 try{
  x.w.reviewReport({id:6,kind:'project',target_id:7});assert.equal(x.w.document.querySelector('#dialog a[href^="/api/v4/photos/"]'),null);
  input(x.w,'#dialog [name=reason]','Examen motivé des seules photos du dossier.');submit(x.w,'#dialog form');await tick();
  const links=[...x.w.document.querySelectorAll('#dialog a[href^="/api/v4/photos/"]')];assert.deepEqual(links.map(a=>a.getAttribute('href')),['/api/v4/photos/31?report_id=6','/api/v4/photos/32?report_id=6']);assert.ok(links.every(a=>a.target==='_blank'&&a.rel==='noopener'));
  assert.equal(x.w.document.querySelector('#dialog img'),null);assert.ok(!x.calls.some(c=>c.url.startsWith('/api/v4/photos/')));assert.match(x.w.document.querySelector('#dialog').textContent,/journalisée/);
 }finally{x.close()}
});

test('navigation menu exposes its state, closes after a successful choice and orients focus to the page',async()=>{
 const x=await boot({'/api/notifications':{items:[],unread:0,next_before_id:null}});
 try{
  const toggle=x.w.document.querySelector('#navigation-toggle');assert.equal(toggle.getAttribute('aria-controls'),'tabs');assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(x.w.document.querySelector('#navigation-current').textContent,'Mes projets');
  toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(x.w.document.querySelector('.sidebar').dataset.navigationOpen,'true');
  [...x.w.document.querySelectorAll('#tabs button')].find(b=>b.textContent==='Notifications').click();await tick();
  assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(x.w.document.querySelector('#navigation-current').textContent,'Notifications');assert.equal(x.w.document.activeElement,x.w.document.querySelector('#view h2'));assert.equal(x.w.document.activeElement.getAttribute('tabindex'),'-1');assert.equal(x.w.document.title,'Notifications · Un Coup de Pouce');assert.equal(x.w.document.querySelector('#view').hasAttribute('aria-live'),false);
 }finally{x.close()}
});

test('Escape closes the expanded navigation and restores focus to its toggle without navigating',async()=>{
 const x=await boot();try{
  const toggle=x.w.document.querySelector('#navigation-toggle');toggle.click();const tab=x.w.document.querySelector('#tabs button');tab.focus();const count=x.calls.length;
  tab.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(x.w.document.activeElement,toggle);assert.equal(x.calls.length,count);
 }finally{x.close()}
});

test('failed draft saving keeps the navigation open and does not discard the wizard or its text',async()=>{
 const x=await boot({'POST /api/v4/drafts':()=>{throw Error('offline')}});try{
  x.w.startWizard();input(x.w,'.wizard [name=title]','Texte à conserver');const toggle=x.w.document.querySelector('#navigation-toggle');toggle.click();[...x.w.document.querySelectorAll('#tabs button')].find(b=>b.textContent==='Messages').click();await tick();
  assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(x.w.document.querySelector('.wizard [name=title]').value,'Texte à conserver');assert.match(x.w.document.querySelector('#alert').textContent,/Connexion interrompue/);assert.equal(x.w.document.title,'Décrire mon projet · Un Coup de Pouce');
 }finally{x.close()}
});

test('a late navigation cannot steal focus after a newer page has loaded',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve});
 const x=await boot({'/api/v4/support':()=>pending,'/api/notifications':{items:[],unread:0,next_before_id:null}});try{
  const old=x.w.go('support');await tick();await x.w.go('notifications');const filter=x.w.document.querySelector('[name=notification_filter]');filter.focus();release({items:[],categories:{other:'Autre demande'},next_before_id:null});await old;await tick();
  assert.equal(x.w.document.activeElement,filter);assert.equal(x.w.document.title,'Notifications · Un Coup de Pouce');
 }finally{x.close()}
});

test('dialog focus enters its first field, survives content replacement and returns to the opener',async()=>{
 const x=await boot();try{
  const opener=x.w.document.createElement('button');opener.textContent='Modifier';opener.addEventListener('click',()=>x.w.editProject({id:7,title:'Projet fictif',town:'Toulouse',description:'Description fictive assez longue.',trade:'plomberie'}));x.w.document.querySelector('#view').append(opener);opener.focus();opener.click();
  assert.equal(x.w.document.activeElement,x.w.document.querySelector('#dialog [name=title]'));
  x.w.showDialog('Résultat de consultation',x.w.document.createElement('p'));assert.equal(x.w.document.activeElement,x.w.document.querySelector('#dialog-title'));
  x.w.document.querySelector('#dialog-close').click();assert.equal(x.w.document.activeElement,opener);
 }finally{x.close()}
});

test('closing a dialog whose opener disappeared falls back to the current page heading',async()=>{
 const x=await boot();try{
  const opener=x.w.document.createElement('button');x.w.document.querySelector('#view').append(opener);opener.focus();x.w.showDialog('Dossier fictif',x.w.document.createElement('p'));opener.remove();x.w.document.querySelector('#dialog-close').click();assert.equal(x.w.document.activeElement,x.w.document.querySelector('#view h2'));
 }finally{x.close()}
});

test('wizard changes orient focus to their heading and logout removes the workspace title',async()=>{
 const x=await boot({'POST /api/v4/drafts':{id:51,version:1},'POST /api/logout':{ok:true}});try{
  x.w.startWizard(resumedDraft);assert.equal(x.w.document.activeElement,x.w.document.querySelector('.wizard h2'));assert.equal(x.w.document.title,'Décrire mon projet · Un Coup de Pouce');x.w.document.querySelector('#logout').click();await tick();assert.equal(x.w.document.title,'Un Coup de Pouce · Votre espace travaux');assert.equal(x.w.document.querySelector('#dashboard').hidden,true);
 }finally{x.close()}
});

test('a confirmed dialog action returns keyboard orientation to the refreshed page',async()=>{
 const x=await boot();try{
  x.w.ask('Confirmer cette action fictive ?','Le contenu de la page sera actualisé.',async()=>({ok:true}));[...x.w.document.querySelectorAll('#dialog button')].find(b=>b.textContent==='Confirmer').click();await tick();await tick();assert.equal(x.w.document.querySelector('#dialog').open,false);assert.equal(x.w.document.activeElement,x.w.document.querySelector('#view h2'));
 }finally{x.close()}
});

test('successful sign-in orients focus inside the new workspace and clears the password',async()=>{
 const x=await boot({'/api/session':{status:401,data:{detail:'Connexion requise'}},'POST /api/login':{user_id:2,name:'Pro fictif',role:'professional',csrf:'new-session'},'/api/projects':{items:[],search_scope:'ready'}});try{
  input(x.w,'#login-form [name=email]','fictif@ucp.test');input(x.w,'#login-form [name=password]','Fictional-password!2026');submit(x.w,'#login-form');await tick();await tick();
  assert.equal(x.w.document.querySelector('#dashboard').hidden,false);assert.equal(x.w.document.activeElement,x.w.document.querySelector('#view h2'));assert.equal(x.w.document.querySelector('#login-form [name=password]').value,'');assert.equal(x.w.document.title,'Trouver des projets · Un Coup de Pouce');
 }finally{x.close()}
});

test('a delayed confirmation cannot close or steal focus from a newer dialog',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve});const x=await boot();try{
  x.w.ask('Ancienne confirmation','Action fictive en cours.',()=>pending);[...x.w.document.querySelectorAll('#dialog button')].find(b=>b.textContent==='Confirmer').click();await tick();x.w.document.querySelector('#dialog').close();
  const field=x.w.document.createElement('input');field.setAttribute('aria-label','Nouvelle saisie');x.w.showDialog('Nouveau dialogue',field);assert.equal(x.w.document.activeElement,field);finish({ok:true});await tick();await tick();
  assert.equal(x.w.document.querySelector('#dialog').open,true);assert.equal(x.w.document.querySelector('#dialog-title').textContent,'Nouveau dialogue');assert.equal(x.w.document.activeElement,field);
 }finally{x.close()}
});

const favoriteProject={id:28,title:'Mission fictive à retenir',description:'Description fictive',town:'Toulouse',trade:'plomberie',trades:['plomberie'],status:'open',timing:'flexible',is_favorite:false,match:{profile:'individual',trades:['plomberie'],town:'Toulouse'}};

test('favorite saves are single-flight and a lost response can be retried without applying',async()=>{
 let attempts=0;const x=await boot({'/api/session':savedProSession,'/api/projects':{items:[favoriteProject],search_scope:'ready'},'PUT /api/project-favorites/28':()=>{if(++attempts===1)throw Error('Réponse perdue');return {project_id:28,is_favorite:true}}});
 try{
  const b=x.w.document.querySelector('.favorite-toggle');assert.equal(b.getAttribute('aria-pressed'),'false');
  b.click();b.click();await tick();assert.equal(attempts,1);assert.equal(b.disabled,false);assert.equal(b.getAttribute('aria-pressed'),'false');
  b.click();await tick();assert.equal(attempts,2);assert.equal(b.getAttribute('aria-pressed'),'true');assert.match(b.textContent,/Retirer/);assert.ok(!x.calls.some(c=>c.url.includes('/apply')));
 }finally{x.close()}
});

test('favorites list never displays or opens unavailable project content and removes it idempotently',async()=>{
 let stored=[{project_id:28,available:false,project:null}];const x=await boot({'/api/session':savedProSession,'/api/project-favorites':()=>({items:stored,limit:50}),'DELETE /api/project-favorites/28':()=>{stored=[];return {project_id:28,is_favorite:false}}});
 try{
  await x.w.go('favorites');assert.match(x.w.document.querySelector('#view').textContent,/Projet indisponible/);assert.ok(![...x.w.document.querySelectorAll('#view button')].some(b=>b.textContent==='Voir le projet →'));
  x.w.document.querySelector('.favorite-toggle').click();await tick();assert.match(x.w.document.querySelector('#view').textContent,/Aucun favori/);assert.match(x.w.document.querySelector('.count').textContent,/0 \/ 50/);assert.equal(x.calls.filter(c=>c.method==='DELETE').length,1);
 }finally{x.close()}
});

test('favorites available project uses the current authorized detail and returns to favorites',async()=>{
 const x=await boot({'/api/session':savedProSession,'/api/project-favorites':{items:[{project_id:28,available:true,project:{...favoriteProject,is_favorite:true}}],limit:50},'/api/v4/projects/28':{...favoriteProject,photos:[]}});
 try{
  await x.w.go('favorites');assert.equal(x.w.document.title,'Mes favoris · Un Coup de Pouce');savedButton(x.w,'Voir le projet →','#view').click();await tick();assert.ok(x.calls.some(c=>c.url==='/api/v4/projects/28'));assert.ok(savedButton(x.w,'← Mes favoris','#view'));
 }finally{x.close()}
});

test('failed favorite removal preserves its card and allows a retry',async()=>{
 const x=await boot({'/api/session':savedProSession,'/api/project-favorites':{items:[{project_id:28,available:true,project:{...favoriteProject,is_favorite:true}}],limit:50},'DELETE /api/project-favorites/28':{status:503,data:{detail:'Service indisponible'}}});
 try{await x.w.go('favorites');x.w.document.querySelector('.favorite-toggle').click();await tick();assert.match(x.w.document.querySelector('.project-list').textContent,/Mission fictive/);assert.equal(x.w.document.querySelector('.favorite-toggle').disabled,false);assert.match(x.w.document.querySelector('#alert').textContent,/indisponible/)}finally{x.close()}
});

test('late favorite listing cannot replace a newer page or introduce HTML',async()=>{
 let release;const pending=new Promise(r=>{release=r});const x=await boot({'/api/session':savedProSession,'/api/project-favorites':()=>pending,'/api/notifications':{items:[],unread:0,next_before_id:null}});
 try{const old=x.w.go('favorites');await tick();await x.w.go('notifications');release({items:[{project_id:28,available:true,project:{...favoriteProject,title:'<img src=x onerror=oops()>'}}],limit:50});await old;assert.equal(x.w.document.querySelector('#view img'),null);assert.doesNotMatch(x.w.document.querySelector('#view').textContent,/onerror/);assert.match(x.w.document.title,/Notifications/)}finally{x.close()}
});

test('a late favorite save cannot change the page or account visited afterwards',async()=>{
 let release;const pending=new Promise(r=>{release=r});const x=await boot({'/api/session':savedProSession,'/api/projects':{items:[favoriteProject],search_scope:'ready'},'PUT /api/project-favorites/28':()=>pending,'/api/notifications':{items:[],unread:0,next_before_id:null}});
 try{x.w.document.querySelector('.favorite-toggle').click();await tick();await x.w.go('notifications');release({project_id:28,is_favorite:true});await tick();assert.equal(x.w.document.querySelector('.favorite-toggle'),null);assert.match(x.w.document.title,/Notifications/)}finally{x.close()}
});

test('requesters have no professional favorite controls or favorite requests',async()=>{
 const x=await boot();try{assert.equal(x.w.document.querySelector('.favorite-toggle'),null);assert.ok(![...x.w.document.querySelectorAll('#tabs button')].some(b=>b.textContent==='Mes favoris'));assert.ok(!x.calls.some(c=>c.url.includes('project-favorites')))}finally{x.close()}
});

test('favorite titles are rendered as literal text and never as active markup',async()=>{
 const title='<img src=x onerror=oops()>';const x=await boot({'/api/session':savedProSession,'/api/project-favorites':{items:[{project_id:28,available:true,project:{...favoriteProject,title,is_favorite:true}}],limit:50}});
 try{await x.w.go('favorites');assert.equal(x.w.document.querySelector('.project-list img'),null);assert.equal(x.w.document.querySelector('.project-list h3').textContent,title);assert.equal(x.w.document.querySelector('.favorite-toggle').getAttribute('aria-label'),'Retirer des favoris · '+title)}finally{x.close()}
});

test('an application rate refusal preserves the project and waits for an explicit retry',async()=>{
 let attempts=0;const x=await boot({'/api/session':savedProSession,'/api/v4/projects/28':{...favoriteProject,photos:[]},'POST /api/projects/28/apply':()=>++attempts===1?{status:429,data:{detail:'Trop de candidatures rapprochées. Réessayez dans 60 s. Aucune nouvelle candidature n’a été enregistrée.'}}:{id:88},'/api/my-applications':{items:[]}});
 try{
  await x.w.projectDetail(favoriteProject);savedButton(x.w,'Proposer ma candidature','#view').click();await tick();
  assert.equal(attempts,1);assert.match(x.w.document.querySelector('#alert').textContent,/60 s/);assert.match(x.w.document.querySelector('#view').textContent,/Mission fictive/);assert.ok(savedButton(x.w,'Proposer ma candidature','#view'));assert.ok(!x.calls.some(c=>c.url==='/api/my-applications'));
  await tick();assert.equal(attempts,1);savedButton(x.w,'Proposer ma candidature','#view').click();await tick();assert.equal(attempts,2);assert.ok(x.calls.some(c=>c.url==='/api/my-applications'));
 }finally{x.close()}
});

test('restricted candidate details are explained in cards and in the comparison',async()=>{
 const x=await boot();try{
  const holder=x.w.document.createElement('section');x.w.document.querySelector('#view').replaceChildren(holder);
  x.w.renderCandidateCards(holder,[{id:1,professional_name:'Profil professionnel',status:'pending',trades:[],service_zones:[],public_details_restricted:true},{id:2,professional_name:'Atelier fictif',status:'pending',trades:['plomberie'],service_zones:['Toulouse']}]);
  assert.match(holder.textContent,/Certaines informations ont été masquées/);assert.match(holder.textContent,/Non affichés/);assert.match(holder.textContent,/Non affichées/);
  for(const check of holder.querySelectorAll('input[type=checkbox]')){check.checked=true;check.dispatchEvent(new x.w.Event('change'))}
  savedButton(x.w,'Comparer les profils sélectionnés','#view').click();await tick();assert.match(x.w.document.querySelector('#dialog-content').textContent,/Certaines informations ont été masquées/);assert.match(x.w.document.querySelector('#dialog-content').textContent,/Atelier fictif/);
 }finally{x.close()}
});

test('a withheld legacy presentation displays the unavailable state without exposing an error body',async()=>{
 const x=await boot({'/api/projects/10/applications/31/showcase':{status:404,data:{detail:'Présentation indisponible'}}});
 try{await x.w.openCandidateShowcase(10,{id:31,professional_name:'Profil professionnel'});assert.match(x.w.document.querySelector('#dialog-content').textContent,/présentation n’est plus disponible/);assert.equal(x.w.document.querySelector('#dialog').open,true)}finally{x.close()}
});

function helpButton(x,label){const b=[...x.w.document.querySelectorAll('.guided-helper button')].find(b=>b.textContent===label);assert.ok(b,label);return b}
async function helpSend(x,text){input(x.w,'.guided-helper textarea',text);submit(x.w,'.guided-helper form');await tick()}
async function prepareHelpProposal(x){
 x.w.openGuidedHelp();helpButton(x,'Préparer mon annonce').click();await helpSend(x,'Remplacer un évier et réparer une fuite dans la cuisine.');
 helpButton(x,'Plomberie').click();helpButton(x,'Confirmer les métiers').click();await helpSend(x,'Toulouse');helpButton(x,'Dans le mois').click();
}

test('requester chatbot prepares a proposal without writing or publishing before confirmation',async()=>{
 const x=await boot();try{
  const before=x.calls.length;assert.equal(x.w.document.querySelector('#guided-help-open').hidden,false);await prepareHelpProposal(x);
  assert.match(x.w.document.querySelector('.helper-proposal').textContent,/Remplacer un évier/);assert.equal(x.calls.length,before);
  helpButton(x,'Utiliser cette proposition').click();await tick();assert.equal(x.w.document.querySelector('#dialog').open,false);
  assert.match(x.w.document.querySelector('#view').textContent,/De quoi avez-vous besoin/);assert.equal(x.w.document.querySelector('#view [name=title]').value,'Remplacer un évier et réparer une fuite dans la cuisine');
  assert.ok(!x.calls.some(c=>c.method==='POST'));assert.ok(!x.calls.some(c=>c.url.endsWith('/publish')));
 }finally{x.close()}
});

test('chatbot refuses contact details and treats markup as literal conversation text',async()=>{
 const x=await boot();try{
  x.w.openGuidedHelp();await helpSend(x,'Appelez au ０６ １２ ３４ ５６ ７８');assert.match(x.w.document.querySelector('.guided-helper [role=status]').textContent,/Retirez les coordonnées/);assert.doesNotMatch(x.w.document.querySelector('.helper-log').textContent,/０６/);
  await helpSend(x,'<img src=x onerror=oops()>');assert.equal(x.w.document.querySelector('.guided-helper img'),null);assert.match(x.w.document.querySelector('.helper-log').textContent,/<img src=x/);
 }finally{x.close()}
});

test('trades require an explicit choice and unknown cannot be mixed with a precise trade',async()=>{
 const x=await boot();try{
  x.w.openGuidedHelp();helpButton(x,'Préparer mon annonce').click();await helpSend(x,'Remplacer un évier dans ma cuisine.');helpButton(x,'Confirmer les métiers').click();assert.match(x.w.document.querySelector('.guided-helper [role=status]').textContent,/Choisissez au moins un métier/);
  helpButton(x,'Plomberie').click();helpButton(x,'Je ne sais pas').click();assert.equal(helpButton(x,'Plomberie').getAttribute('aria-pressed'),'false');assert.equal(helpButton(x,'Je ne sais pas').getAttribute('aria-pressed'),'true');
  helpButton(x,'Plomberie').click();assert.equal(helpButton(x,'Je ne sais pas').getAttribute('aria-pressed'),'false');
 }finally{x.close()}
});

test('professional chatbot gives role-specific guidance and only navigates on explicit action',async()=>{
 const x=await boot({'/api/session':savedProSession,'/api/my-applications':{items:[]}});try{
  x.w.openGuidedHelp();assert.ok(![...x.w.document.querySelectorAll('.guided-helper button')].some(b=>b.textContent==='Préparer mon annonce'));
  const before=x.calls.length;helpButton(x,'Pourquoi le chat est bloqué ?').click();assert.match(x.w.document.querySelector('.helper-log').textContent,/je ne peux pas débloquer/);assert.equal(x.calls.length,before);
  helpButton(x,'Voir mes candidatures').click();await tick();assert.equal(x.w.document.querySelector('#dialog').open,false);assert.ok(x.calls.some(c=>c.url==='/api/my-applications'));
 }finally{x.close()}
});

test('chatbot conversation is reset on logout and never stored in browser persistence',async()=>{
 const x=await boot({'POST /api/logout':{ok:true}});try{
  x.w.openGuidedHelp();await helpSend(x,'Une question privée de recette');x.w.document.querySelector('#logout').click();await tick();
  assert.equal(x.w.document.querySelector('#guided-help-open').hidden,true);assert.equal(x.w.document.querySelector('.guided-helper'),null);assert.equal(x.w.localStorage.length,0);assert.equal(x.w.sessionStorage.length,0);
  x.w.openGuidedHelp();assert.equal(x.w.document.querySelector('.guided-helper'),null);
 }finally{x.close()}
});

test('a failed save keeps the existing wizard and the chatbot proposal available',async()=>{
 const x=await boot({'POST /api/v4/drafts':{status:503,data:{detail:'Enregistrement indisponible'}}});try{
  x.w.startWizard();input(x.w,'#view [name=title]','Mon brouillon initial');input(x.w,'#view [name=description]','La description initiale de mes travaux fictifs.');
  await prepareHelpProposal(x);helpButton(x,'Utiliser cette proposition').click();await tick();await tick();
  assert.equal(x.w.document.querySelector('#view [name=title]').value,'Mon brouillon initial');assert.equal(x.w.document.querySelector('#dialog').open,true);assert.match(x.w.document.querySelector('.helper-proposal').textContent,/Remplacer un évier/);assert.ok(!x.calls.some(c=>c.url.endsWith('/publish')));
 }finally{x.close()}
});

test('closing the chatbot while its previous draft saves cancels the later replacement',async()=>{
 let release;const pending=new Promise(r=>{release=r});const x=await boot({'POST /api/v4/drafts':()=>pending});try{
  x.w.startWizard();input(x.w,'#view [name=title]','Mon brouillon initial');input(x.w,'#view [name=description]','La description initiale de mes travaux fictifs.');
  await prepareHelpProposal(x);helpButton(x,'Utiliser cette proposition').click();await tick();x.w.document.querySelector('#dialog').close();release({id:601,version:1});await tick();await tick();
  assert.equal(x.w.document.querySelector('#view [name=title]').value,'Mon brouillon initial');assert.equal(x.w.document.querySelector('#dialog').open,false);
 }finally{x.close()}
});

test('chatbot history stays bounded and a restart discards the previous conversation',async()=>{
 const x=await boot();try{x.w.openGuidedHelp();for(let i=0;i<30;i++)await helpSend(x,'Question fictive numéro '+i);assert.ok(x.w.document.querySelectorAll('.helper-message').length<=24);helpButton(x,'Nouvelle conversation').click();assert.equal(x.w.document.querySelectorAll('.helper-message').length,1)}finally{x.close()}
});

test('chatbot saves an existing draft before transferring a fresh proposal without publishing',async()=>{
 const x=await boot({'POST /api/v4/drafts':{id:801,version:1}});try{
  x.w.startWizard();input(x.w,'#view [name=title]','Mon brouillon initial');input(x.w,'#view [name=description]','La description initiale de mes travaux fictifs.');
  await prepareHelpProposal(x);helpButton(x,'Utiliser cette proposition').click();helpButton(x,'Utiliser cette proposition').click();await tick();await tick();
  const writes=x.calls.filter(c=>c.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].body.title,'Mon brouillon initial');assert.equal(writes[0].body.description,'La description initiale de mes travaux fictifs.');assert.match(x.w.document.querySelector('#view [name=title]').value,/Remplacer un évier/);
 }finally{x.close()}
});

test('a delayed chatbot transfer cannot replace the page after logout',async()=>{
 let release;const pending=new Promise(r=>{release=r});const x=await boot({'POST /api/v4/drafts':()=>pending,'POST /api/logout':{ok:true}});try{
  x.w.startWizard();input(x.w,'#view [name=title]','Mon brouillon initial');input(x.w,'#view [name=description]','La description initiale de mes travaux fictifs.');
  await prepareHelpProposal(x);helpButton(x,'Utiliser cette proposition').click();await tick();
  x.w.eval('appState.user=null;appState.csrf=null;stopDraft();render()');release({id:802,version:1});await tick();await tick();assert.equal(x.w.document.querySelector('#dashboard').hidden,true);assert.equal(x.w.document.querySelector('.guided-helper'),null);assert.doesNotMatch(x.w.document.querySelector('#view').textContent,/Remplacer un évier/);
 }finally{x.close()}
});

test('chatbot appends new messages without replacing earlier log nodes',async()=>{
 const x=await boot();try{x.w.openGuidedHelp();const first=x.w.document.querySelector('.helper-message');await helpSend(x,'Comment fonctionne le budget ?');assert.equal(x.w.document.querySelector('.helper-message'),first);assert.match(x.w.document.querySelector('.helper-log').textContent,/ne vaut pas devis/)}finally{x.close()}
});

test('unavailable chatbot module leaves the core application usable',async()=>{
 const x=await boot({},w=>Object.defineProperty(w,'UCPGuidedHelp',{configurable:true,get:()=>undefined,set:()=>{}}));try{assert.equal(x.w.document.querySelector('#dashboard').hidden,false);assert.match(x.w.document.querySelector('#view').textContent,/Vos projets/);x.w.openGuidedHelp();assert.match(x.w.document.querySelector('#alert').textContent,/assistant n’a pas pu être chargé/)}finally{x.close()}
});

const enterpriseEffectsData={enterprise:{id:4,label:'Entreprise fictive'},members:[{id:8,alias:'Equipe plomberie',trades:['plomberie'],zones:['Toulouse'],is_active:1}],pricing:{active_artisans:1,monthly_ht:35,linked_artisans_active:1,manager_counted_as_artisan:false}};

test('linked profile deactivation explains withdrawals and blocked messages before sending',async()=>{
 const x=await boot({'/api/session':savedProSession,'/api/enterprise':enterpriseEffectsData,'POST /api/enterprise/artisans/8/set-active':{ok:true}});try{
  await x.w.go('enterprise');savedButton(x.w,'Désactiver ce profil','#view').click();await tick();
  assert.match(x.w.document.querySelector('#dialog-content').textContent,/candidatures en attente.*retirées/);assert.match(x.w.document.querySelector('#dialog-content').textContent,/messages deviennent inaccessibles/);assert.ok(!x.calls.some(c=>c.url.endsWith('/set-active')));
  x.w.document.querySelector('#dialog-close').click();assert.ok(!x.calls.some(c=>c.url.endsWith('/set-active')));
  savedButton(x.w,'Désactiver ce profil','#view').click();savedButton(x.w,'Confirmer','#dialog-content').click();await tick();assert.equal(x.calls.filter(c=>c.url.endsWith('/set-active')).length,1);
 }finally{x.close()}
});

test('linked profile reactivation states that withdrawals and chat permissions are not restored implicitly',async()=>{
 const x=await boot({'/api/session':savedProSession,'/api/enterprise':{...enterpriseEffectsData,members:[{...enterpriseEffectsData.members[0],is_active:0}]}});try{
  await x.w.go('enterprise');savedButton(x.w,'Réactiver ce profil','#view').click();await tick();assert.match(x.w.document.querySelector('#dialog-content').textContent,/candidatures retirées ne seront pas rétablies/);assert.match(x.w.document.querySelector('#dialog-content').textContent,/ne garantit pas son ouverture/);assert.ok(!x.calls.some(c=>c.url.endsWith('/set-active')));
 }finally{x.close()}
});

test('professional entry changes onboarding and registration choice without changing any permissions',async()=>{
 const x=await boot({'/api/session':{status:401,data:{detail:'Connexion requise'}}},null,'http://localhost:8765/professionnel');
 try{
  const d=x.w.document;
  assert.equal(d.querySelector('#space-professional').getAttribute('aria-pressed'),'true');
  assert.match(d.querySelector('#auth-title').textContent,/professionnel/);
  assert.equal(d.querySelector('#register-form [name=role]').value,'professional');
  input(x.w,'#login-form [name=email]','saisie@ucp.test');
  d.querySelector('#space-requester').click();
  assert.equal(d.querySelector('#register-form [name=role]').value,'requester');
  assert.equal(d.querySelector('#login-form [name=email]').value,'saisie@ucp.test');
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
  assert.equal(d.querySelector('#dashboard').hidden,true);
 }finally{x.close()}
});

test('requester starts on a personal dashboard with own active projects, drafts and real actions',async()=>{
 const x=await boot({'/api/projects':{items:[{id:31,title:'Mon chantier',status:'open',town:'Toulouse'},{id:32,title:'Ancien chantier',status:'closed',town:'Toulouse'}]},'/api/v4/drafts':{items:[{id:41,title:'Brouillon personnel',version:1,trades:[],photos:[]}]},'/api/conversations':{items:[]},'/api/notifications?unread_only=true':{unread:2,items:[{message:'Une candidature reçue'}]}},null,'http://localhost:8765/particulier');
 try{
  const d=x.w.document,panels=[...d.querySelectorAll('.requester-overview>.panel')];
  assert.equal(d.title,'Mon accueil · Un Coup de Pouce');
  assert.equal(panels.length,4);assert.equal(panels[0].querySelector('.overview-count').textContent,'1');
  assert.match(panels[1].textContent,/Brouillon personnel/);assert.doesNotMatch(panels[0].textContent,/Ancien chantier/);
  assert.equal(d.querySelector('body').dataset.space,'requester');
  assert.doesNotMatch(d.querySelector('#tabs').textContent,/Mes candidatures|Mon entreprise|Trouver des projets/);
  [...d.querySelectorAll('#view button')].find(b=>b.textContent==='Créer un projet').click();
  assert.ok(d.querySelector('.wizard'));assert.match(d.title,/Décrire mon projet/);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 }finally{x.close()}
});

test('a saved draft can be resumed from the personal home without publishing it',async()=>{
 const draft={id:41,title:'Cuisine à rénover',description:'Remplacer les anciens équipements de cuisine.',town:'Toulouse',version:3,trades:['plomberie'],photos:[],timing:'month'};
 const x=await boot({'/api/v4/drafts':{items:[draft]},'/api/conversations':{items:[]},'/api/notifications?unread_only=true':{unread:0,items:[]}},null,'http://localhost:8765/particulier');
 try{
  [...x.w.document.querySelectorAll('#view button')].find(b=>b.textContent==='Reprendre ce brouillon').click();
  assert.equal(x.w.document.querySelector('.wizard [name=title]').value,draft.title);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 }finally{x.close()}
});

test('a professional starts on the activity dashboard and can open real project search',async()=>{
 const x=await boot({'/api/session':{id:2,name:'Atelier',role:'professional',csrf:'pro-token'},'/api/projects':{items:[],search_scope:'ready'},'/api/my-applications':{items:[]},'/api/conversations':{items:[]},'/api/notifications?unread_only=true':{unread:0,items:[]}},null,'http://localhost:8765/professionnel');
 try{
  const d=x.w.document;assert.equal(d.title,'Vue d’ensemble · Un Coup de Pouce');
  assert.equal(d.body.dataset.space,'professional');assert.ok(d.querySelector('.overview-grid'));
  assert.doesNotMatch(d.querySelector('#tabs').textContent,/Mon accueil|Mes projets/);
  [...d.querySelectorAll('#tabs button')].find(b=>b.textContent==='Trouver des projets').click();await tick();
  assert.ok(d.querySelector('.project-search'));assert.equal(x.w.location.hash,'#projects');
  assert.equal(d.querySelector('[aria-current=page]').textContent,'Trouver des projets');
 }finally{x.close()}
});

test('a professional URL and forbidden view cannot turn a requester session into a professional',async()=>{
 const x=await boot({'/api/conversations':{items:[]},'/api/notifications?unread_only=true':{unread:0,items:[]}},null,'http://localhost:8765/professionnel#enterprise');
 try{
  const d=x.w.document;assert.equal(d.body.dataset.space,'requester');assert.equal(d.title,'Mon accueil · Un Coup de Pouce');
  assert.equal(d.querySelector('#actor-role').textContent,'ESPACE PARTICULIER');
  assert.equal(x.calls.some(c=>c.url==='/api/enterprise'||c.url==='/api/my-applications'),false);
 }finally{x.close()}
});

test('one failed dashboard section leaves other personal information usable and renders text safely',async()=>{
 const x=await boot({'/api/projects':{status:503,data:{detail:'Indisponible'}},'/api/v4/drafts':{items:[{id:41,title:'<img src=x onerror=unsafe()>',trades:[]}]},'/api/conversations':{items:[]},'/api/notifications?unread_only=true':{unread:0,items:[]}},null,'http://localhost:8765/particulier');
 try{
  const d=x.w.document;assert.equal(d.querySelectorAll('.requester-overview>.panel').length,4);
  assert.match(d.querySelector('.requester-overview').textContent,/momentanément indisponible/);
  assert.ok([...d.querySelectorAll('#view button')].some(b=>b.textContent==='Reprendre ce brouillon'));
  assert.equal(d.querySelector('.requester-overview img'),null);
 }finally{x.close()}
});
