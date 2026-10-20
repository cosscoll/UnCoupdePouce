const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../dist/assets/app.js'),'utf8');

function runApp(matchMedia){
  const menu={
    addEventListener(){},
    getAttribute(){return 'false';},
    setAttribute(){},
    focus(){},
    contains(){return false;}
  };
  const nav={
    classList:{remove(){},toggle(){}},
    querySelectorAll(){return [];},
    contains(){return false;}
  };
  const document={
    documentElement:{classList:{remove(){}}},
    querySelector(selector){return selector==='.menu-toggle'?menu:selector==='#main-nav'?nav:null;},
    querySelectorAll(){return [];},
    getElementById(){return null;},
    addEventListener(){}
  };
  const window={};
  if(matchMedia)window.matchMedia=matchMedia;
  vm.runInNewContext(source,{document,window});
}

test('le menu utilise le repli MediaQueryList.addListener sans interrompre le script',()=>{
  let listener=null;
  assert.doesNotThrow(()=>runApp(()=>({addListener(callback){listener=callback;}})));
  assert.equal(typeof listener,'function');
});

test('le menu conserve l API MediaQueryList moderne',()=>{
  let eventName=null;
  let listener=null;
  runApp(()=>({addEventListener(name,callback){eventName=name;listener=callback;}}));
  assert.equal(eventName,'change');
  assert.equal(typeof listener,'function');
});

test('l absence de matchMedia ne bloque pas le reste du script',()=>{
  assert.doesNotThrow(()=>runApp());
});


function runBriefApp(list){
  const listeners={};
  const makeControl=value=>({value,textContent:'',addEventListener(type,callback){listeners[type]=callback;}});
  const elements={
    'brief-form':makeControl(),
    'project-type':makeControl('peinture'),
    'project-state':makeControl('idee'),
    'project-timing':makeControl('flexible'),
    'brief-status':makeControl(),
    'brief-title':makeControl(),
    'brief-trade':makeControl(),
    'brief-state':makeControl(),
    'brief-timing':makeControl(),
    'brief-checklist':list,
    'copy-brief':makeControl(),
    'download-brief':makeControl()
  };
  const document={
    documentElement:{classList:{remove(){}}},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    getElementById(id){return elements[id]||null;},
    createElement(){return {textContent:''};},
    addEventListener(){},
    body:{append(){}}
  };
  const window={UCPBrief:{
    create(){return {title:'Titre',trade:'Métier',state:'État',timing:'Horizon',checklist:['Un','Deux','Trois']};},
    toText(){return 'Brief';}
  }};
  vm.runInNewContext(source,{document,window});
  return {elements,listeners};
}

test('le brief fonctionne sans Element.replaceChildren',()=>{
  const children=[];
  const list={append(node){children.push(node);}};
  Object.defineProperty(list,'textContent',{set(){children.length=0;}});
  assert.doesNotThrow(()=>runBriefApp(list));
  assert.deepEqual(children.map(node=>node.textContent),['Un','Deux','Trois']);
});


test('le repli efface les anciens conseils avant de regenerer le brief',()=>{
  const children=[{textContent:'Ancien conseil'}];
  let clears=0;
  const list={append(node){children.push(node);}};
  Object.defineProperty(list,'textContent',{set(){clears+=1;children.length=0;}});
  runBriefApp(list);
  assert.equal(clears,1);
  assert.deepEqual(children.map(node=>node.textContent),['Un','Deux','Trois']);
});

test('le chemin moderne continue d utiliser replaceChildren',()=>{
  const children=[{textContent:'Ancien conseil'}];
  let clears=0;
  const list={
    replaceChildren(){clears+=1;children.length=0;},
    append(node){children.push(node);}
  };
  runBriefApp(list);
  assert.equal(clears,1);
  assert.deepEqual(children.map(node=>node.textContent),['Un','Deux','Trois']);
});
