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

test('F46 conversations can be searched locally and opened only on explicit selection',async()=>{
 const x=await boot({
  '/api/session':{id:2,name:'Artisan',role:'professional',csrf:'pro-token'},
  '/api/conversations':{items:[
   {application_id:11,title:'Rénovation de salle de bains',peer:'Alice'},
   {application_id:12,title:'Réparation cuisine',peer:'Benoît'},
   {application_id:13,title:'Isolation toiture',peer:'Chloé'}
  ]},
  'GET /api/conversations/12/messages':{items:[{id:52,sender_id:5,body:'Bonjour pour la cuisine.',created_at:'2026-11-05T14:00:00Z'}]}
 },null,'http://localhost:8765/professionnel#conversations');
 try{
  const d=x.w.document;
  assert.equal(d.querySelectorAll('.conversation-choice').length,3);
  assert.match(d.querySelector('.conversation-list').textContent,/aucun accusé de lecture/i);
  assert.equal(x.calls.filter(c=>c.url.includes('/messages')).length,0,'chat history is not fetched before selection');
  input(x.w,'.conversation-search-label input','cuisine');
  assert.equal(d.querySelectorAll('.conversation-choice').length,1);
  assert.match(d.querySelector('.conversation-list [role=status]').textContent,/1 conversation/);
  const selected=d.querySelector('.conversation-choice');
  selected.click();await tick();
  assert.equal(selected.getAttribute('aria-pressed'),'true');
  assert.match(d.querySelector('.chat-log').textContent,/Bonjour pour la cuisine/);
  assert.ok(x.calls.some(c=>c.url==='/api/conversations/12/messages'));
  input(x.w,'.conversation-search-label input','nom inexistant');
  assert.match(d.querySelector('.conversation-list').textContent,/Aucune conversation ne correspond/);
  assert.equal(d.querySelectorAll('.conversation-choice').length,0);
 }finally{x.close()}
});

test('F46-F50 message composer rejects blank messages and explains safe network retry',async()=>{
 let attempts=0;
 const x=await boot({
  'GET /api/conversations/12/messages':{items:[]},
  'POST /api/conversations/12/messages':()=>{if(++attempts===1)throw Error('réponse réseau perdue');return {id:8,ok:true}}
 });
 try{
  const holder=x.w.document.createElement('section');x.w.document.body.append(holder);
  await x.w.openChat(holder,{application_id:12,peer:'Atelier',title:'Cuisine'});
  const send=holder.querySelector('button[type=submit]'),textarea=holder.querySelector('textarea');
  assert.equal(send.disabled,true,'empty messages are never sendable');
  input(x.w,'body > section .chat-compose textarea','   ');
  assert.equal(send.disabled,true,'whitespace does not enable send');
  input(x.w,'body > section .chat-compose textarea','Bonjour, pouvez-vous examiner le chantier ?');
  assert.equal(send.disabled,false);
  submit(x.w,'body > section .chat-compose');await tick();
  assert.equal(attempts,1,'no automatic resend after an uncertain network result');
  assert.match(holder.querySelector('.chat-send-status').textContent,/Envoi non confirmé/);
  assert.equal(textarea.value,'Bonjour, pouvez-vous examiner le chantier ?');
  assert.match(send.textContent,/Réessayer/);
  assert.equal(send.disabled,false);
  submit(x.w,'body > section .chat-compose');await tick();
  const posts=x.calls.filter(c=>c.method==='POST');
  assert.equal(posts.length,2);
  assert.equal(posts[0].headers['Idempotency-Key'],posts[1].headers['Idempotency-Key']);
  assert.equal(textarea.value,'');
  assert.equal(send.disabled,true);
  assert.match(holder.querySelector('.chat-send-status').textContent,/confirmé par le serveur/);
  assert.match(holder.textContent,/Contacter l’assistance/);
 }finally{x.close()}
});

test('F49 support report filters are scoped to loaded own reports and preserve private text',async()=>{
 const x=await boot({
  '/api/v4/reports':{items:[
   {id:11,kind:'message',target_id:6,reason:'Signalement en cours <img src=x>',status:'open',created_at:'2026-11-05T10:00:00Z'},
   {id:10,kind:'conversation',target_id:3,reason:'Problème traité',status:'resolved',resolution:'Examen terminé.',created_at:'2026-11-04T10:00:00Z'}
  ],next_before_id:10},
  '/api/v4/reports?before_id=10':{items:[
   {id:9,kind:'project',target_id:4,reason:'Ancien incident',status:'open',created_at:'2026-11-03T10:00:00Z'}
  ],next_before_id:null}
 });
 try{
  await x.w.go('support');
  const d=x.w.document,view=d.querySelector('#view'),filter=view.querySelector('[name=report_filter]');
  const list=view.querySelector('.support-report-list');
  assert.equal(list.querySelectorAll('.panel').length,2);
  assert.equal(list.querySelector('img'),null);
  assert.match(list.textContent,/<img src=x>/);
  filter.value='resolved';filter.dispatchEvent(new x.w.Event('change'));
  assert.equal(list.querySelectorAll('.panel').length,1);
  assert.match(list.textContent,/Examen terminé/);
  assert.doesNotMatch(list.textContent,/Signalement en cours/);
  [...view.querySelectorAll('button')].find(b=>b.textContent==='Voir les signalements plus anciens').click();await tick();
  filter.value='open';filter.dispatchEvent(new x.w.Event('change'));
  assert.equal(list.querySelectorAll('.panel').length,2);
  assert.match(view.querySelector('.support-report-list').textContent,/Ancien incident/);
  assert.match(view.querySelector('.support-report-list').parentElement.querySelector('[aria-live]').textContent,/2 signalement/);
  assert.ok(x.calls.some(c=>c.url==='/api/v4/reports?before_id=10'));
 }finally{x.close()}
});

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

test('Yahya uses the existing requester draft identity and keeps private work during an AI rewrite',async()=>{
 let hooks,version=1;
 const initial={id:51,version:1,title:'Salle de bains à reprendre',
  description:'Je souhaite refaire la douche et le carrelage.',town:'Toulouse',
  trades:['plomberie'],timing:'month',budget_min:1200,budget_max:4500,
  dimensions:{surface_m2:12},photos:[84]};
 const proposed={title:'Changer la douche et la faïence',description:'Je souhaite remplacer la douche et refaire la faïence de la salle de bains.',
  town:'Blagnac',trades:['plomberie'],timing:'quarter',budget_min:null,budget_max:null,version:0,photos:[]};
 const x=await boot({
  'PUT /api/v4/drafts/51':()=>({id:51,version:++version})
 },w=>{w.UCPAssistantAI={create:received=>{hooks=received;return {sync(){},open(){}}}}});
 try{
  x.w.startWizard(initial);
  x.w.showDialog('Yahya',x.w.document.createElement('section'));
  assert.equal(await hooks.apply(proposed),true);
  assert.equal(x.w.document.querySelector('#dialog').open,false);
  assert.equal(x.w.document.querySelector('.wizard [name=title]').value,proposed.title);
  assert.match(x.w.document.querySelector('#alert').textContent,/brouillon existant/);
  const draft=x.w.eval('currentDraft');
  assert.equal(draft.id,51);
  assert.equal(draft.version,2,'the existing saved revision is retained');
  assert.deepEqual(Array.from(draft.photos),[84],'private photo ID is preserved');
  assert.equal(draft.dimensions.surface_m2,12);
  assert.equal(draft.budget_min,1200);
  assert.equal(draft.budget_max,4500);
  assert.equal(draft.town,'Blagnac');
  await x.w.saveDraft();
  const writes=x.calls.filter(c=>c.method==='PUT'&&c.url==='/api/v4/drafts/51');
  assert.equal(writes.length,2);
  assert.equal(writes[1].body.version,2);
  assert.equal(writes[1].body.title,proposed.title);
  assert.equal(writes[1].body.budget_min,1200);
  assert.equal(writes[1].body.dimensions.surface_m2,12);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0,'no new draft and no publication');
 }finally{x.close()}
});

test('F13 requester overview resumes a private draft and filters own projects by status',async()=>{
 const projects=[
  {id:11,title:'Salle de bains',status:'open',town:'Toulouse',trade:'plomberie',trades:['plomberie'],timing:'flexible'},
  {id:12,title:'Cuisine sélectionnée',status:'selected',town:'Blagnac',trade:'plomberie',trades:['plomberie'],timing:'month'},
  {id:13,title:'Projet terminé',status:'closed',town:'Toulouse',trade:'plomberie',trades:['plomberie'],timing:'quarter'}
 ];
 const drafts=[{id:23,version:1,title:'Réparer mon évier',description:'Je voudrais remplacer mon évier de cuisine.',town:'Blagnac',trades:['plomberie'],timing:'month',budget_min:null,budget_max:null,photos:[]}];
 const x=await boot({
  '/api/projects':{items:projects},'/api/v4/drafts':{items:drafts},
  '/api/projects?status=open&sort=newest':{items:[projects[0]]}
 });
 try{
  await x.w.go('projects');
  const cards=[...x.w.document.querySelectorAll('.project-status-card')];
  assert.equal(cards.length,4);
  assert.deepEqual(cards.map(c=>c.querySelector('.project-status-count').textContent),['1','1','1','1']);
  assert.ok(cards[0].textContent.includes('Brouillons'));
  cards[1].querySelector('button').click();await tick();
  assert.equal(x.w.document.querySelector('#view [name=status]').value,'open');
  assert.equal(x.w.document.querySelector('#view .count').textContent,'1 projet selon vos critères');
  assert.ok(x.calls.some(c=>c.url==='/api/projects?status=open&sort=newest'));
  cards[0].querySelector('button').click();
  assert.match(x.w.document.querySelector('.wizard [name=title]').value,/Réparer mon évier/);
 }finally{x.close()}
});

