const {test}=require('node:test');
const assert=require('node:assert/strict');
const ai=require('../backend/static/local-ai.js');
const trades=[{id:'plomberie',label:'Plomberie',active:true},{id:'inconnu',label:'Je ne sais pas',active:true}];
const draft={title:'Rénover ma salle de bains',description:'Je souhaite changer ma douche et réparer une fuite.',
 town:'Toulouse',trades:['plomberie'],timing:'month'};
const search={q:'rénovation',trade:'plomberie',town:'Toulouse',timing:'month',
 published_within:7,budget_from:500,budget_to:4000,sort:'newest'};
test('draft from local LLM is validated against live trades and blocks contact info',()=>{
 assert.equal(ai.validateDraft(draft,trades).title,draft.title);
 assert.equal(ai.validateDraft({...draft,town:'24 rue des Fleurs'},trades),null);
 assert.equal(ai.validateDraft({...draft,description:'Appelez au 06 11 22 33 44 pour un devis'},trades),null);
 assert.equal(ai.validateDraft({...draft,trades:['autre-inconnu']},trades),null);
 assert.equal(ai.validateDraft({...draft,trades:['inconnu','plomberie']},trades),null);
 assert.equal(ai.validateDraft({...draft,description:'Non'},trades),null);
});
test('search from local model is validated and does not execute anything',()=>{
 assert.deepEqual(ai.validateSearch(search,trades),search);
 assert.equal(ai.validateSearch({...search,trade:'inconnu-metier'},trades),null);
 assert.equal(ai.validateSearch({...search,budget_from:5000,budget_to:1000},trades),null);
 assert.equal(ai.validateSearch({...search,town:'13 rue du Test'},trades),null);
 assert.equal(ai.validateSearch({...search,published_within:10},trades),null);
});
test('JSON parser handles fenced model responses without treating them as HTML',()=>{
 assert.deepEqual(ai.parseJSON('```json\n{"title":"Exemple"}\n```'),{title:'Exemple'});
 assert.equal(ai.parseJSON('Ceci est une réponse sans JSON.'),null);
});
