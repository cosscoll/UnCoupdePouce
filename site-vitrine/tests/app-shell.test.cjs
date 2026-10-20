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


function runBriefApp(list,environment={}){
  const listeners={};
  const links=[];
  const makeControl=(id,value)=>({value,textContent:'',addEventListener(type,callback){listeners[id+':'+type]=callback;}});
  const elements={
    'brief-form':makeControl('brief-form'),
    'project-type':makeControl('project-type','peinture'),
    'project-state':makeControl('project-state','idee'),
    'project-timing':makeControl('project-timing','flexible'),
    'brief-status':makeControl('brief-status'),
    'brief-title':makeControl('brief-title'),
    'brief-trade':makeControl('brief-trade'),
    'brief-state':makeControl('brief-state'),
    'brief-timing':makeControl('brief-timing'),
    'brief-checklist':list,
    'copy-brief':makeControl('copy-brief'),
    'download-brief':makeControl('download-brief')
  };
  const document={
    documentElement:{classList:{remove(){}}},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    getElementById(id){return elements[id]||null;},
    createElement(tag){
      if(tag==='a'){
        const link={
          click(){if(environment.onClick)environment.onClick();},
          remove(){if(environment.onRemove)environment.onRemove();}
        };
        links.push(link);
        return link;
      }
      if(tag==='textarea'){
        return {
          value:'',
          style:{},
          setAttribute(){},
          select(){if(environment.onSelect)environment.onSelect();},
          remove(){if(environment.onTextareaRemove)environment.onTextareaRemove();}
        };
      }
      return {textContent:''};
    },
    addEventListener(){},
    execCommand:environment.execCommand,
    body:{append(link){if(environment.onAppend)environment.onAppend(link);}}
  };
  const window={UCPBrief:{
    create(){return {title:'Titre',trade:'Métier',state:'État',timing:'Horizon',checklist:['Un','Deux','Trois']};},
    toText(){return 'Brief';}
  }};
  vm.runInNewContext(source,{
    document,
    window,
    navigator:environment.navigator||{},
    Blob:environment.Blob,
    URL:environment.URL,
    setTimeout:environment.setTimeout||(()=>{})
  });
  return {elements,listeners,links};
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

test('le telechargement indisponible propose la copie sans interrompre le parcours',()=>{
  const list={replaceChildren(){},append(){}};
  const {elements,listeners}=runBriefApp(list);
  assert.doesNotThrow(()=>listeners['download-brief:click']());
  assert.equal(elements['brief-status'].textContent,'Le téléchargement n’est pas disponible ici. Utilisez « Copier le brief » pour conserver votre brief.');
});

test('le telechargement cree le fichier puis libere son URL objet',()=>{
  let clicks=0;
  const revoked=[];
  const list={replaceChildren(){},append(){}};
  class FakeBlob{}
  const {elements,listeners,links}=runBriefApp(list,{
    Blob:FakeBlob,
    URL:{
      createObjectURL(){return 'blob:ucp-brief';},
      revokeObjectURL(url){revoked.push(url);}
    },
    onClick(){clicks+=1;},
    setTimeout(callback){callback();}
  });
  listeners['download-brief:click']();
  assert.equal(clicks,1);
  assert.equal(links[0].download,'UCP-mon-exemple-de-brief.txt');
  assert.deepEqual(revoked,['blob:ucp-brief']);
  assert.equal(elements['brief-status'].textContent,'Le téléchargement du brief a été déclenché.');
});


test('un echec apres creation de l URL objet la libere immediatement',()=>{
  const revoked=[];
  const list={replaceChildren(){},append(){}};
  class FakeBlob{}
  const {elements,listeners}=runBriefApp(list,{
    Blob:FakeBlob,
    URL:{
      createObjectURL(){return 'blob:ucp-brief';},
      revokeObjectURL(url){revoked.push(url);}
    },
    onClick(){throw new Error('clic programmatique refuse');}
  });
  assert.doesNotThrow(()=>listeners['download-brief:click']());
  assert.deepEqual(revoked,['blob:ucp-brief']);
  assert.equal(elements['brief-status'].textContent,'Le téléchargement n’est pas disponible ici. Utilisez « Copier le brief » pour conserver votre brief.');
});


test('la copie utilise le repli historique quand Clipboard API est absente',async()=>{
  let selected=0;
  let removed=0;
  const list={replaceChildren(){},append(){}};
  const {elements,listeners}=runBriefApp(list,{
    execCommand(command){return command==='copy';},
    onSelect(){selected+=1;},
    onTextareaRemove(){removed+=1;}
  });
  await listeners['copy-brief:click']();
  assert.equal(selected,1);
  assert.equal(removed,1);
  assert.equal(elements['brief-status'].textContent,'Brief copié dans votre presse-papiers.');
});

test('la copie indisponible conserve le repli vers le telechargement',async()=>{
  const list={replaceChildren(){},append(){}};
  const {elements,listeners}=runBriefApp(list);
  await listeners['copy-brief:click']();
  assert.equal(elements['brief-status'].textContent,'La copie n’est pas disponible ici. Utilisez « Télécharger en .txt » pour conserver votre brief.');
});