test('F09 and F12 wizard explains required fields and allows corrections from review',async()=>{
 let version=1;
 const draft={id:51,version:1,title:'Refaire ma salle de bains',description:'Je souhaite remplacer la douche et refaire la faïence.',town:'Blagnac',trades:['plomberie'],timing:'month',budget_min:null,budget_max:null,photos:[]};
 const x=await boot({'PUT /api/v4/drafts/51':()=>({id:51,version:++version})});
 try{
  x.w.startWizard(draft);
  const ready=()=>[...x.w.document.querySelectorAll('.wizard-readiness .ready')].length;
  assert.equal(ready(),3);
  assert.match(x.w.document.querySelector('.wizard-step-status').textContent,/Étape 1 sur 3/);
  input(x.w,'.wizard [name=title]','A');
  assert.equal(ready(),2,'missing title is explained before submit');
  input(x.w,'.wizard [name=title]','Refaire ma salle de bains');
  assert.equal(ready(),3);
  submit(x.w,'.wizard form');await tick();
  assert.match(x.w.document.querySelector('.wizard-step-status').textContent,/Étape 2 sur 3/);
  submit(x.w,'.wizard form');await tick();
  assert.match(x.w.document.querySelector('.wizard-step-status').textContent,/Étape 3 sur 3/);
  assert.ok([...x.w.document.querySelectorAll('.review-edit-actions button')].some(b=>b.textContent==='Modifier les détails'));
  [...x.w.document.querySelectorAll('.review-edit-actions button')].find(b=>b.textContent==='Modifier les détails').click();
  assert.match(x.w.document.querySelector('.wizard-step-status').textContent,/Étape 2 sur 3/);
  input(x.w,'.wizard [name=town]','Tournefeuille');
  submit(x.w,'.wizard form');await tick();
  assert.match(x.w.document.querySelector('.review').textContent,/Tournefeuille/);
  assert.ok(x.calls.some(c=>c.method==='PUT'&&c.body?.town==='Tournefeuille'),'change is saved with version before returning to review');
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
 const x=await boot({'/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},'/api/v4/projects/8':{id:8,title:'Travaux de test',description:'Description fictive',town:'Toulouse',trades:['plomberie'],status:'open',photos:[],application_profiles:[{profile:'linked',linked_profile_id:4,alias:'Atelier',trades:['plomberie']}]},'POST /api/projects/8/apply-linked/4':{id:12},'/api/my-applications':{items:[]}});try{
  await x.w.projectDetail({id:8,matching_individual_profile:false,matching_linked_profile_id:4});
  [...x.w.document.querySelectorAll('button')].find(b=>b.textContent==='Proposer ma candidature').click();await tick();
  assert.ok(x.calls.some(c=>c.url==='/api/projects/8/apply-linked/4'));
 }finally{x.close()}
});

test('multi-trade candidacy requires an explicit current profile and sends only that profile',async()=>{
 const x=await boot({
  '/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},
  '/api/v4/projects/8':{id:8,title:'Travaux de test',description:'Description fictive',town:'Toulouse',trades:['plomberie','electricite'],status:'open',photos:[],application_profiles:[
   {profile:'individual',trades:['plomberie']},
   {profile:'linked',linked_profile_id:7,alias:'Atelier électrique',trades:['electricite']},
  ]},
  'POST /api/projects/8/apply-linked/7':{id:12},
  '/api/my-applications':{items:[]},
 });
 try{
  await x.w.projectDetail({id:8,matching_linked_profile_id:4});
  const select=x.w.document.querySelector('[name="application-profile"]');
  assert.equal(select.value,'');assert.equal(select.required,true);
  assert.match(select.options[1].textContent,/Votre profil individuel.*Plomberie/i);
  assert.match(select.options[2].textContent,/Atelier électrique.*Électricité/i);
  submit(x.w,'#view form');
  assert.equal(x.calls.filter(call=>call.method==='POST').length,0);
  select.value='1';
  submit(x.w,'#view form');submit(x.w,'#view form');await tick();
  assert.deepEqual(x.calls.filter(call=>call.method==='POST').map(call=>call.url),['/api/projects/8/apply-linked/7']);
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


test('admin beta overview separates real profile authorization states without inventing tester invitations',async()=>{
 const queue=[
  {id:10,name:'Artisan en attente',trade:'plomberie',town:'Toulouse',approved:0,subscription_active:0},
  {id:11,name:'Artisan validé',trade:'peinture',town:'Blagnac',approved:1,subscription_active:0},
  {id:12,name:'Artisan actif',trade:'electricite',town:'Toulouse',approved:1,subscription_active:1}
 ];
 const x=await boot({
  '/api/session':{id:99,name:'Admin test',role:'admin',csrf:'admin-token'},
  '/api/admin/metrics':{counts:{requesters:3,professionals:5,projects:2,applications:1,accepted_applications:1,messages:3}},
  '/api/admin/queue':{items:queue},
  '/api/admin/audit':{items:[]}
 });
 try{
  const d=x.w.document;
  await x.w.go('admin');
  assert.match(d.querySelector('#view').textContent,/Préparer les comptes artisans/);
  const metrics=[...d.querySelectorAll('.beta-admin-metric')].map(n=>n.textContent);
  assert.equal(metrics.length,4);
  assert.ok(metrics.some(x=>x.includes('1À examiner')));
  assert.ok(metrics.some(x=>x.includes('1Messagerie à activer')));
  assert.ok(metrics.some(x=>x.includes('1Autorisés à échanger')));
  assert.ok(metrics.some(x=>x.includes('2Sans profil déclaré')));
  assert.match(d.querySelector('#view').textContent,/Aucune assurance/);
  assert.equal(d.querySelectorAll('.beta-admin-record').length,3);
  assert.equal(x.calls.filter(c=>c.method!=='GET').length,0);
  const awaiting=[...d.querySelectorAll('.beta-admin-filters button')].find(b=>b.textContent==='Messagerie à activer');
  awaiting.click();
  assert.equal(awaiting.getAttribute('aria-pressed'),'true');
  assert.equal(d.querySelectorAll('.beta-admin-record').length,1);
  assert.match(d.querySelector('.beta-admin-record').textContent,/Artisan validé/);
  assert.equal(x.calls.filter(c=>c.method!=='GET').length,0);
  const active=[...d.querySelectorAll('.beta-admin-filters button')].find(b=>b.textContent==='Accès de test actif');
  active.click();
  assert.equal(d.querySelectorAll('.beta-admin-record').length,1);
  assert.match(d.querySelector('.beta-admin-record').textContent,/Artisan actif/);
  assert.equal([...d.querySelectorAll('.beta-admin-record button')].some(b=>b.textContent.includes('Activer l’accès')),false);
 }finally{x.close()}
});

test('admin beta grants messaging entitlement only after an explicit button with CSRF',async()=>{
 const x=await boot({
  '/api/session':{id:99,name:'Admin test',role:'admin',csrf:'admin-token'},
  '/api/admin/metrics':{counts:{professionals:1,projects:0,applications:0,accepted_applications:0,messages:0}},
  '/api/admin/queue':{items:[{id:74,name:'Artisan à activer',trade:'plomberie',town:'Toulouse',approved:1,subscription_active:0}]},
  '/api/admin/audit':{items:[]},
  'POST /api/admin/professionals/74/activate-test-subscription':{ok:true,payment:'NONE'}
 });
 try{
  const d=x.w.document;
  await x.w.go('admin');
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
  const act=[...d.querySelectorAll('.beta-admin-record button')].find(b=>b.textContent.includes('Activer l’accès messagerie'));
  assert.ok(act);act.click();await tick();
  const writes=x.calls.filter(c=>c.method==='POST');
  assert.equal(writes.length,1);
  assert.equal(writes[0].url,'/api/admin/professionals/74/activate-test-subscription');
  assert.equal(writes[0].headers['x-ucp-csrf'],'admin-token');
 }finally{x.close()}
});

test('admin beta suspension requires confirmation and never silently changes a profile',async()=>{
 const x=await boot({
  '/api/session':{id:99,name:'Admin test',role:'admin',csrf:'admin-token'},
  '/api/admin/metrics':{counts:{professionals:1}},
  '/api/admin/queue':{items:[{id:91,name:'Artisan actif',trade:'peinture',town:'Toulouse',approved:1,subscription_active:1}]},
  '/api/admin/audit':{items:[]},
  'POST /api/admin/professionals/91/suspend':{ok:true}
 });
 try{
  const d=x.w.document;
  await x.w.go('admin');
  const action=[...d.querySelectorAll('.beta-admin-record button')].find(b=>b.textContent==='Suspendre le profil');
  action.click();
  assert.equal(d.querySelector('#dialog').open,true);
  assert.match(d.querySelector('#dialog').textContent,/suspension désactive/);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
  d.querySelector('#dialog-close').click();
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
  const open=[...d.querySelectorAll('.beta-admin-record button')].find(b=>b.textContent==='Suspendre le profil');
  open.click();
  [...d.querySelectorAll('#dialog button')].find(b=>b.textContent==='Confirmer').click();await tick();
  assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
  assert.equal(x.calls.find(c=>c.method==='POST').url,'/api/admin/professionals/91/suspend');
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
test('F88 mobile install entry reuses the native prompt and hides only after browser confirmation',async()=>{
 let prompts=0;
 const x=await boot({},w=>{
  w.matchMedia=query=>({matches:query==='(max-width:960px)',addEventListener(){}});
 });
 try{
  loadPWA(x);
  const d=x.w.document,mobile=d.querySelector('#install-mobile'),regular=d.querySelector('#install-app');
  assert.ok(mobile,'a mobile entry is present in the logged-in workspace');
  assert.equal(mobile.closest('.accountbar-meta')!==null,true);
  assert.equal(mobile.hidden,false);
  assert.equal(regular.hidden,false);
  const e=new x.w.Event('beforeinstallprompt',{cancelable:true});
  e.prompt=async()=>{prompts++};e.userChoice=Promise.resolve({outcome:'accepted'});
  x.w.dispatchEvent(e);
  assert.equal(prompts,0,'install is never invoked automatically');
  mobile.focus();mobile.click();
  assert.equal(d.querySelector('#dialog').open,true);
  assert.match(d.querySelector('#dialog').textContent,/iPhone · Safari/);
  assert.equal(d.activeElement,d.querySelector('#dialog-title'),'mobile dialog does not immediately summon a keyboard');
  const install=[...d.querySelectorAll('#dialog button')].find(b=>b.textContent==='Lancer l’installation');
  assert.ok(install);
  install.click();install.click();await tick();
  assert.equal(prompts,1,'a user gesture invokes the prompt only once');
  assert.equal(mobile.hidden,false,'acceptance is not proof that the app was installed');
  x.w.dispatchEvent(new x.w.Event('appinstalled'));
  assert.equal(mobile.hidden,true);
  assert.equal(regular.hidden,true);
 }finally{x.close()}
});

test('F91 simulated 200% zoom uses compact navigation and avoids automatic keyboard focus',async()=>{
 const x=await boot({},w=>{
  w.matchMedia=query=>({matches:query==='(max-width:960px)',addEventListener(){}});
 });
 try{
  const d=x.w.document,toggle=d.querySelector('#navigation-toggle'),calls=x.calls.length;
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'),'true');
  const first=d.querySelector('#tabs button');
  first.focus();first.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(toggle.getAttribute('aria-expanded'),'false');
  assert.equal(d.activeElement,toggle);
  const opener=d.querySelector('#install-help');opener.focus();
  const form=d.createElement('form'),entry=d.createElement('input');
  entry.name='answer';form.append(entry);
  x.w.showDialog('Zoom et saisie',form);
  assert.equal(d.activeElement,d.querySelector('#dialog-title'));
  assert.equal(d.querySelector('#dialog').getAttribute('aria-labelledby'),'dialog-title');
  d.querySelector('#dialog-close').click();
  assert.equal(d.activeElement,opener);
  assert.equal(x.calls.length,calls,'zoom interactions must not post or mutate data');
 }finally{x.close()}
});

test('F91 CSS reflow covers intermediate 681–960px viewports and forced-colors selection',()=>{
 const sheet=fs.readFileSync(path.join(root,'style.css'),'utf8');
 const marker=sheet.lastIndexOf('/* F91: reflow for 200% zoom');
 assert.ok(marker>0,'keep a separately auditable reflow rule');
 const reflow=sheet.slice(marker);
 assert.match(reflow,/@media \(min-width:681px\) and \(max-width:960px\)/);
 assert.match(reflow,/\.dashboard\{display:flex;flex-direction:column/);
 assert.match(reflow,/\.sidebar\[data-navigation-open="true"\] nav\{display:grid\}/);
 assert.match(reflow,/\.sidebar nav\{display:none/);
 assert.match(reflow,/\.messages\{display:block/);
 assert.match(reflow,/\.search-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(reflow,/@media\(forced-colors:active\)/);
 assert.match(reflow,/\.conversation-choice\[aria-pressed="true"\]/);
});

test('mobile manual dialog avoids automatic input focus and returns focus to its opener',async()=>{
 const x=await boot({},w=>{w.matchMedia=query=>({matches:query==='(max-width:960px)',addEventListener(){}})});
 try{
  const d=x.w.document,opener=d.querySelector('#install-help');
  opener.focus();
  const form=d.createElement('form'),input=d.createElement('input');
  input.name='demo';form.append(input);
  x.w.showDialog('Une étape sur mobile',form);
  assert.equal(d.activeElement,d.querySelector('#dialog-title'));
  assert.equal(input.value,'');
  d.querySelector('#dialog-close').click();
  assert.equal(d.activeElement,opener);
  assert.equal(d.querySelector('#dialog').open,false);
 }finally{x.close()}
});

test('the mobile navigation closes on outside touch without changing page or saving a draft',async()=>{
 const x=await boot();
 try{
  const d=x.w.document,toggle=d.querySelector('#navigation-toggle'),initial=x.calls.length;
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'),'true');
  d.querySelector('#view').dispatchEvent(new x.w.Event('pointerdown',{bubbles:true}));
  assert.equal(toggle.getAttribute('aria-expanded'),'false');
  assert.equal(d.querySelector('.sidebar').dataset.navigationOpen,'false');
  assert.equal(x.calls.length,initial,'a dismissive gesture never calls the API');
  toggle.click();
  d.querySelector('#tabs button').dispatchEvent(new x.w.Event('pointerdown',{bubbles:true}));
  assert.equal(toggle.getAttribute('aria-expanded'),'true','touching a menu item does not prematurely collapse it');
 }finally{x.close()}
});

test('connection notices can be dismissed on a phone without replaying any writes',async()=>{
 const x=await boot({'GET /api/conversations/12/messages':{items:[]}});
 try{
  loadPWA(x);
  const status=x.w.document.querySelector('#connection-status');
  x.w.dispatchEvent(new x.w.Event('offline'));
  assert.equal(status.hidden,false);
  assert.match(status.textContent,/hors connexion/);
  const dismiss=status.querySelector('.connection-dismiss');
  assert.ok(dismiss);
  dismiss.click();
  assert.equal(status.hidden,true);
  x.w.dispatchEvent(new x.w.Event('online'));
  assert.equal(status.hidden,false);
  assert.match(status.textContent,/rien n’a été envoyé/);
  assert.equal(status.querySelectorAll('button').length,1);
  assert.equal(x.calls.filter(c=>c.method!=='GET').length,0);
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
  assert.equal(cleared.includes(current),false);assert.equal(holder.querySelector('button[type=submit]').disabled,true,'empty compose field is not sendable');
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
 const x=await boot({'/api/session':{id:2,name:'Artisan',role:'professional',csrf:'pro-token'},'/api/projects':{items:[],search_scope:'ready'},'/api/projects?budget_from=0&budget_to=0&sort=newest':{items:[]}});try{
  input(x.w,'.project-search [name=budget_from]','0');input(x.w,'.project-search [name=budget_to]','0');submit(x.w,'.project-search');await tick();
  assert.ok(x.calls.some(c=>c.url==='/api/projects?budget_from=0&budget_to=0&sort=newest'));
  assert.match(x.w.document.querySelector('.budget-filter-note').textContent,/sans budget sont exclus/);
 }finally{x.close()}
});
test('project editor sends numeric budget values and explicit null for a cleared bound',async()=>{
 const x=await boot({'PUT /api/projects/18':{ok:true}});try{
  x.w.editProject({id:18,title:'Budget de travaux fictif',description:'Description fictive suffisamment longue pour la modification.',trade:'plomberie',town:'Toulouse',budget_min:1000,budget_max:3000,content_version:3});
  input(x.w,'#dialog [name=budget_min]','');input(x.w,'#dialog [name=budget_max]','0');submit(x.w,'#dialog form');await tick();
  const sent=x.calls.find(c=>c.method==='PUT');assert.equal(sent.body.budget_min,null);assert.equal(sent.body.budget_max,0);assert.equal(sent.body.content_version,3);
 }finally{x.close()}
});

test('project edit conflict keeps the form and rebases only after the owner loads the published version',async()=>{
 const original={id:18,title:'Titre initial fictif',description:'Description initiale du projet fictif.',trade:'plomberie',town:'Toulouse',budget_min:null,budget_max:3000,content_version:0,status:'open'};
 const latest={...original,title:'Titre récent publié',description:'Description récente publiée pour le projet fictif.',budget_min:900,content_version:1};
 const x=await boot({
  '/api/v4/projects/18':latest,
  'PUT /api/projects/18':call=>call.body.content_version===0
   ?{status:409,data:{detail:{code:'project_content_conflict',message:'Cette annonce a été modifiée ailleurs. Votre saisie est conservée.'}}}
   :{ok:true,content_version:2},
 });try{
  x.w.editProject(original);
  const dialog=x.w.document.querySelector('#dialog'),form=dialog.querySelector('form');
  const save=form.querySelector('[type=submit]');
  const reload=[...form.querySelectorAll('button')].find(b=>b.textContent==='Charger la version actuelle');
  input(x.w,'#dialog [name=title]','Titre de ma fenêtre');
  submit(x.w,'#dialog form');await tick();
  assert.equal(form.elements.title.value,'Titre de ma fenêtre');
  assert.match(form.querySelector('[role=status]').textContent,/modifiée ailleurs/);
  assert.equal(save.disabled,true);
  assert.equal(x.w.document.activeElement,reload);
  assert.equal(x.calls.filter(c=>c.url==='/api/v4/projects/18').length,0);
  reload.click();await tick();
  assert.match(form.textContent,/Titre récent publié/);
  assert.equal(form.elements.title.value,'Titre de ma fenêtre');
  assert.equal(form.elements.description.value,latest.description);
  assert.equal(form.elements.budget_min.value,'900');
  assert.equal(save.disabled,false);
  assert.equal(x.calls.filter(c=>c.method==='PUT').length,1);
  submit(x.w,'#dialog form');await tick();
  const sent=x.calls.filter(c=>c.method==='PUT').at(-1).body;
  assert.deepEqual(sent,{title:'Titre de ma fenêtre',town:'Toulouse',description:latest.description,budget_min:900,budget_max:3000,trade:'plomberie',content_version:1});
  assert.equal(dialog.open,false);
 }finally{x.close()}
});

test('a new candidature freezes the town without losing the rest of a stale form',async()=>{
 const original={id:18,title:'Titre initial fictif',description:'Description initiale du projet fictif.',trade:'plomberie',town:'Toulouse',content_version:0,status:'open'};
 const latest={...original,content_editable:true,content_scope_locked:true};
 const x=await boot({
  '/api/v4/projects/18':latest,
  'PUT /api/projects/18':call=>call.body.town==='Balma'
   ?{status:409,data:{detail:{code:'project_scope_locked',message:'Une candidature a été reçue.'}}}
   :{ok:true,notified:1},
 });try{
  x.w.editProject(original);
  input(x.w,'#dialog [name=town]','Balma');
  input(x.w,'#dialog [name=description]','Ma nouvelle description du chantier.');
  submit(x.w,'#dialog form');await tick();
  const form=x.w.document.querySelector('#dialog form');
  assert.equal(form.elements.town.value,'Balma');
  savedButton(x.w,'Charger la version actuelle','#dialog').click();await tick();
  assert.equal(form.elements.town.value,'Toulouse');
  assert.equal(form.elements.town.readOnly,true);
  assert.equal(form.elements.description.value,'Ma nouvelle description du chantier.');
  assert.match(form.textContent,/les candidats en attente seront avertis/);
  submit(x.w,'#dialog form');await tick();
  assert.match(x.w.document.querySelector('#alert').textContent,/1 candidature/);
 }finally{x.close()}
});

test('the project update notification opens the professional candidature list without guessing an application ID',async()=>{
 const x=await boot({'/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},
  '/api/notifications':{items:[{id:9,entity_id:82,event_type:'project_updated',message:'Une annonce a été modifiée.',created_at:'2026-11-05T12:00:00Z',read_at:null}],unread:1,next_before_id:null},
  '/api/my-applications':{items:[{id:81,title:'Autre chantier',trade:'plomberie',town:'Toulouse',status:'pending',project_status:'open'},
   {id:82,title:'Chantier modifié',trade:'plomberie',town:'Toulouse',status:'pending',project_status:'open'}]}});
 try{
  await x.w.go('notifications');await tick();
  savedButton(x.w,'Voir mes candidatures','#view').click();await tick();
  assert.equal(x.w.location.hash,'#applications');
  assert.match(x.w.document.querySelector('#view').textContent,/Chantier modifié/);
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

test('requester cancellation requires confirmation and labels the archived project',async()=>{
 let cancelled=false;
 const project={id:42,title:'Chantier fictif',description:'Une description de test',trade:'plomberie',town:'Toulouse',status:'open',photos:[]};
 const x=await boot({
  '/api/projects':()=>({items:[{...project,status:cancelled?'closed':'open',cancelled}]}),
  '/api/v4/projects/42':project,
  '/api/projects/42/applications':{items:[]},
  'POST /api/projects/42/cancel':()=>{cancelled=true;return {ok:true,status:'closed',cancelled:true};},
 });
 try{
  await x.w.projectDetail(project);
  const findButton=name=>[...x.w.document.querySelectorAll('button')].find(b=>b.textContent===name);
  findButton('Annuler le projet').click();
  assert.match(x.w.document.querySelector('#dialog').textContent,/candidatures en attente prendront fin/);
  assert.ok(!x.calls.some(call=>call.url.endsWith('/cancel')));
  findButton('Fermer').click();
  assert.ok(!x.calls.some(call=>call.url.endsWith('/cancel')));
  findButton('Annuler le projet').click();findButton('Confirmer').click();await tick();
  assert.equal(x.calls.filter(call=>call.url.endsWith('/cancel')).length,1);
  assert.match(x.w.document.querySelector('.project-row').textContent,/Annulé/);
  assert.match(x.w.document.querySelector('#alert').textContent,/projet a été annulé/);
 }finally{x.close()}
});

test('suspended project shows its resume action and hides intake and candidate decisions',async()=>{
 const project={id:42,title:'Chantier fictif',description:'Une description de test',trade:'plomberie',town:'Toulouse',status:'open',photos:[],suspended:1,intake_version:2};
 const x=await boot({
  '/api/projects':{items:[project]},
  '/api/v4/projects/42':project,
  '/api/projects/42/applications':{items:[{id:81,professional_name:'Atelier fictif',status:'pending',trades:['plomberie'],service_zones:['Toulouse']}]},
  'POST /api/projects/42/suspension':{suspended:false,version:3},
 });
 try{
  await x.w.projectDetail(project);
  const findButton=name=>[...x.w.document.querySelectorAll('button')].find(b=>b.textContent===name);
  assert.ok(!findButton('Choisir ce professionnel'));
  assert.ok(!findButton('Ne pas retenir'));
  assert.ok(!findButton('Mettre les candidatures en pause'));
  findButton('Reprendre le projet').click();
  assert.match(x.w.document.querySelector('#dialog').textContent,/réglage précédent/);
  findButton('Confirmer').click();await tick();
  const writes=x.calls.filter(call=>call.method==='POST'&&call.url.endsWith('/suspension'));
  assert.deepEqual(writes.map(call=>call.body),[{suspended:false,version:2}]);
 }finally{x.close()}
});

test('cancellation notice opens candidature tracking and shows why the chat closed',async()=>{
 const x=await boot({
  '/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},
  '/api/notifications':{unread:1,items:[{id:3,event_type:'project_cancelled',entity_id:42,message:'Le demandeur a annulé le chantier.',created_at:'2026-11-05T13:30:00Z'}]},
  '/api/my-applications':{items:[{id:42,title:'Chantier annulé',trade:'plomberie',town:'Toulouse',status:'accepted',project_status:'closed',project_cancelled:1,conversation_state:'closed'}]},
 });
 try{
  await x.w.go('notifications');
  [...x.w.document.querySelectorAll('button')].find(b=>b.textContent==='Voir mes candidatures').click();
  await tick();
  const card=x.w.document.querySelector('#application-42');
  assert.equal(x.w.location.hash,'#applications');
  assert.match(card.textContent,/Projet annulé par le demandeur/);
  assert.equal(card.querySelector('button'),null);
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
test('account password form confirms the new password and signs out after success',async()=>{
 const x=await boot({
  '/api/account/export':{user:{name:'Camille',email:'camille-personnel@ucp.test',role:'requester'},own_projects:[],own_applications:[],own_messages:[]},
  '/api/account/sessions':{active_sessions:2,password_change_available:true},
  '/api/account/activity':{items:[]},
  'POST /api/account/password':{ok:true},
 },null,'http://localhost:8765/particulier#personal-data');
 try{
  const form=x.w.document.querySelector('[name=current_password]').form;
  const confirm=form.querySelector('input:not([name])');
  input(x.w,'[name=current_password]','Original-test-password');
  input(x.w,'[name=new_password]','Replacement-test-password');
  confirm.value='Different-test-password';
  form.dispatchEvent(new x.w.Event('submit',{cancelable:true}));await tick();
  assert.ok(confirm.validationMessage);
  assert.ok(!x.calls.some(call=>call.url==='/api/account/password'));
  confirm.value='Replacement-test-password';
  confirm.dispatchEvent(new x.w.Event('input',{bubbles:true}));
  form.dispatchEvent(new x.w.Event('submit',{cancelable:true}));await tick();
  assert.deepEqual(x.calls.filter(call=>call.url==='/api/account/password').map(call=>call.body),[
   {current_password:'Original-test-password',new_password:'Replacement-test-password'},
  ]);
  assert.equal(x.w.document.querySelector('#dashboard').hidden,true);
  assert.equal(x.w.document.querySelector('#login-form').hidden,false);
  assert.match(x.w.document.querySelector('#alert').textContent,/Mot de passe modifié/);
 }finally{x.close()}
});

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


test('F30 professional overview shows actionable verified counts and opens selected applications',async()=>{
 const pro={id:2,name:'Artisan',role:'professional',csrf:'pro-token'};
 const x=await boot({
  '/api/session':pro,
  '/api/projects':{items:[{id:3,title:'Salle de bains',status:'open',town:'Toulouse'}],search_scope:'ready'},
  '/api/my-applications':{items:[
   {id:9,title:'Chantier proposé',status:'pending',project_status:'open',town:'Toulouse',trade:'plomberie'},
   {id:10,title:'Chantier accepté',status:'accepted',project_status:'selected',town:'Toulouse',trade:'plomberie'},
   {id:11,title:'Chantier terminé',status:'accepted',project_status:'closed',town:'Toulouse',trade:'plomberie'}
  ]},
  '/api/conversations':{items:[{application_id:10,subscription_active:true,linked_profile_id:null},{application_id:11,subscription_active:false}]},
  '/api/my-profile':{profile:{approved:true,subscription_active:true}},
  '/api/notifications?unread_only=true':{unread:0,items:[]}
 },null,'http://localhost:8765/professionnel');
 try{
  await x.w.go('professional-home');
  const cards=[...x.w.document.querySelectorAll('.pro-quick-card')];
  assert.equal(cards.length,4);
  assert.deepEqual(cards.map(c=>c.querySelector('.pro-quick-count').textContent),['1','1','1','1']);
  assert.deepEqual(cards.map(c=>c.querySelector('.pro-quick-help').textContent),Array(4).fill('Données de votre compte'));
  assert.equal(x.calls.every(c=>c.method==='GET'),true,'overview must not mutate data');
  cards[2].querySelector('button').click();await tick();
  assert.equal(x.w.location.hash,'#applications');
  assert.equal(x.w.document.querySelector('[name=application_status]').value,'accepted');
  assert.match(x.w.document.querySelector('#view [aria-live]').textContent,/Chantier accepté/);
  assert.doesNotMatch(x.w.document.querySelector('#view [aria-live]').textContent,/Chantier proposé/);
 }finally{x.close()}
});

test('F30 professional quick overview does not fabricate unavailable counts',async()=>{
 const pro={id:2,name:'Artisan',role:'professional',csrf:'pro-token'};
 const x=await boot({
  '/api/session':pro,
  '/api/projects':{items:[{id:3,title:'Chantier',status:'open'}],search_scope:'ready'},
  '/api/my-applications':{status:503,data:{detail:'Service indisponible'}},
  '/api/conversations':{items:[]},
  '/api/my-profile':{profile:{approved:true}},
  '/api/notifications?unread_only=true':{unread:0,items:[]}
 },null,'http://localhost:8765/professionnel');
 try{
  await x.w.go('professional-home');
  const cards=[...x.w.document.querySelectorAll('.pro-quick-card')];
  assert.equal(cards[0].querySelector('.pro-quick-count').textContent,'1');
  assert.equal(cards[1].querySelector('.pro-quick-count').textContent,'—');
  assert.equal(cards[2].querySelector('.pro-quick-count').textContent,'—');
  assert.match(cards[1].textContent,/Indisponible/);
  assert.equal(cards[3].querySelector('.pro-quick-count').textContent,'0');
 }finally{x.close()}
});

test('F24-F25 quick mission searches retain selected trade and town and issue actual server filters',async()=>{
 const pro={id:2,name:'Artisan',role:'professional',csrf:'pro-token'};
 const item={id:13,title:'Fuite plomberie',description:'Travaux fictifs',status:'open',town:'Toulouse',trade:'plomberie',trades:['plomberie'],timing:'urgent'};
 const path='/api/projects?trade=plomberie&town=Toulouse';
 const x=await boot({
  '/api/session':pro,'/api/projects':{items:[item],search_scope:'ready'},
  [path+'&timing=urgent&sort=newest']:{items:[item]},
  [path+'&published_within=7&sort=newest']:{items:[]},
  [path+'&sort=newest']:{items:[item]}
 });
 try{
  const trade=x.w.document.querySelector('.project-search [name=trade]'),
        town=x.w.document.querySelector('.project-search [name=town]');
  trade.value='plomberie';town.value='Toulouse';
  const shortcut=label=>[...x.w.document.querySelectorAll('.pro-search-shortcuts button')].find(b=>b.textContent===label);
  assert.equal(shortcut('Tous les délais').getAttribute('aria-pressed'),'true');
  shortcut('Dès que possible').click();await tick();
  assert.equal(shortcut('Dès que possible').getAttribute('aria-pressed'),'true');
  assert.ok(x.calls.some(c=>c.url===path+'&timing=urgent&sort=newest'));
  shortcut('7 derniers jours').click();await tick();
  assert.ok(x.calls.some(c=>c.url===path+'&published_within=7&sort=newest'));
  assert.equal(trade.value,'plomberie');assert.equal(town.value,'Toulouse');
  shortcut('Tous les délais').click();await tick();
  assert.ok(x.calls.some(c=>c.url===path+'&sort=newest'));
  assert.equal(shortcut('Tous les délais').getAttribute('aria-pressed'),'true');
  assert.equal(x.calls.filter(c=>c.method!=='GET').length,0);
 }finally{x.close()}
});

test('F33 application status cards filter without displaying unrelated applications',async()=>{
 const pro={id:2,name:'Artisan',role:'professional',csrf:'pro-token'};
 const x=await boot({
  '/api/session':pro,
  '/api/my-applications':{items:[
   {id:51,title:'Chantier en attente',status:'pending',project_status:'open',town:'Toulouse',trade:'plomberie'},
   {id:52,title:'Chantier sélectionné',status:'accepted',project_status:'selected',town:'Balma',trade:'plomberie'},
   {id:53,title:'Chantier terminé',status:'accepted',project_status:'closed',town:'Toulouse',trade:'plomberie'}
  ]}
 });
 try{
  await x.w.go('applications');
  const cards=[...x.w.document.querySelectorAll('.application-filter-card')];
  assert.equal(cards.length,4);
  assert.deepEqual(cards.map(c=>c.querySelector('strong').textContent),['3','1','1','1']);
  cards[1].click();
  assert.equal(x.w.document.querySelector('[name=application_status]').value,'pending');
  assert.equal(cards[1].getAttribute('aria-pressed'),'true');
  assert.match(x.w.document.querySelector('#view [aria-live]').textContent,/Chantier en attente/);
  assert.doesNotMatch(x.w.document.querySelector('#view [aria-live]').textContent,/Chantier sélectionné/);
  cards[3].click();
  assert.match(x.w.document.querySelector('#view [aria-live]').textContent,/Chantier terminé/);
  cards[0].click();
  assert.equal(x.w.document.querySelectorAll('#view [aria-live] .panel').length,3);
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

test('F79 notices navigate to the correct account section without assuming private entity IDs',async()=>{
 const note=(id,event_type)=>({id,event_type,entity_id:987654,created_at:'2026-11-06T09:15:00Z',read_at:null,message:'Notification fictive '+id});
 const requester=await boot({
  '/api/notifications':{unread:2,items:[note(20,'new_application'),note(19,'new_message')],next_before_id:null}
 },null,'http://localhost:8765/#notifications');
 try{
  await requester.w.go('notifications');
  const cards=requester.w.document.querySelectorAll('#view article');
  assert.equal(cards.length,2);
  const projectButton=[...cards[0].querySelectorAll('button')].find(b=>b.textContent==='Voir mes projets');
  assert.ok(projectButton,'requester has contextual project navigation');
  assert.equal([...cards[0].querySelectorAll('button')].some(b=>/987654/.test(b.textContent)),false);
  projectButton.click();await tick();
  assert.equal(requester.w.location.hash,'#projects');
  assert.equal(requester.calls.some(c=>c.url.includes('987654')),false,'notification never fetches a guessed private detail');
 }finally{requester.close()}
 const professional=await boot({
  '/api/session':{id:2,name:'Pro',role:'professional',csrf:'test-token'},
  '/api/notifications':{unread:2,items:[note(18,'application_accepted'),note(17,'profile_review_required')],next_before_id:null},
  '/api/my-applications':{items:[]},
  '/api/my-profile':{profile:null}
 },null,'http://localhost:8765/#notifications');
 try{
  await professional.w.go('notifications');
  const cards=professional.w.document.querySelectorAll('#view article');
  assert.ok([...cards[0].querySelectorAll('button')].some(b=>b.textContent==='Voir mes candidatures'));
  assert.ok([...cards[1].querySelectorAll('button')].some(b=>b.textContent==='Voir mon profil'));
  [...cards[0].querySelectorAll('button')].find(b=>b.textContent==='Voir mes candidatures').click();await tick();
  assert.equal(professional.w.location.hash,'#applications');
 }finally{professional.close()}
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
  const label=x.w.document.getElementById(toggle.getAttribute('aria-labelledby'));
  assert.equal(label.textContent,'Menu');assert.equal(toggle.getAttribute('aria-describedby'),'navigation-current');
  toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(x.w.document.querySelector('.sidebar').dataset.navigationOpen,'true');
  assert.equal(toggle.getAttribute('aria-labelledby'),label.id);
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
 let attempts=0;const x=await boot({'/api/session':savedProSession,'/api/v4/projects/28':{...favoriteProject,photos:[],application_profiles:[{profile:'individual',trades:['plomberie']}]},'POST /api/projects/28/apply':()=>++attempts===1?{status:429,data:{detail:'Trop de candidatures rapprochées. Réessayez dans 60 s. Aucune nouvelle candidature n’a été enregistrée.'}}:{id:88},'/api/my-applications':{items:[]}});
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
  const before=x.calls.length;assert.equal(x.w.document.querySelector('#chatbot-launcher').hidden,false);await prepareHelpProposal(x);
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
  assert.equal(x.w.document.querySelector('#chatbot-launcher').hidden,true);assert.equal(x.w.document.querySelector('.guided-helper'),null);assert.equal(x.w.localStorage.length,0);assert.equal(x.w.sessionStorage.length,0);
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
 const x=await boot({},w=>Object.defineProperty(w,'UCPGuidedHelp',{configurable:true,get:()=>undefined,set:()=>{}}));try{assert.equal(x.w.document.querySelector('#dashboard').hidden,false);assert.ok(x.w.document.querySelector('#view .project-search'),'la recherche de projets reste utilisable');x.w.openGuidedHelp();assert.match(x.w.document.querySelector('#alert').textContent,/assistant n’a pas pu être chargé/)}finally{x.close()}
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

test('login accepts a short account identifier and sends it to the server without an email restriction',async()=>{
 const x=await boot({'/api/session':{status:401,data:{detail:'Connexion requise'}},'POST /api/login':{user_id:7,name:'Compte fictif',role:'requester',csrf:'alias-csrf'}});
 try{
  const f=x.w.document.querySelector('#login-form');
  assert.equal(f.elements.email.type,'text');
  input(x.w,'#login-form [name=email]','preview.part');input(x.w,'#login-form [name=password]','Demo-1234');
  assert.equal(f.checkValidity(),true);submit(x.w,'#login-form');await tick();
  const login=x.calls.find(c=>c.method==='POST'&&c.url==='/api/login');
  assert.equal(login.body.email,'preview.part');assert.equal(x.w.document.querySelector('#actor-role').textContent,'ESPACE PARTICULIER');
  assert.equal(f.elements.password.value,'');
 }finally{x.close()}
});

const intakeProject={id:41,title:'Chantier fictif en réception',description:'Description fictive suffisamment précise du chantier.',town:'Toulouse',trade:'plomberie',trades:['plomberie'],status:'open',photos:[],applications_paused:0,intake_version:4};

test('owner explicitly confirms intake pause and sends the loaded revision without closing the project',async()=>{
 const x=await boot({'/api/v4/projects/41':intakeProject,'/api/projects/41/applications':{items:[]},'POST /api/projects/41/application-intake':{paused:true,version:5}});
 try{
  await x.w.projectDetail({id:41});savedButton(x.w,'Mettre les candidatures en pause','#view').click();
  assert.match(x.w.document.querySelector('#dialog').textContent,/candidatures reçues restent conservées/);
  assert.equal(x.calls.some(c=>c.method==='POST'),false);
  x.w.document.querySelector('#dialog-close').click();assert.equal(x.calls.some(c=>c.method==='POST'),false);
  savedButton(x.w,'Mettre les candidatures en pause','#view').click();savedButton(x.w,'Confirmer','#dialog').click();await tick();
  const sent=x.calls.filter(c=>c.method==='POST');assert.equal(sent.length,1);
  assert.equal(sent[0].url,'/api/projects/41/application-intake');assert.deepEqual(sent[0].body,{paused:true,version:4});
  assert.equal(sent[0].headers['x-ucp-csrf'],'test-token');
 }finally{x.close()}
});

test('paused project offers explicit reopening and shows its current reception state',async()=>{
 const x=await boot({'/api/v4/projects/41':{...intakeProject,applications_paused:1,intake_version:7},'/api/projects/41/applications':{items:[]},'POST /api/projects/41/application-intake':{paused:false,version:8}});
 try{
  await x.w.projectDetail({id:41});assert.match(x.w.document.querySelector('#view').textContent,/Candidatures en pause/);
  assert.match(x.w.document.querySelector('#view').textContent,/Vous pouvez les rouvrir/);
  savedButton(x.w,'Rouvrir les candidatures','#view').click();assert.match(x.w.document.querySelector('#dialog').textContent,/conserve son état/);
  savedButton(x.w,'Confirmer','#dialog').click();await tick();
  assert.deepEqual(x.calls.find(c=>c.method==='POST').body,{paused:false,version:7});
 }finally{x.close()}
});

test('professional tracking explains a pause and still permits withdrawal of a pending application',async()=>{
 const x=await boot({'/api/session':savedProSession,'/api/my-applications':{items:[{id:33,title:'Chantier en pause',trade:'plomberie',town:'Toulouse',status:'pending',project_status:'open',project_paused:1,conversation_state:'not_selected'}]}});
 try{
  await x.w.go('applications');assert.match(x.w.document.querySelector('#view').textContent,/Votre candidature est conservée/);
  assert.ok(savedButton(x.w,'Retirer ma candidature','#view'));
  assert.equal([...x.w.document.querySelectorAll('#view button')].some(b=>b.textContent==='Ouvrir mes messages'),false);
 }finally{x.close()}
});

test('stale intake confirmation keeps the dialog and server error instead of inventing a successful transition',async()=>{
 const x=await boot({'/api/v4/projects/41':intakeProject,'/api/projects/41/applications':{items:[]},'POST /api/projects/41/application-intake':{status:409,data:{detail:'La réception a changé dans une autre fenêtre. Actualisez le projet.'}}});
 try{
  await x.w.projectDetail({id:41});savedButton(x.w,'Mettre les candidatures en pause','#view').click();savedButton(x.w,'Confirmer','#dialog').click();await tick();
  assert.equal(x.w.document.querySelector('#dialog').open,true);assert.match(x.w.document.querySelector('#alert').textContent,/autre fenêtre/);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,1);assert.ok(savedButton(x.w,'Mettre les candidatures en pause','#view'));
 }finally{x.close()}
});

test('selected or closed projects never offer intake pause or reopening',async()=>{
 for(const status of ['selected','closed']){
  const x=await boot({'/api/v4/projects/41':{...intakeProject,status,applications_paused:1},'/api/projects/41/applications':{items:[]}});
  try{await x.w.projectDetail({id:41});assert.doesNotMatch(x.w.document.querySelector('#view').textContent,/Rouvrir les candidatures|Mettre les candidatures en pause|Candidatures en pause/)}finally{x.close()}
 }
});

test('floating assistant entry remains accessible without a header button',async()=>{
 const x=await boot();
 try{
  const launcher=x.w.document.querySelector('#chatbot-launcher');
  assert.ok(launcher,'floating assistant launcher exists');
  assert.equal(launcher.hidden,false,'visible to signed-in requester');
  assert.equal(launcher.getAttribute('aria-haspopup'),'dialog');
  launcher.click();await tick();
  assert.equal(x.w.document.querySelector('#dialog').open,true);
  assert.match(x.w.document.querySelector('#dialog-content').textContent,/assistant|aide|annonce|métier/i);
  x.w.document.querySelector('#dialog').close();
  await x.w.go('projects');await tick();
  assert.equal(launcher.hidden,false,'entry remains visible while navigating');
 }finally{x.close()}
});

test('Yahya displays Assistant IA below its name in launcher and chat header',async()=>{
 const x=await boot();
 try{
  const launcher=x.w.document.querySelector('#chatbot-launcher');
  assert.equal(launcher.querySelector('.chatbot-label-stack strong')?.textContent,'Yahya');
  assert.equal(launcher.querySelector('.chatbot-label-stack small')?.textContent,'Assistant IA');
  launcher.click();await tick();
  const heading=x.w.document.querySelector('#dialog-title');
  assert.equal(heading?.firstChild?.textContent,'Yahya');
  assert.equal(heading?.querySelector('.ai-chat-subtitle')?.textContent,'Assistant IA');
 }finally{x.close()}
});

test('header is minimal and account actions appear only in Mon compte for all roles',async()=>{
 for(const role of ['requester','professional','admin']){
  const x=await boot({'/api/session':{id:role==='requester'?1:role==='professional'?2:3,name:'Compte test',role,csrf:'csrf-test'},
    '/api/account/export':{user:{name:'Compte test',email:'compte@ucp.test',role},own_projects:[],own_applications:[],own_messages:[]},
    '/api/account/sessions':{active_sessions:1,password_change_available:false},
    '/api/account/activity':{items:[]}});
  try{
   const header=x.w.document.querySelector('header.header');
   assert.equal(header.querySelectorAll('button').length,0,'no installation, logout or Yahya header buttons');
   assert.equal(x.w.document.querySelector('#account-actions').hidden,true);
   assert.ok(x.w.document.querySelector('#chatbot-launcher'));
   await x.w.go('personal-data');await tick();
   assert.equal(x.w.document.querySelector('#account-actions').hidden,false,'account actions visible in Mon compte');
   assert.equal(x.w.document.querySelector('#account-actions #install-app').textContent,'Installer UCP');
   assert.equal(x.w.document.querySelector('#account-actions #logout').textContent,'Se déconnecter');
   await x.w.go('support');await tick();
   assert.equal(x.w.document.querySelector('#account-actions').hidden,true,'actions not shown elsewhere');
  }finally{x.close()}
 }
});

test('UX audit: requester home prioritizes an unfinished draft but keeps activity accessible',async()=>{
 const draft={id:41,title:'Salle de bain',description:'Remplacer douche et carrelage',town:'Toulouse',version:1,trades:[],photos:[],timing:'flexible'};
 const x=await boot({'/api/projects':{items:[{id:31,title:'Projet publié',town:'Toulouse',status:'open'}]},
  '/api/v4/drafts':{items:[draft]},'/api/conversations':{items:[]},
  '/api/notifications?unread_only=true':{unread:1,items:[]}},null,'http://localhost:8765/particulier');
 try{
  const d=x.w.document;
  assert.equal(d.querySelector('.home-priority h3').textContent,'Une annonce à terminer');
  assert.equal(d.querySelector('.home-priority .primary').textContent,'Reprendre mon brouillon');
  assert.equal(d.querySelector('.home-overview').open,false);
  assert.equal(d.querySelectorAll('.requester-overview>.panel').length,4);
  d.querySelector('.home-priority .primary').click();
  assert.equal(d.querySelector('.wizard [name=title]').value,draft.title);
 }finally{x.close()}
});
test('UX audit: professional home gives a first-time artisan a profile action before searching',async()=>{
 const x=await boot({'/api/session':{id:2,name:'Artisan',role:'professional',csrf:'abc'},
 '/api/projects':{items:[],search_scope:'ready'},'/api/my-applications':{items:[]},
 '/api/conversations':{items:[]},'/api/my-profile':{profile:null},
 '/api/notifications?unread_only=true':{unread:0,items:[]}},null,'http://localhost:8765/professionnel');
 try{
  const d=x.w.document;
  assert.match(d.querySelector('.home-priority h3').textContent,/Complétez votre profil/);
  assert.equal(d.querySelector('.home-priority .primary').textContent,'Compléter mon profil');
  assert.equal(d.querySelector('.home-overview').open,false);
  assert.equal(d.querySelectorAll('.overview-grid>.panel').length,5);
  assert.equal(d.querySelectorAll('#tabs>.navlink').length,4);
  const more=d.querySelector('#tabs>.nav-secondary');
  assert.ok(more);assert.equal(more.open,false);
  assert.ok([...more.querySelectorAll('button')].some(b=>b.textContent==='Mon entreprise'));
  assert.ok([...more.querySelectorAll('button')].some(b=>b.textContent==='Notifications'));
  more.open=true;
  [...more.querySelectorAll('button')].find(b=>b.textContent==='Mon profil').click();
  await tick();assert.equal(d.querySelector('.nav-secondary').open,true);
  assert.equal(d.querySelector('#navigation-current').textContent,'Mon profil');
 }finally{x.close()}
});
test('UX audit: professional search starts with trade and commune; requester only filters their projects',async()=>{
 const r=await boot();
 try{
  assert.equal(r.w.document.querySelector('.search-core [name=trade]'),null);
  assert.equal(r.w.document.querySelector('.search-core [name=town]'),null);
  assert.ok(r.w.document.querySelector('.search-advanced [name=status]'));
  assert.equal(r.w.document.querySelector('.project-search [name=budget_from]'),null);
 }finally{r.close()}
 const p=await boot({'/api/session':{id:2,name:'Pro',role:'professional',csrf:'abc'},
 '/api/projects':{items:[],search_scope:'ready'}});
 try{
  assert.ok(p.w.document.querySelector('.search-core [name=trade]'));
  assert.ok(p.w.document.querySelector('.search-core [name=town]'));
  assert.ok(p.w.document.querySelector('.search-advanced [name=budget_from]'));
  assert.equal(p.w.document.querySelector('.search-advanced').open,false);
 }finally{p.close()}
});
test('UX audit: artist candidate cards favor skills and disclose unverifiable evidence without fake trust badges',async()=>{
 const x=await boot();
 try{
  const area=x.w.document.createElement('div');x.w.document.body.append(area);
  x.w.renderCandidateCards(area,[{
   id:5,professional_name:'Atelier fictif',trades:['plomberie'],town:'Toulouse',
   service_zones:['Toulouse','Blagnac'],status:'pending',verification_status:'test_authorized',
   submitted_at:'2026-11-05T10:00:00Z'
  }]);
  assert.equal(area.querySelector('.candidate-card-skill').textContent,'Plomberie');
  assert.match(area.querySelector('.candidate-card-zones').textContent,/Blagnac/);
  assert.match(area.querySelector('.candidate-verification').textContent,/non vérifiées/);
  assert.equal(area.querySelector('.candidate-more').open,false);
  assert.ok(area.querySelector('.candidate-more .candidate-facts'));
  assert.equal(area.querySelectorAll('.candidate-card').length,1);
 }finally{x.close()}
});
test('UX audit: browser history returns to the prior permitted page',async()=>{
 const x=await boot({'/api/notifications':{items:[],unread:0,next_before_id:null}});
 try{
  await x.w.go('notifications');
  await x.w.go('support');
  assert.equal(x.w.location.hash,'#support');
  x.w.history.back();
  await new Promise(resolve=>setTimeout(resolve,70));
  assert.equal(x.w.location.hash,'#notifications');
  assert.equal(x.w.document.querySelector('#navigation-current').textContent,'Notifications');
  assert.equal(x.w.document.title,'Notifications · Un Coup de Pouce');
 }finally{x.close()}
});
test('UX audit: account screen keeps install and logout after personal information and hides history by default',async()=>{
 const x=await boot({'/api/account/export':{user:{name:'Camille',email:'camille@ucp.test',role:'requester'},own_projects:[],own_applications:[],own_messages:[]},
  '/api/account/sessions':{active_sessions:1,password_change_available:false},
  '/api/account/activity':{items:[]}});
 try{
  await x.w.go('personal-data');
  const d=x.w.document;
  assert.equal(d.querySelector('#view h2').textContent,'Mon compte');
  assert.equal(d.querySelector('#account-actions').previousElementSibling.id,'view');
  assert.equal(d.querySelector('.account-history').open,false);
  assert.ok(d.querySelector('#account-actions #install-app'));
  assert.ok(d.querySelector('#account-actions #logout'));
 }finally{x.close()}
});


test('beta admin dashboard displays grounded access counts and read-only filters',async()=>{
 const x=await boot({
  '/api/session':{id:99,name:'Administrateur',role:'admin',csrf:'admin-token'},
  '/api/admin/metrics':{counts:{requesters:4,professionals:3,projects:2,applications:1,accepted_applications:0,messages:0}},
  '/api/admin/queue':{items:[
   {id:11,name:'Atelier à examiner',trade:'plomberie',town:'Toulouse',approved:0,subscription_active:0},
   {id:12,name:'Atelier à activer',trade:'plomberie',town:'Toulouse',approved:1,subscription_active:0},
   {id:13,name:'Atelier actif',trade:'plomberie',town:'Toulouse',approved:1,subscription_active:1}
  ]},
  '/api/admin/audit':{items:[]}
 });
 try{
  await x.w.go('admin');
  const d=x.w.document,root=d.querySelector('.beta-admin-overview'),filterBox=d.querySelector('.beta-admin-queue');
  assert.ok(root);assert.ok(filterBox);
  assert.match(root.textContent,/Comptes particuliers/);
  assert.match(root.textContent,/4/);
  assert.match(root.textContent,/Profils à examiner/);
  assert.match(root.textContent,/Accès à activer/);
  assert.match(root.textContent,/ne distinguent pas la prochaine cohorte/);
  assert.match(root.textContent,/non vérifié dans cette interface/);
  assert.equal(filterBox.querySelectorAll('.beta-admin-profile').length,3);
  const filters=[...filterBox.querySelectorAll('.beta-admin-filters button')];
  filters.find(b=>b.textContent==='Accès actifs').click();
  assert.equal(filterBox.querySelectorAll('.beta-admin-profile').length,1);
  assert.match(filterBox.querySelector('.beta-admin-profile').textContent,/Atelier actif/);
  assert.equal(filters.find(b=>b.textContent==='Accès actifs').getAttribute('aria-pressed'),'true');
  filters.find(b=>b.textContent==='À examiner').click();
  assert.match(filterBox.querySelector('.beta-admin-profile').textContent,/Atelier à examiner/);
  assert.equal(x.calls.filter(c=>c.method!=='GET').length,0);
 }finally{x.close()}
});
test('beta admin revocation requires deliberate confirmation and does not suspend identity',async()=>{
 const x=await boot({
  '/api/session':{id:99,name:'Administrateur',role:'admin',csrf:'admin-token'},
  '/api/admin/metrics':{counts:{}},
  '/api/admin/queue':{items:[{id:13,name:'Atelier actif',trade:'plomberie',town:'Toulouse',approved:1,subscription_active:1}]},
  '/api/admin/audit':{items:[]},
  'POST /api/admin/professionals/13/revoke-test-subscription':{ok:true,test_access_active:false,profile_approved:true}
 });
 try{
  await x.w.go('admin');
  const d=x.w.document,button=[...d.querySelectorAll('.beta-admin-profile-actions button')].find(b=>/Retirer l’accès/.test(b.textContent));
  assert.ok(button);
  button.click();
  assert.equal(d.querySelector('#dialog').open,true);
  assert.match(d.querySelector('#dialog').textContent,/profil restera autorisé/);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0,'opening confirmation must not modify data');
  d.querySelector('#dialog-close').click();
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0,'closing the modal must not modify data');
  button.click();
  [...d.querySelectorAll('#dialog button')].find(b=>b.textContent==='Confirmer').click();
  await tick();await tick();
  const writes=x.calls.filter(c=>c.method==='POST');
  assert.equal(writes.length,1);
  assert.equal(writes[0].url,'/api/admin/professionals/13/revoke-test-subscription');
  assert.equal(writes[0].headers['x-ucp-csrf'],'admin-token');
 }finally{x.close()}
});
test('beta admin approval and activation also require explicit confirmations',async()=>{
 const x=await boot({
  '/api/session':{id:99,name:'Administrateur',role:'admin',csrf:'admin-token'},
  '/api/admin/metrics':{counts:{}},
  '/api/admin/queue':{items:[
   {id:11,name:'Atelier à examiner',trade:'plomberie',town:'Toulouse',approved:0,subscription_active:0},
   {id:12,name:'Atelier à activer',trade:'plomberie',town:'Toulouse',approved:1,subscription_active:0}]},
  '/api/admin/audit':{items:[]}
 });
 try{
  await x.w.go('admin');
  const d=x.w.document,buttons=[...d.querySelectorAll('.beta-admin-profile-actions button')];
  buttons.find(b=>b.textContent==='Autoriser le profil en test').click();
  assert.match(d.querySelector('#dialog').textContent,/ne certifie pas/);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
  d.querySelector('#dialog-close').click();
  buttons.find(b=>b.textContent==='Activer les conversations de test').click();
  assert.match(d.querySelector('#dialog').textContent,/Aucun paiement réel/);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 }finally{x.close()}
});

test('private beta guide explains fictitious test data before login and never changes a user',async()=>{
 const x=await boot();
 try{
  const d=x.w.document;
  assert.ok(d.querySelector('#beta-start'));
  x.w.eval("appState.user=null;entrySpace='requester'");
  x.w.openBetaGuide();
  assert.match(d.querySelector('#dialog').textContent,/Parcours particulier/);
  assert.match(d.querySelector('#dialog').textContent,/travaux imaginaires/);
  assert.match(d.querySelector('#dialog').textContent,/Connectez-vous/);
  assert.equal(d.querySelector('#dialog .beta-step-action'),null);
  d.querySelector('#dialog-close').click();
  x.w.eval("entrySpace='professional'");
  x.w.openBetaGuide();
  assert.match(d.querySelector('#dialog').textContent,/validation manuelle de test/);
  assert.equal(x.calls.filter(c=>c.method!=='GET').length,0);
 }finally{x.close()}
});
test('requester beta guide opens the real projects page on explicit click',async()=>{
 const x=await boot();
 try{
  const d=x.w.document;
  d.querySelector('#beta-help').click();
  assert.equal(d.querySelectorAll('.beta-step').length,4);
  assert.match(d.querySelector('.beta-guide').textContent,/chantier inventé/);
  assert.equal(d.querySelectorAll('.beta-steps input[type=checkbox]').length,0);
  const open=[...d.querySelectorAll('.beta-step-action')].find(b=>b.textContent==='Créer une annonce');
  assert.ok(open);open.click();await tick();
  assert.equal(d.querySelector('#dialog').open,false);
  assert.equal(x.w.location.hash,'#projects');
  assert.match(d.querySelector('#view h2').textContent,/Mes projets/);
 }finally{x.close()}
});
test('professional beta guide shows the approval requirement and profile entry',async()=>{
 const x=await boot({
  '/api/session':{id:2,name:'Pro test',role:'professional',csrf:'pro-token'},
  '/api/projects':{items:[],search_scope:'profile_required'},
  '/api/my-applications':{items:[]},'/api/conversations':{items:[]},
  '/api/notifications?unread_only=true':{unread:0,items:[]}
 });
 try{
  const d=x.w.document;
  d.querySelector('#beta-help').click();
  assert.match(d.querySelector('.beta-guide').textContent,/validation manuelle de test/);
  assert.match(d.querySelector('.beta-guide').textContent,/aucun paiement réel/i);
  const open=[...d.querySelectorAll('.beta-step-action')].find(b=>b.textContent==='Ouvrir mon profil');
  assert.ok(open);open.click();await tick();
  assert.equal(x.w.location.hash,'#profile');
  assert.ok(x.calls.some(c=>c.url==='/api/my-profile'));
 }finally{x.close()}
});
test('beta feedback posts one private support ticket with CSRF and role',async()=>{
 const x=await boot({
  'POST /api/v4/support':{id:82,status:'open'},
  '/api/v4/support':{items:[],next_before_id:null,categories:{other:'Autre demande'}}
 });
 try{
  const d=x.w.document;
  d.querySelector('#beta-help').click();
  [...d.querySelectorAll('.beta-guide-actions button')].find(b=>b.textContent==='Signaler un problème de test').click();
  input(x.w,'#dialog [name=subject]','Publication fictive');
  input(x.w,'#dialog [name=body]','Le titre ne s’affiche pas après la publication.');
  submit(x.w,'#dialog form');await tick();await tick();
  const writes=x.calls.filter(c=>c.method==='POST');
  assert.equal(writes.length,1);
  const sent=writes[0];
  assert.equal(sent.url,'/api/v4/support');
  assert.equal(sent.headers['x-ucp-csrf'],'test-token');
  assert.equal(sent.body.category,'other');
  assert.match(sent.body.subject,/^Bêta UCP : Publication/);
  assert.match(sent.body.body,/Parcours : particulier/);
  assert.equal(d.querySelector('#dialog').open,false);
  assert.equal(x.w.location.hash,'#support');
 }finally{x.close()}
});
test('beta feedback preserves form contents after a server error',async()=>{
 const x=await boot({'POST /api/v4/support':{status:503,data:{detail:'Support temporairement indisponible'}}});
 try{
  const d=x.w.document;
  d.querySelector('#beta-help').click();
  [...d.querySelectorAll('.beta-guide-actions button')].find(b=>b.textContent==='Signaler un problème de test').click();
  input(x.w,'#dialog [name=subject]','Test de candidature');
  input(x.w,'#dialog [name=body]','Je ne vois pas la candidature dans mon tableau.');
  submit(x.w,'#dialog form');await tick();
  assert.equal(d.querySelector('#dialog').open,true);
  assert.equal(d.querySelector('#dialog [name=body]').value,'Je ne vois pas la candidature dans mon tableau.');
  assert.match(d.querySelector('#alert').textContent,/Support temporairement indisponible/);
  assert.equal(x.w.location.hash,'#projects');
 }finally{x.close()}
});

test('UX release: clearly labelled 2026-11-06 version and versioned static assets are present',async()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/Nouveau : préparation des testeurs et accès de test administrables · 6 novembre 2026/);
 for(const name of ['style.css','analytics.js','local-ai.js','assistant-ai.js','app.js','pwa.js']){
  assert.ok(html.includes('/assets/'+name+'?v=ucp-admin-beta-20261106'),name+' should be release-versioned');
 }
 const x=await boot();
 try{
  const control=x.w.document.querySelector('#release-notes');
  assert.ok(control);
  assert.match(control.textContent,/Voir les changements/);
  control.click();
  assert.equal(x.w.document.querySelector('#dialog').open,true);
  assert.match(x.w.document.querySelector('#dialog-title').textContent,/nouveautés UX\/UI/);
  assert.match(x.w.document.querySelector('#dialog').textContent,/recherche/i);
  assert.match(x.w.document.querySelector('#dialog').textContent,/menu professionnel/i);
  assert.match(x.w.document.querySelector('#dialog').textContent,/modèle léger/);
  assert.match(x.w.document.querySelector('#dialog').textContent,/réessai avec le même identifiant/);
  assert.match(x.w.document.querySelector('#dialog').textContent,/Installer UCP sur ce téléphone/);
  assert.match(x.w.document.querySelector('#dialog').textContent,/toucher extérieur/);
  assert.match(x.w.document.querySelector('#dialog').textContent,/681 à 960 pixels/);
  assert.match(x.w.document.querySelector('#dialog').textContent,/Bêta privée : un guide de parcours/);
  assert.match(x.w.document.querySelector('#dialog').textContent,/2026\.11\.06/);
 }finally{x.close()}
});

test('F19: a closed selected project offers private feedback with explicit confirmation',async()=>{
 const project={id:72,title:'Salle de bains fictive',description:'Projet de rénovation fictif après mise en relation.',trade:'plomberie',trades:['plomberie'],town:'Toulouse',status:'closed',cancelled:0,photos:[],content_editable:false};
 const response={eligible:true,project_closed:true,cancelled:false,application_id:19,professional_name:'Artisan de test',feedback:null,visibility:'private_test'};
 const x=await boot({
  '/api/v4/projects/72':project,
  '/api/projects/72/applications':{items:[{id:19,professional_name:'Artisan de test',status:'accepted',trade:'plomberie',town:'Toulouse'}]},
  '/api/projects/72/feedback':response,
  'POST /api/projects/72/feedback':call=>({ok:true,visibility:'private_test',feedback:{application_id:19,rating:call.body.rating,comment:call.body.comment,created_at:'2026-11-06T10:00:00+00:00'}})
 });
 try{
  await x.w.projectDetail(project);
  const p=x.w.document.querySelector('.project-feedback'),form=p?.querySelector('form');
  assert.ok(form);
  assert.match(p.textContent,/retour.*privé|retour.*mise en relation/i);
  assert.match(p.textContent,/n’est pas une certification ni un avis public/i);
  form.elements.rating.value='4';
  form.elements.comment.value='Les échanges fictifs ont été clairs et les délais bien expliqués.';
  form.elements.collaboration_confirmed.checked=true;
  submit(x.w,'.feedback-form');
  await new Promise(resolve=>setTimeout(resolve,30));
  const sent=x.calls.filter(c=>c.url==='/api/projects/72/feedback'&&c.method==='POST');
  assert.equal(sent.length,1);
  assert.deepEqual(sent[0].body,{application_id:19,rating:4,comment:'Les échanges fictifs ont été clairs et les délais bien expliqués.',collaboration_confirmed:true});
  assert.equal(sent[0].headers['x-ucp-csrf'],'test-token');
  assert.equal(p.querySelector('.feedback-form'),null);
  assert.match(p.textContent,/Votre retour est enregistré/);
 }finally{x.close()}
});
test('F19: no feedback form after cancelled project or unselected closed project',async()=>{
 const project={id:72,title:'Projet de test',description:'Description fictive des travaux.',trade:'plomberie',trades:['plomberie'],town:'Toulouse',status:'closed',cancelled:1,photos:[]};
 const x=await boot({'/api/v4/projects/72':project,'/api/projects/72/applications':{items:[]}});
 try{
  await x.w.projectDetail(project);
  assert.equal(x.w.document.querySelector('.project-feedback'),null);
  assert.equal(x.calls.filter(c=>c.url==='/api/projects/72/feedback').length,0);
 }finally{x.close()}
 const uncancelled={...project,cancelled:0};
 const y=await boot({'/api/v4/projects/72':uncancelled,'/api/projects/72/applications':{items:[]},'/api/projects/72/feedback':{eligible:false,application_id:null,feedback:null}});
 try{
  await y.w.projectDetail(uncancelled);
  assert.equal(y.w.document.querySelector('.project-feedback'),null);
 }finally{y.close()}
});
test('F19: a saved private feedback is readable only on the requester project detail',async()=>{
 const project={id:72,title:'Projet fictif',description:'Rénovation et réparation fictives.',trade:'plomberie',trades:['plomberie'],town:'Toulouse',status:'closed',cancelled:0,photos:[]};
 const x=await boot({'/api/v4/projects/72':project,'/api/projects/72/applications':{items:[]},
 '/api/projects/72/feedback':{eligible:false,feedback:{application_id:7,rating:5,comment:'Les échanges fictifs se sont bien déroulés.',created_at:'2026-11-06T10:00:00+00:00'}}});
 try{
  await x.w.projectDetail(project);
  assert.equal(x.w.document.querySelector('.feedback-form'),null);
  assert.match(x.w.document.querySelector('.project-feedback').textContent,/5 \/ 5/);
  assert.match(x.w.document.querySelector('.project-feedback').textContent,/Ce retour fictif est privé/);
 }finally{x.close()}
});

test('F11: guided three-step project wizard keeps optional measurements in saved draft and preview',async()=>{
 let version=0;
 const x=await boot({
  'POST /api/v4/drafts':()=>({id:5,version:++version}),
  'PUT /api/v4/drafts/5':()=>({id:5,version:++version}),
 });
 try{
  const {w,calls}=x;
  w.startWizard();
  input(w,'.wizard [name=title]','Rénover une salle de bains fictive');
  input(w,'.wizard [name=description]','Je souhaite refaire une petite salle de bains fictive.');
  const trade=w.document.querySelector('.wizard input[value=plomberie]');
  trade.checked=true;trade.dispatchEvent(new w.Event('change',{bubbles:true}));
  submit(w,'.wizard form');await tick();
  assert.ok(w.document.querySelector('.wizard [name=surface_m2]'));
  assert.ok(w.document.querySelector('.wizard [name=length_m]'));
  assert.ok(w.document.querySelector('.wizard [name=width_m]'));
  assert.ok(w.document.querySelector('.wizard [name=height_m]'));
  const d=w.document.querySelector('.measurements-panel');
  assert.equal(d.open,false);
  d.open=true;
  input(w,'.wizard [name=surface_m2]','8.75');
  input(w,'.wizard [name=length_m]','3.5');
  input(w,'.wizard [name=width_m]','2.5');
  input(w,'.wizard [name=height_m]','2.4');
  submit(w,'.wizard form');await tick();
  const saved=calls.filter(c=>c.method==='PUT'&&c.url==='/api/v4/drafts/5').at(-1);
  assert.ok(saved);
  assert.deepEqual(saved.body.dimensions,{surface_m2:8.75,length_m:3.5,width_m:2.5,height_m:2.4});
  assert.match(w.document.querySelector('.wizard .review').textContent,/Surface estimée.*8,75 m²/);
  assert.match(w.document.querySelector('.wizard .review').textContent,/Longueur.*3,5 m/);
  assert.match(w.document.querySelector('.wizard .review').textContent,/Hauteur/);
 }finally{x.close()}
});

test('F11: dimension inputs can be entirely omitted and the final review says so',async()=>{
 const x=await boot({'POST /api/v4/drafts':{id:5,version:1},'PUT /api/v4/drafts/5':{id:5,version:2}});
 try{
  const w=x.w;
  w.startWizard();
  input(w,'.wizard [name=title]','Rénovation fictive du salon');
  input(w,'.wizard [name=description]','Je souhaite aménager et remettre en état une pièce.');
  const trade=w.document.querySelector('.wizard input[value=plomberie]');
  trade.checked=true;trade.dispatchEvent(new w.Event('change',{bubbles:true}));
  submit(w,'.wizard form');await tick();
  assert.equal(w.document.querySelector('.measurements-panel').open,false);
  submit(w,'.wizard form');await tick();
  assert.match(w.document.querySelector('.wizard .review').textContent,/Dimensions indicatives.*Non renseignées/s);
 }finally{x.close()}
});

test('F11: detail displays only stored dimensions, in the authorized project page',async()=>{
 const project={id:61,title:'Chantier fictif',description:'Une rénovation de la salle de bains fictive.',trade:'plomberie',trades:['plomberie'],town:'Toulouse',status:'open',photos:[],dimensions:{surface_m2:10.5,height_m:2.55}};
 const x=await boot({'/api/v4/projects/61':project,'/api/projects/61/applications':{items:[]}});
 try{
  await x.w.projectDetail(project);
  const panel=x.w.document.querySelector('.project-measurements');
  assert.ok(panel);
  assert.match(panel.textContent,/Surface estimée.*10,5 m²/);
  assert.match(panel.textContent,/Hauteur.*2,55 m/);
  assert.match(panel.textContent,/sans diagnostic ni validation technique/);
 }finally{x.close()}
});

test('F11: the existing project editor submits structured dimensions',async()=>{
 const project={id:61,title:'Rénovation fictive',description:'Description de travaux fictifs pour validation.',trade:'plomberie',town:'Toulouse',budget_min:null,budget_max:null,dimensions:{surface_m2:8.25},content_version:2,status:'open',content_scope_locked:false};
 const x=await boot({'PUT /api/projects/61':{ok:true,content_version:3,changed:true,notified:0}});
 try{
  x.w.editProject(project);
  const form=x.w.document.querySelector('#dialog form');
  assert.ok(form);
  assert.equal(form.elements.namedItem('surface_m2').value,'8.25');
  assert.equal(form.elements.namedItem('height_m').value,'');
  input(x.w,'#dialog [name=height_m]','2.4');
  submit(x.w,'#dialog form');await tick();
  const sent=x.calls.find(c=>c.method==='PUT'&&c.url==='/api/projects/61');
  assert.ok(sent);
  assert.deepEqual(sent.body.dimensions,{surface_m2:8.25,height_m:2.4});
  assert.equal(sent.body.content_version,2);
 }finally{x.close()}
});

test('F35: candidate showcase only creates a gated work image URL for supplied photo IDs',async()=>{
 const candidate={intro:'Rénovation déclarée',works:[
  {title:'Salle de bains fictive',trade:'plomberie',year:2025,description:'Rénovation de pièces et remplacement de sanitaires.',photo_id:71},
  {title:'Cuisine fictive',trade:'plomberie',description:'Autre chantier sans photo déclarée.'}],
 declaration:'Informations déclarées et non vérifiées.'};
 const x=await boot({'/api/projects/4/applications/22/showcase':candidate});
 try{
  await x.w.openCandidateShowcase(4,{id:22,professional_name:'Atelier fictif'});
  const dialog=x.w.document.querySelector('#dialog');
  const image=dialog.querySelector('.showcase-work-image');
  assert.ok(image);
  assert.equal(image.getAttribute('src'),'/api/projects/4/applications/22/showcase/photos/71');
  assert.match(image.getAttribute('alt'),/Salle de bains fictive/);
  assert.equal(dialog.querySelectorAll('.showcase-work-image').length,1);
  assert.match(dialog.textContent,/déclarées/);
  assert.equal(x.calls.filter(c=>c.url.includes('/showcase/photos/')).length,0);
 }finally{x.close()}
});
test('F35: private photo manager exposes a separate action for an existing linked realization',async()=>{
 const body={intro:'Profil fictif',works:[{title:'Peinture intérieure',description:'Rénovation intérieure fictive et décoration complète.',trade:'peinture',year:2024,photo_id:27}],version:3,scope:{name:'Équipe liée',trades:['peinture'],active:true}};
 const x=await boot({'/api/v4/showcase?linked_profile_id=7':body});
 try{
  await x.w.manageShowcasePhotos(7);
  const dialog=x.w.document.querySelector('#dialog');
  assert.match(dialog.textContent,/Photos des réalisations/);
  assert.ok(dialog.querySelector('img[src="/api/v4/showcase/photos/27"]'));
  assert.ok(dialog.querySelector('input[type=file][accept="image/jpeg,image/png,image/webp"]'));
  assert.ok([...dialog.querySelectorAll('button')].some(b=>b.textContent==='Supprimer cette photo'));
  const buttons=[...dialog.querySelectorAll('button')];
  buttons.find(b=>b.textContent==='Supprimer cette photo').click();
  assert.match(dialog.textContent,/Supprimer cette photo/);
  assert.equal(x.calls.some(c=>c.method==='DELETE'),false);
 }finally{x.close()}
});
test('F35: manager uploads a file to the exact saved work with version and linked scope',async()=>{
 let n=0;
 const base={intro:'Présentation fictive',works:[{title:'Peinture fictive',description:'Exemple de peinture intérieure entièrement fictif.',trade:'peinture',year:2025}],version:1,scope:{name:'Équipe peinture',trades:['peinture'],active:true}};
 const x=await boot({
  '/api/v4/showcase?linked_profile_id=7':()=>++n===1?base:{...base,version:2,works:[{...base.works[0],photo_id:77}]},
  'POST /api/v4/showcase/photos/0?linked_profile_id=7':{ok:true,photo_id:77,version:2}
 });
 try{
  await x.w.manageShowcasePhotos(7);
  const file=new x.w.File(['image fictive'],'test-photo.jpg',{type:'image/jpeg'});
  const control=x.w.document.querySelector('#dialog input[type=file]');
  Object.defineProperty(control,'files',{configurable:true,value:[file]});
  control.dispatchEvent(new x.w.Event('change',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,95));
  const sent=x.calls.find(c=>c.method==='POST');
  assert.ok(sent);
  assert.equal(sent.url,'/api/v4/showcase/photos/0?linked_profile_id=7');
  assert.equal(sent.body.version,1);
  assert.equal(sent.body.data,Buffer.from('image fictive').toString('base64'));
  assert.equal(sent.headers['x-ucp-csrf'],'test-token');
  assert.ok(x.w.document.querySelector('#dialog img[src="/api/v4/showcase/photos/77"]'));
 }finally{x.close()}
});
test('F35: editing text retains saved photo identity and removing work drops it explicitly',async()=>{
 const base={intro:'Texte fictif',works:[{title:'Cuisine fictive',description:'Pose de canalisations et sanitaires dans une cuisine.',trade:'plomberie',year:2025,photo_id:81}],version:3,scope:{name:'Atelier',trades:['plomberie'],active:true}};
 const x=await boot({'/api/v4/showcase':base,'PUT /api/v4/showcase':{ok:true,version:4}});
 try{
  await x.w.editShowcase(null);
  submit(x.w,'#dialog form');await tick();
  let sent=x.calls.filter(c=>c.method==='PUT');
  assert.equal(sent.length,1);
  assert.equal(sent[0].body.works[0].photo_id,81);
  assert.equal(sent[0].body.version,3);
 }finally{x.close()}
 const y=await boot({'/api/v4/showcase':base,'PUT /api/v4/showcase':{ok:true,version:4}});
 try{
  await y.w.editShowcase(null);
  [...y.w.document.querySelectorAll('#dialog button')].find(b=>b.textContent==='Retirer de ce formulaire').click();
  submit(y.w,'#dialog form');await tick();
  const sent=y.calls.find(c=>c.method==='PUT');
  assert.deepEqual(sent.body.works,[]);
 }finally{y.close()}
});
test('F35: comparisons keep each candidate photo in the right authorized scope',async()=>{
 const works=id=>({intro:'Profil fictif',works:[{title:'Travaux fictifs',description:'Réalisation de travaux déclarés fictifs.',trade:'plomberie',photo_id:id}]});
 const x=await boot({'/api/projects/5/applications/31/showcase':works(101),'/api/projects/5/applications/32/showcase':works(202)});
 try{
  const box=x.w.document.querySelector('#view');
  x.w.renderCandidateCards(box,[{id:31,professional_name:'Artisan A',status:'pending',trade:'plomberie',town:'Toulouse'},{id:32,professional_name:'Artisan B',status:'pending',trade:'plomberie',town:'Toulouse'}],5);
  for(const c of box.querySelectorAll('.candidate-choice input')){c.checked=true;c.dispatchEvent(new x.w.Event('change'))}
  [...box.querySelectorAll('button')].find(b=>b.textContent==='Comparer les profils sélectionnés').click();await tick();
  const images=[...x.w.document.querySelectorAll('#dialog .comparison-card img')].map(i=>i.getAttribute('src'));
  assert.deepEqual(images,['/api/projects/5/applications/31/showcase/photos/101','/api/projects/5/applications/32/showcase/photos/202']);
 }finally{x.close()}
});
