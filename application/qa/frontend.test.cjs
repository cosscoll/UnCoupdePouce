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
 const defaults={'/api/catalog':{items:JSON.parse(fs.readFileSync(path.join(root,'../taxonomy.json'),'utf8'))},'/api/session':{id:1,name:'Camille',role:'requester',csrf:'test-token'},'/api/projects':{items:[]},'/api/v4/drafts':{items:[]},'/api/my-profile':{profile:null},'/api/v4/reports':{items:[],next_before_id:null},'/api/v4/support':{items:[],next_before_id:null,categories:{other:'Autre demande'}},'/api/v4/admin/support':{items:[],next_before_id:null,categories:{other:'Autre demande'}}};
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
  compare.click();
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
