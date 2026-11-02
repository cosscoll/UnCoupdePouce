const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const help=require('../backend/static/guided-help.js');
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../backend/taxonomy.json'),'utf8'));

test('guided suggestions support mixed trades but only return actual active catalog entries',()=>{
 const result=help.suggestTrades('Une fuite sous l’évier et des prises à remplacer',catalog);
 assert.ok(result.some(t=>t.id==='plomberie'));assert.ok(result.some(t=>t.id==='electricite'));
 const restricted=catalog.map(t=>t.id==='plomberie'?{...t,active:false}:t);
 assert.ok(!help.suggestTrades('Une fuite sous évier',restricted).some(t=>t.id==='plomberie'));
 assert.deepEqual(help.suggestTrades('Un besoin sans correspondance explicite',[]),[]);
});

test('contact warning inspects Unicode compatibility forms without rejecting ordinary dimensions',()=>{
 for(const text of ['test＠ucp.test','０６ １２ ３４ ５６ ７８','https://ucp.test','14 rue des Roses'])assert.equal(help.hasContact(text),true);
 assert.equal(help.hasContact('Une pièce de 12 m² et une fenêtre de 120 × 80 cm à Toulouse'),false);
});

test('proposal uses only supplied facts and never invents budget, photos or a publication',()=>{
 const data={need:'Remplacer un évier et réparer une fuite dans une cuisine.',town:'Toulouse',trades:['plomberie'],timing:'month'};
 const p=help.proposal(data);assert.equal(p.description,data.need);assert.equal(p.town,data.town);assert.deepEqual(p.trades,data.trades);
 assert.equal(p.budget_min,null);assert.equal(p.budget_max,null);assert.deepEqual(p.photos,[]);assert.equal(p.id,undefined);assert.equal(p.version,0);
 p.trades.push('electricite');assert.deepEqual(data.trades,['plomberie']);
 assert.ok(help.proposal({...data,need:'Oui. Je veux remplacer cet évier.'}).title.length>=5);
});
