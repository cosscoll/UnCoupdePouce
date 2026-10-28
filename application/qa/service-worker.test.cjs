/* Worker logic simulation: privacy contract, not an installed-device test. */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../backend/static/ucp-sw.js'),'utf8');
function worker(fetcher){
 const handlers={},calls=[];
 const self={location:{origin:'https://ucp.example'},addEventListener:(k,f)=>handlers[k]=f,skipWaiting:async()=>{},clients:{claim:async()=>{}}};
 const context={self,URL,Response,fetch:(...args)=>{calls.push(args);return fetcher(...args)}};
 for(const key of ['caches','indexedDB'])Object.defineProperty(context,key,{get(){throw Error('Private data must never enter '+key)}});
 vm.runInNewContext(code,context);return {handlers,calls};
}
function request(w,overrides={}){
 let result;const req={url:'https://ucp.example/',method:'GET',mode:'navigate',...overrides};
 w.handlers.fetch({request:req,respondWith(p){result=p}});return result;
}
test('worker neither intercepts API requests nor registers background work',()=>{
 const w=worker(()=>{throw Error('Unexpected fetch')});
 for(const overrides of [{url:'https://ucp.example/api/conversations/4/messages'},{url:'https://ucp.example/assets/app.js'},
   {url:'https://external.example/'},{method:'POST'},{mode:'cors'}])assert.equal(request(w,overrides),undefined);
 assert.deepEqual(Object.keys(w.handlers).sort(),['activate','fetch','install']);assert.equal(w.calls.length,0);
});
test('root navigation reaches server with original credentials, no cache and preserves 401/403',async()=>{
 for(const status of [200,401,403,500]){
  const w=worker(async()=>new Response('server-only',{status}));const response=await request(w);
  assert.equal(response.status,status);assert.equal(await response.text(),'server-only');
  assert.equal(w.calls[0][1].cache,'no-store');assert.equal(w.calls[0][0].url,'https://ucp.example/');
 }
});
test('network failure returns only generic offline HTML, never private URL or cached content',async()=>{
 const w=worker(async()=>{throw Error('offline')});const response=await request(w,{url:'https://ucp.example/?private=fictional-secret'});
 assert.equal(response.status,503);assert.equal(response.headers.get('Cache-Control'),'no-store');
 const html=await response.text();assert.match(html,/connexion est interrompue/);assert.doesNotMatch(html,/fictional-secret|<script|<style/);
 assert.match(response.headers.get('Content-Security-Policy'),/default-src 'none'/);
});
