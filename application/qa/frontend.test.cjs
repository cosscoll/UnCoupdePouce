/* DOM simulation, not a real browser, rendering or accessibility audit. */
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const root=path.join(__dirname,'../backend/static');
const tick=()=>new Promise(r=>setTimeout(r,12));
async function boot(overrides={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost:8765',runScripts:'outside-only'});
 const w=dom.window,calls=[];
 w.structuredClone=structuredClone;w.AbortSignal.timeout=AbortSignal.timeout;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.crypto.randomUUID=crypto.randomUUID;
 const defaults={'/api/catalog':{items:JSON.parse(fs.readFileSync(path.join(root,'../taxonomy.json'),'utf8'))},'/api/session':{id:1,name:'Camille',role:'requester',csrf:'test-token'},'/api/projects':{items:[]},'/api/v4/drafts':{items:[]},'/api/my-profile':{profile:null},'/api/my-applications':{items:[]},'/api/health':{presentation:false}};
 w.fetch=async(url,opts={})=>{
  const call={url,method:opts.method||'GET',body:opts.body?JSON.parse(opts.body):null,headers:opts.headers};calls.push(call);
  let r=overrides[call.method+' '+url]??overrides[url]??defaults[url];
  if(typeof r==='function')r=await r(call);
  if(r===undefined)throw Error('Unhandled mock route: '+call.method+' '+url);
  return {ok:!(r.status>=400),status:r.status||200,json:async()=>r.data??r};
 };
 w.eval(fs.readFileSync(path.join(root,'analytics.js'),'utf8'));
 new (require('node:vm').Script)(fs.readFileSync(path.join(root,'app.js'),'utf8')).runInContext(dom.getInternalVMContext());
 await tick();return {dom,w,calls,close:()=>w.close()};
}
test('atelier remains useful without loading WebGL or writing API data',async()=>{
 const x=await boot();try{await x.w.go('atelier');const view=x.w.document.querySelector('#view');assert.match(view.textContent,/Imaginez la suite/);assert.equal(view.querySelector('canvas'),null);const horizon=[...view.querySelectorAll('button')].find(b=>b.textContent==='Horizon');horizon.click();assert.equal(horizon.getAttribute('aria-pressed'),'true');assert.match(view.querySelector('[role=status]').textContent,/Horizon/);assert.equal(x.calls.filter(c=>c.method!=='GET').length,0)}finally{x.close()}
});
test('professional atelier directs to opportunities, not requester publication',async()=>{
 const x=await boot({'/api/session':{id:2,name:'Atelier fictif',role:'professional',csrf:'test'}});try{await x.w.go('atelier');const view=x.w.document.querySelector('#view');assert.match(view.textContent,/Trouver des projets/);assert.doesNotMatch(view.textContent,/Préparer ce projet/);assert.equal(x.calls.filter(c=>c.method!=='GET').length,0)}finally{x.close()}
});
test('actions and explicit photo consent survive wizard saves',async()=>{
 let version=0;const x=await boot({'POST /api/v4/drafts':()=>({id:5,version:++version}),'PUT /api/v4/drafts/5':()=>({id:5,version:++version})});
 try{x.w.startWizard({title:'Travaux fictifs',description:'Refaire les murs et préparer les supports du salon.',town:'Toulouse',trades:['peinture'],timing:'month',version:0,photos:[]});input(x.w,'[name=project_actions]','Préparer les supports\nPeindre les murs');submit(x.w,'.wizard form');await tick();const consent=x.w.document.querySelector('[name=share_photos]');assert.ok(consent);assert.equal(consent.checked,false);consent.checked=true;consent.dispatchEvent(new x.w.Event('change',{bubbles:true}));submit(x.w,'.wizard form');await tick();const sent=x.calls.filter(c=>c.method==='PUT').at(-1).body;assert.deepEqual(sent.actions,['Préparer les supports','Peindre les murs']);assert.equal(sent.photo_visibility,'matched');assert.match(x.w.document.querySelector('.review').textContent,/Partagées dans le fil/)}finally{x.close()}
});
test('professional feed ranks real matching trades and never invents photos',async()=>{
 const items=[{id:1,title:'Salle de bains',description:'Travaux fictifs de plomberie et de carrelage.',trade:'plomberie',trades_json:'["plomberie","carrelage"]',town:'Toulouse',status:'open',actions:['Poser le carrelage'],photos:[]},{id:2,title:'Une fuite',description:'Un raccord à remplacer dans un logement fictif.',trade:'plomberie',town:'Toulouse',status:'open',photos:[]}];
 const x=await boot({'/api/session':{id:2,name:'Atelier fictif',role:'professional',csrf:'test'},'/api/projects':{items},'/api/my-profile':{profile:{trade:'plomberie',additional_trades:['carrelage'],approved:true,subscription_active:true}}});
 try{assert.match(x.w.document.querySelector('.chantier-card h3').textContent,/Salle de bains/);assert.match(x.w.document.querySelector('.match-reason').textContent,/Carrelage/);assert.equal(x.w.document.querySelectorAll('.chantier-gallery img').length,0);assert.match(x.w.document.querySelector('.chantier-actions').textContent,/Poser le carrelage/)}finally{x.close()}
});
test('gallery renders only numeric authorized photo IDs without autoplay',async()=>{
 const x=await boot();try{const gallery=x.w.projectGallery({title:'Projet fictif',photos:[1,2,'javascript:alert(1)',-1]});assert.equal(gallery.querySelectorAll('img').length,2);assert.equal(gallery.querySelector('img').getAttribute('src'),'/api/v4/photos/1');assert.equal(gallery.querySelectorAll('button').length,2);assert.match(gallery.textContent,/1 \/ 2/)}finally{x.close()}
});
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

test('project overview counts only the current requester projects and drafts',async()=>{
 const x=await boot({'/api/projects':{items:[{id:1,title:'Projet ouvert',town:'Toulouse',trade:'plomberie',status:'open'},{id:2,title:'Projet en relation',town:'Toulouse',trade:'peinture',status:'selected'},{id:3,title:'Projet terminé',town:'Toulouse',trade:'peinture',status:'closed'}]},'/api/v4/drafts':{items:[{id:4,title:'Brouillon fictif'}]}});
 try{const overview=x.w.document.querySelector('.project-overview');assert.ok(overview);assert.deepEqual([...overview.querySelectorAll('strong')].map(n=>n.textContent),['1','1','1']);}finally{x.close()}
});

test('password visibility changes only the selected form and preserves the value',async()=>{
 const x=await boot();try{
  const login=x.w.document.querySelector('#login-form [name=password]');login.value='Fictive-Password!2026';
  const toggle=x.w.document.querySelector('#login-form .password-toggle');toggle.click();
  assert.equal(login.type,'text');assert.equal(login.value,'Fictive-Password!2026');assert.equal(toggle.getAttribute('aria-pressed'),'true');
  assert.equal(x.w.document.querySelector('#register-form [name=password]').type,'password');
  toggle.click();assert.equal(login.type,'password');assert.equal(toggle.getAttribute('aria-pressed'),'false');
 }finally{x.close()}
});

test('account access buttons expose the selected form to assistive technology',async()=>{
 const x=await boot();try{
  x.w.document.querySelector('#tab-register').click();assert.equal(x.w.document.querySelector('#tab-register').getAttribute('aria-pressed'),'true');assert.equal(x.w.document.querySelector('#login-form').hidden,true);
  x.w.document.querySelector('#tab-login').click();assert.equal(x.w.document.querySelector('#tab-register').getAttribute('aria-pressed'),'false');assert.equal(x.w.document.querySelector('#register-form').hidden,true);
 }finally{x.close()}
});

test('a suggested trade replaces the unknown choice before publication',async()=>{
 const x=await boot();try{
  x.w.startWizard();input(x.w,'.wizard [name=title]','Travaux de plomberie');input(x.w,'.wizard [name=description]','Refaire la plomberie dans une pièce fictive.');
  const unknown=x.w.document.querySelector('input[value=inconnu]');unknown.checked=true;unknown.dispatchEvent(new x.w.Event('change',{bubbles:true}));
  [...x.w.document.querySelectorAll('button')].find(b=>b.textContent==='Me suggérer des métiers').click();
  [...x.w.document.querySelectorAll('#dialog button')].find(b=>b.textContent==='Plomberie').click();
  assert.equal(x.w.document.querySelector('input[value=plomberie]').checked,true);assert.equal(x.w.document.querySelector('input[value=inconnu]').checked,false);
 }finally{x.close()}
});

test('successful login clears and hides the submitted password',async()=>{
 const x=await boot({'POST /api/login':{user_id:1,name:'Camille',role:'requester',csrf:'test-token'}});try{
  const password=x.w.document.querySelector('#login-form [name=password]');password.value='Fictive-Password!2026';
  const toggle=x.w.document.querySelector('#login-form .password-toggle');toggle.click();submit(x.w,'#login-form');await tick();
  assert.equal(password.value,'');assert.equal(password.type,'password');assert.equal(toggle.getAttribute('aria-pressed'),'false');
 }finally{x.close()}
});

test('project filters combine town, trade and search, and reset to the full list',async()=>{
 const x=await boot({'/api/projects':{items:[{id:1,title:'Salle de bains',description:'Travaux fictifs',town:'Toulouse',trade:'plomberie',trades_json:'["plomberie","carrelage"]',status:'open'},{id:2,title:'Une cuisine',town:'Blagnac',trade:'plomberie',status:'open'}]}});try{
  const select=x.w.document.querySelector('[aria-label="Filtrer par commune"]');select.value='Toulouse';select.dispatchEvent(new x.w.Event('change'));assert.equal(x.w.document.querySelectorAll('.project-card').length,1);
  const trade=x.w.document.querySelector('[aria-label="Filtrer par métier"]');trade.value='carrelage';trade.dispatchEvent(new x.w.Event('change'));assert.match(x.w.document.querySelector('.project-card').textContent,/Salle de bains/);
  input(x.w,'[aria-label="Rechercher un projet"]','aucun résultat');assert.equal(x.w.document.querySelectorAll('.project-card').length,0);
  [...x.w.document.querySelectorAll('button')].find(b=>b.textContent==='Réinitialiser').click();assert.equal(x.w.document.querySelectorAll('.project-card').length,2);
 }finally{x.close()}
});

test('project pagination limits rendered cards without dropping results',async()=>{
 const x=await boot({'/api/projects':{items:Array.from({length:8},(_,i)=>({id:i+1,title:'Projet fictif '+i,town:'Toulouse',trade:'plomberie',status:'open'}))}});try{
  assert.equal(x.w.document.querySelectorAll('.project-card').length,6);[...x.w.document.querySelectorAll('button')].find(b=>b.textContent==='Suivant').click();assert.equal(x.w.document.querySelectorAll('.project-card').length,2);
  assert.match(x.w.document.querySelector('.project-pagination').textContent,/Page 2 sur 2/);
 }finally{x.close()}
});

test('an existing application shows follow-up instead of another apply button',async()=>{
 const x=await boot({'/api/session':{id:2,name:'Artisan',role:'professional',csrf:'abc'},'/api/my-applications':{items:[{id:12,project_id:8,status:'pending',title:'Projet fictif',town:'Toulouse',trade:'plomberie'}]},'/api/v4/projects/8':{id:8,title:'Projet fictif',description:'Travaux fictifs',town:'Toulouse',trades:['plomberie'],status:'open',photos:[]}});try{
  await x.w.projectDetail({id:8});assert.ok([...x.w.document.querySelectorAll('button')].some(b=>b.textContent==='Suivre ma candidature'));assert.ok(![...x.w.document.querySelectorAll('button')].some(b=>b.textContent==='Proposer ma candidature'));
 }finally{x.close()}
});

test('a notification can be marked read individually with CSRF',async()=>{
 const x=await boot({'/api/notifications':{unread:1,items:[{id:7,message:'Une candidature fictive',created_at:'2026-10-16T12:00:00Z',read_at:null}]},'POST /api/notifications/7/read':{ok:true}});try{
  const host=x.w.document.createElement('div');x.w.document.body.append(host);await x.w.renderNotifications(host);[...host.querySelectorAll('button')].find(b=>b.textContent==='Marquer comme lu').click();await tick();
  assert.ok(x.calls.some(c=>c.url==='/api/notifications/7/read'&&c.headers['x-ucp-csrf']==='test-token'));
 }finally{x.close()}
});

test('presentation controls remain absent on a normal server',async()=>{
 const x=await boot();try{assert.equal(x.w.document.querySelector('.demo-toolbar'),null);assert.ok(!x.calls.some(c=>c.url.startsWith('/api/presentation/')))}finally{x.close()}
});

test('targeted conversations select the matching participant thread',async()=>{
 const x=await boot({'/api/conversations':{items:[{application_id:11,title:'Premier projet',peer:'Atelier A'},{application_id:12,title:'Second projet',peer:'Atelier B'}]},'/api/conversations/12/messages':{items:[]}});try{
  await x.w.openConversation(12);assert.match(x.w.document.querySelector('.chat h3').textContent,/Atelier B/);assert.equal(x.w.document.querySelector('.conversation-list button[aria-pressed=true]').textContent,'Second projet · Atelier B');
 }finally{x.close()}
});

test('legacy projects retain their primary trade when the multi-trade array is empty',async()=>{
 const x=await boot({'/api/projects':{items:[{id:1,title:'Projet ancien fictif',town:'Toulouse',trade:'plomberie',trades_json:'[]',status:'open'}]}});try{
  assert.match(x.w.document.querySelector('.project-place').textContent,/Plomberie/);const trade=x.w.document.querySelector('[aria-label="Filtrer par métier"]');trade.value='plomberie';trade.dispatchEvent(new x.w.Event('change'));assert.equal(x.w.document.querySelectorAll('.project-card').length,1);
 }finally{x.close()}
});

test('initial loading state is released after successful initialization and catalog failure',async()=>{
 const ready=await boot();try{assert.equal(ready.w.document.body.classList.contains('initializing'),false);assert.equal(ready.w.document.querySelector('#main').getAttribute('aria-busy'),'false')}finally{ready.close()}
 const failed=await boot({'/api/catalog':()=>{throw Error('network interrupted')}});try{assert.equal(failed.w.document.body.classList.contains('initializing'),false);assert.match(failed.w.document.querySelector('#alert').textContent,/serveur ne répond pas/)}finally{failed.close()}
});
