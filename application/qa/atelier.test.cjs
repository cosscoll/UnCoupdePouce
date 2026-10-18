const {test}=require('node:test');
const assert=require('node:assert/strict');
const config=()=>import('../backend/static/atelier.mjs');
test('every ambiance prepares an independent unpublished fictional draft',async()=>{
 const {ambiances,prepareProject}=await config();
 for(const key of Object.keys(ambiances)){const d=prepareProject(key);assert.match(d.description,new RegExp(ambiances[key].label.toLowerCase()));assert.equal(d.town,'');assert.equal(d.id,undefined);assert.equal(d.version,0);assert.deepEqual(d.trades,['peinture']);assert.deepEqual(d.photos,[]);assert.ok(d.description.length>=20);d.trades.push('test');assert.deepEqual(prepareProject(key).trades,['peinture'])}
});
test('unknown or inherited ambiance names are rejected',async()=>{
 const {prepareProject}=await config();for(const key of['unknown','__proto__','constructor','toString'])assert.throws(()=>prepareProject(key));
});
test('module import is side-effect free outside the browser',async()=>{
 const module=await config();assert.equal(typeof module.mountAtelier,'function');assert.equal(Object.keys(module.ambiances).length,3);
});
