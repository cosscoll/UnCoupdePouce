const test=require('node:test');
const assert=require('node:assert/strict');
const brief=require('../dist/assets/brief.js');

test('les 36 combinaisons produisent un brief cohérent et exportable',()=>{
  const trades={peinture:'Peinture intérieure','salle-de-bain':'Rénovation de salle de bain · métiers à préciser',menuiserie:'Menuiserie intérieure',electricite:'Électricité · éclairage intérieur'};
  for(const type of Object.keys(trades)) for(const state of ['idee','precis','defini']) for(const timing of ['flexible','trois-mois','six-mois']){
    const value=brief.create(type,state,timing);
    assert.equal(value.trade,trades[type]);assert.equal(value.checklist.length,3);
    const text=brief.toText(value);
    for(const content of [value.title,value.trade,value.state,value.timing,...value.checklist])assert.ok(text.includes(content));
    assert.ok(text.includes('Aucun projet publié'));assert.ok(text.includes('sans IA'));
    assert.ok(!text.includes('undefined'));
  }
});
test('les entrées inconnues et les clés de prototype ne deviennent pas du contenu',()=>{
  for(const value of ['__proto__','constructor','toString','<script>alert(1)</script>',undefined,null]){
    const result=brief.create(value,value,value);
    assert.equal(result.title,'Rafraîchir les murs d’une pièce');
    assert.equal(result.state,'J’explore encore les possibilités');
    assert.ok(!brief.toText(result).includes('<script>'));
  }
});
test('modifier un exemple ne modifie pas les générations suivantes',()=>{
  const first=brief.create('peinture','idee','flexible');first.checklist.push('ALTÉRATION');
  assert.equal(brief.create('peinture','idee','flexible').checklist.length,3);
});
