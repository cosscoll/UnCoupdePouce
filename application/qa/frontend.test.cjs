/* DOM simulation, not a real browser, rendering or accessibility audit. */
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const root=path.join(__dirname,'../backend/static');
const tick=()=>new Promise(r=>setTimeout(r,12));
async function boot(overrides={},configure=null){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost:8765',runScripts:'outside-only'});
 const w=dom.window,calls=[];
 w.structuredClone=structuredClone;w.AbortSignal.timeout=AbortSignal.timeout;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false};
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
