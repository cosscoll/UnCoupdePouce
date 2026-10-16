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
 const defaults={'/api/catalog':{items:JSON.parse(fs.readFileSync(path.join(root,'../taxonomy.json'),'utf8'))},'/api/session':{id:1,name:'Camille',role:'requester',csrf:'test-token'},'/api/projects':{items:[]},'/api/v4/drafts':{items:[]},'/api/my-profile':{profile:null}};
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
