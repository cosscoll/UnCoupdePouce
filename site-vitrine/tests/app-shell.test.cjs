const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../dist/assets/app.js'),'utf8');

function runApp(matchMedia,linkCollection=[],options={}){
  const menu={
    addEventListener(){},
    getAttribute(){return 'false';},
    setAttribute(){},
    focus(){},
    contains(){return false;}
  };
  const nav={
    classList:{remove(){},toggle(){}},
    querySelectorAll(){return linkCollection;},
    contains(){return false;}
  };
  const document={
    documentElement:{classList:{remove(){}}},
    querySelector(selector){return selector==='.menu-toggle'?menu:selector==='#main-nav'?nav:null;},
    querySelectorAll(){return options.tabCollection||[];},
    getElementById(){return null;},
    addEventListener(){}
  };
  const window={};
  if(options.matchMediaGetterThrows){
    Object.defineProperty(window,'matchMedia',{get(){throw new Error('getter matchMedia refuse');}});
  }else if(matchMedia)window.matchMedia=matchMedia;
  vm.runInNewContext(source,{document,window,Array:options.Array||Array});
}

test('le menu utilise le repli MediaQueryList.addListener sans interrompre le script',()=>{
  let listener=null;
  assert.doesNotThrow(()=>runApp(()=>({addListener(callback){listener=callback;}})));
  assert.equal(typeof listener,'function');
});

test('le menu accepte une collection de liens legacy sans forEach',()=>{
  let clickListener=null;
  const link={addEventListener(name,callback){if(name==='click')clickListener=callback;}};
  const legacyLinks={0:link,length:1};
  assert.doesNotThrow(()=>runApp(undefined,legacyLinks));
  assert.equal(typeof clickListener,'function');
});

test('le menu accepte une collection legacy sans Array.from',()=>{
  let clickListener=null;
  const link={addEventListener(name,callback){if(name==='click')clickListener=callback;}};
  const legacyLinks={0:link,length:1};
  function LegacyArray(){}
  LegacyArray.prototype=Array.prototype;
  assert.doesNotThrow(()=>runApp(undefined,legacyLinks,{Array:LegacyArray}));
  assert.equal(typeof clickListener,'function');
});

test('le menu replie sur slice si Array.from rejette la collection DOM',()=>{
  let clickListener=null;
  const link={addEventListener(name,callback){if(name==='click')clickListener=callback;}};
  const legacyLinks={0:link,length:1};
  function RejectingArray(){}
  RejectingArray.prototype=Array.prototype;
  RejectingArray.from=()=>{throw new Error('collection DOM refusee');};
  assert.doesNotThrow(()=>runApp(undefined,legacyLinks,{Array:RejectingArray}));
  assert.equal(typeof clickListener,'function');
});

test('les onglets restent lies sans Array.from',()=>{
  let registrations=0;
  const legacyTabs={
    0:{addEventListener(){registrations+=1;}},
    1:{addEventListener(){registrations+=1;}},
    length:2
  };
  function LegacyArray(){}
  LegacyArray.prototype=Array.prototype;
  assert.doesNotThrow(()=>runApp(undefined,[],{Array:LegacyArray,tabCollection:legacyTabs}));
  assert.equal(registrations,4);
});

test('les onglets replient sur slice si le getter Array.from echoue',()=>{
  let registrations=0;
  const legacyTabs={
    0:{addEventListener(){registrations+=1;}},
    1:{addEventListener(){registrations+=1;}},
    length:2
  };
  function GetterRejectingArray(){}
  GetterRejectingArray.prototype=Array.prototype;
  Object.defineProperty(GetterRejectingArray,'from',{get(){throw new Error('getter Array.from refuse');}});
  assert.doesNotThrow(()=>runApp(undefined,[],{Array:GetterRejectingArray,tabCollection:legacyTabs}));
  assert.equal(registrations,4);
});

test('le menu lie toujours chaque lien d une collection moderne',()=>{
  let registrations=0;
  const links=[
    {addEventListener(name){if(name==='click')registrations+=1;}},
    {addEventListener(name){if(name==='click')registrations+=1;}}
  ];
  assert.doesNotThrow(()=>runApp(undefined,links));
  assert.equal(registrations,2);
});

test('le menu conserve l API MediaQueryList moderne',()=>{
  let eventName=null;
  let listener=null;
  runApp(()=>({addEventListener(name,callback){eventName=name;listener=callback;}}));
  assert.equal(eventName,'change');
  assert.equal(typeof listener,'function');
});

test('matchMedia conserve window comme receveur',()=>{
  let receiver=null;
  const matchMedia=function(){receiver=this;return {addListener(){}};};
  runApp(matchMedia);
  assert.equal(receiver.matchMedia,matchMedia);
});

test('l absence de matchMedia ne bloque pas le reste du script',()=>{
  assert.doesNotThrow(()=>runApp());
});

test('un getter window.matchMedia en erreur n interrompt pas le script',()=>{
  assert.doesNotThrow(()=>runApp(undefined,[],{matchMediaGetterThrows:true}));
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
          click(){if(environment.onClick)environment.onClick();}
        };
        if(environment.linkRemove!==false){
          link.remove=()=>{
            if(environment.linkRemoveThrows)throw new Error('remove indisponible');
            if(environment.onRemove)environment.onRemove();
          };
        }
        links.push(link);
        return link;
      }
      if(tag==='textarea'){
        const field={
          value:'',
          style:{},
          setAttribute(){},
          select(){if(environment.onSelect)environment.onSelect();}
        };
        if(environment.textareaRemove!==false){
          field.remove=()=>{
            if(environment.textareaRemoveThrows)throw new Error('remove indisponible');
            if(environment.onTextareaRemove)environment.onTextareaRemove();
          };
        }
        return field;
      }
      return {textContent:''};
    },
    addEventListener(){},
    execCommand:environment.execCommand,
    body:{}
  };
  const attachToBody=node=>{
    node.parentNode=environment.legacyRemoveChild===false
      ?{}
      :{removeChild(child){if(environment.onLegacyRemove)environment.onLegacyRemove(child);}};
    if(environment.onAppend)environment.onAppend(node);
  };
  if(environment.bodyAppend!==false){
    document.body.append=node=>{
      if(environment.bodyAppendThrows)throw new Error('append indisponible');
      attachToBody(node);
    };
  }
  if(environment.bodyAppendChild!==false)document.body.appendChild=attachToBody;
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

test('le brief ajoute les conseils sans Element.append',()=>{
  const children=[];
  const list={
    replaceChildren(){children.length=0;},
    appendChild(node){children.push(node);}
  };
  assert.doesNotThrow(()=>runBriefApp(list));
  assert.deepEqual(children.map(node=>node.textContent),['Un','Deux','Trois']);
});

test('le brief replie sur appendChild si Element.append echoue',()=>{
  const children=[];
  let appendAttempts=0;
  const list={
    replaceChildren(){children.length=0;},
    append(){appendAttempts+=1;throw new Error('append indisponible');},
    appendChild(node){children.push(node);}
  };
  assert.doesNotThrow(()=>runBriefApp(list));
  assert.equal(appendAttempts,3);
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

test('le telechargement replie sur appendChild si body.append echoue',()=>{
  let clicks=0;
  let inserted=0;
  const revoked=[];
  const list={replaceChildren(){},append(){}};
  class FakeBlob{}
  const {elements,listeners}=runBriefApp(list,{
    Blob:FakeBlob,
    URL:{
      createObjectURL(){return 'blob:ucp-brief';},
      revokeObjectURL(url){revoked.push(url);}
    },
    bodyAppendThrows:true,
    onAppend(){inserted+=1;},
    onClick(){clicks+=1;},
    setTimeout(callback){callback();}
  });
  assert.doesNotThrow(()=>listeners['download-brief:click']());
  assert.equal(inserted,1);
  assert.equal(clicks,1);
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

test('la copie insere le champ sans document.body.append',async()=>{
  let inserted=0;
  const list={replaceChildren(){},append(){}};
  const {elements,listeners}=runBriefApp(list,{
    bodyAppend:false,
    execCommand(command){return command==='copy';},
    onAppend(){inserted+=1;}
  });
  await assert.doesNotReject(()=>listeners['copy-brief:click']());
  assert.equal(inserted,1);
  assert.equal(elements['brief-status'].textContent,'Brief copié dans votre presse-papiers.');
});

test('la copie nettoie le champ sans Element.remove',async()=>{
  let legacyRemovals=0;
  const list={replaceChildren(){},append(){}};
  const {elements,listeners}=runBriefApp(list,{
    execCommand(command){return command==='copy';},
    textareaRemove:false,
    onLegacyRemove(){legacyRemovals+=1;}
  });
  await listeners['copy-brief:click']();
  assert.equal(legacyRemovals,1);
  assert.equal(elements['brief-status'].textContent,'Brief copié dans votre presse-papiers.');
});

test('la copie utilise removeChild si textarea.remove echoue',async()=>{
  let legacyRemovals=0;
  const list={replaceChildren(){},append(){}};
  const {elements,listeners}=runBriefApp(list,{
    execCommand(command){return command==='copy';},
    textareaRemoveThrows:true,
    onLegacyRemove(){legacyRemovals+=1;}
  });
  await assert.doesNotReject(()=>listeners['copy-brief:click']());
  assert.equal(legacyRemovals,1);
  assert.equal(elements['brief-status'].textContent,'Brief copié dans votre presse-papiers.');
});

test('une erreur removeChild ne transforme pas une copie reussie en echec',async()=>{
  const list={replaceChildren(){},append(){}};
  const {elements,listeners}=runBriefApp(list,{
    execCommand(command){return command==='copy';},
    textareaRemove:false,
    onLegacyRemove(){throw new Error('removeChild refuse');}
  });
  await assert.doesNotReject(()=>listeners['copy-brief:click']());
  assert.equal(elements['brief-status'].textContent,'Brief copié dans votre presse-papiers.');
});

test('l absence totale de removeChild ne rejette pas la copie',async()=>{
  const list={replaceChildren(){},append(){}};
  const {elements,listeners}=runBriefApp(list,{
    execCommand(command){return command==='copy';},
    textareaRemove:false,
    legacyRemoveChild:false
  });
  await assert.doesNotReject(()=>listeners['copy-brief:click']());
  assert.equal(elements['brief-status'].textContent,'Brief copié dans votre presse-papiers.');
});

test('la copie indisponible conserve le repli vers le telechargement',async()=>{
  const list={replaceChildren(){},append(){}};
  const {elements,listeners}=runBriefApp(list);
  await listeners['copy-brief:click']();
  assert.equal(elements['brief-status'].textContent,'La copie n’est pas disponible ici. Utilisez « Télécharger en .txt » pour conserver votre brief.');
});


test('un rejet de Clipboard API bascule vers le repli historique',async()=>{
  let modernAttempts=0;
  let legacyAttempts=0;
  let removed=0;
  const list={replaceChildren(){},append(){}};
  const {elements,listeners}=runBriefApp(list,{
    navigator:{clipboard:{writeText(){modernAttempts+=1;return Promise.reject(new Error('permission refusee'));}}},
    execCommand(command){legacyAttempts+=1;return command==='copy';},
    onTextareaRemove(){removed+=1;}
  });
  await listeners['copy-brief:click']();
  assert.equal(modernAttempts,1);
  assert.equal(legacyAttempts,1);
  assert.equal(removed,1);
  assert.equal(elements['brief-status'].textContent,'Brief copié dans votre presse-papiers.');
});


test('le telechargement nettoie le lien sans Element.remove',()=>{
  let legacyRemovals=0;
  const list={replaceChildren(){},append(){}};
  class FakeBlob{}
  const {elements,listeners,links}=runBriefApp(list,{
    Blob:FakeBlob,
    URL:{createObjectURL(){return 'blob:ucp-brief';},revokeObjectURL(){}},
    linkRemove:false,
    onLegacyRemove(node){legacyRemovals+=1;assert.equal(node,links[0]);}
  });
  listeners['download-brief:click']();
  assert.equal(legacyRemovals,1);
  assert.equal(elements['brief-status'].textContent,'Le téléchargement du brief a été déclenché.');
});


test('le telechargement utilise removeChild si Element.remove echoue',()=>{
  let legacyRemovals=0;
  const list={replaceChildren(){},append(){}};
  class FakeBlob{}
  const {elements,listeners}=runBriefApp(list,{
    Blob:FakeBlob,
    URL:{createObjectURL(){return 'blob:ucp-brief';},revokeObjectURL(){}},
    linkRemoveThrows:true,
    onLegacyRemove(){legacyRemovals+=1;}
  });
  assert.doesNotThrow(()=>listeners['download-brief:click']());
  assert.equal(legacyRemovals,1);
  assert.equal(elements['brief-status'].textContent,'Le téléchargement du brief a été déclenché.');
});


test('une erreur de nettoyage ne transforme pas un telechargement declenche en echec',()=>{
  const revoked=[];
  const list={replaceChildren(){},append(){}};
  class FakeBlob{}
  const {elements,listeners}=runBriefApp(list,{
    Blob:FakeBlob,
    URL:{
      createObjectURL(){return 'blob:ucp-brief';},
      revokeObjectURL(url){revoked.push(url);}
    },
    linkRemoveThrows:true,
    onLegacyRemove(){throw new Error('removeChild refuse');},
    setTimeout(callback){callback();}
  });
  assert.doesNotThrow(()=>listeners['download-brief:click']());
  assert.deepEqual(revoked,['blob:ucp-brief']);
  assert.equal(elements['brief-status'].textContent,'Le téléchargement du brief a été déclenché.');
});


test('l absence des API de nettoyage ne masque pas un telechargement declenche',()=>{
  const revoked=[];
  const list={replaceChildren(){},append(){}};
  class FakeBlob{}
  const {elements,listeners}=runBriefApp(list,{
    Blob:FakeBlob,
    URL:{
      createObjectURL(){return 'blob:ucp-brief';},
      revokeObjectURL(url){revoked.push(url);}
    },
    linkRemove:false,
    legacyRemoveChild:false,
    setTimeout(callback){callback();}
  });
  assert.doesNotThrow(()=>listeners['download-brief:click']());
  assert.deepEqual(revoked,['blob:ucp-brief']);
  assert.equal(elements['brief-status'].textContent,'Le téléchargement du brief a été déclenché.');
});


test('une erreur de revocation URL ne masque pas un telechargement declenche',()=>{
  const list={replaceChildren(){},append(){}};
  class FakeBlob{}
  const {elements,listeners}=runBriefApp(list,{
    Blob:FakeBlob,
    URL:{
      createObjectURL(){return 'blob:ucp-brief';},
      revokeObjectURL(){throw new Error('revocation refusee');}
    },
    setTimeout(callback){callback();}
  });
  assert.doesNotThrow(()=>listeners['download-brief:click']());
  assert.equal(elements['brief-status'].textContent,'Le téléchargement du brief a été déclenché.');
});


test('l absence de revokeObjectURL ne masque pas un telechargement declenche',()=>{
  const list={replaceChildren(){},append(){}};
  class FakeBlob{}
  const {elements,listeners}=runBriefApp(list,{
    Blob:FakeBlob,
    URL:{createObjectURL(){return 'blob:ucp-brief';}},
    setTimeout(callback){callback();}
  });
  assert.doesNotThrow(()=>listeners['download-brief:click']());
  assert.equal(elements['brief-status'].textContent,'Le téléchargement du brief a été déclenché.');
});


test('une revocation en erreur ne casse pas le repli d un telechargement echoue',()=>{
  let revokeAttempts=0;
  const list={replaceChildren(){},append(){}};
  class FakeBlob{}
  const {elements,listeners}=runBriefApp(list,{
    Blob:FakeBlob,
    URL:{
      createObjectURL(){return 'blob:ucp-brief';},
      revokeObjectURL(){revokeAttempts+=1;throw new Error('revocation refusee');}
    },
    onClick(){throw new Error('clic refuse');}
  });
  assert.doesNotThrow(()=>listeners['download-brief:click']());
  assert.equal(revokeAttempts,1);
  assert.equal(elements['brief-status'].textContent,'Le téléchargement n’est pas disponible ici. Utilisez « Copier le brief » pour conserver votre brief.');
});


test('un echec de temporisation libere l URL sans masquer le telechargement',()=>{
  const revoked=[];
  const list={replaceChildren(){},append(){}};
  class FakeBlob{}
  const {elements,listeners}=runBriefApp(list,{
    Blob:FakeBlob,
    URL:{
      createObjectURL(){return 'blob:ucp-brief';},
      revokeObjectURL(url){revoked.push(url);}
    },
    setTimeout(){throw new Error('temporisation refusee');}
  });
  assert.doesNotThrow(()=>listeners['download-brief:click']());
  assert.deepEqual(revoked,['blob:ucp-brief']);
  assert.equal(elements['brief-status'].textContent,'Le téléchargement du brief a été déclenché.');
});


test('une erreur appendChild ne bloque pas la generation du brief',()=>{
  const list={
    replaceChildren(){},
    append(){throw new Error('append refuse');},
    appendChild(){throw new Error('appendChild refuse');}
  };
  assert.doesNotThrow(()=>runBriefApp(list));
});


test('une erreur replaceChildren utilise le repli textContent',()=>{
  const children=[{textContent:'Ancien conseil'}];
  let clears=0;
  const list={
    replaceChildren(){throw new Error('replaceChildren refuse');},
    append(node){children.push(node);}
  };
  Object.defineProperty(list,'textContent',{set(){clears+=1;children.length=0;}});
  assert.doesNotThrow(()=>runBriefApp(list));
  assert.equal(clears,1);
  assert.deepEqual(children.map(node=>node.textContent),['Un','Deux','Trois']);
});


test('matchMedia utilise addListener si addEventListener echoue',()=>{
  let legacyListener=null;
  assert.doesNotThrow(()=>runApp(()=>({
    addEventListener(){throw new Error('API moderne refusee');},
    addListener(callback){legacyListener=callback;}
  })));
  assert.equal(typeof legacyListener,'function');
});


test('les erreurs des deux API matchMedia n interrompent pas le script',()=>{
  assert.doesNotThrow(()=>runApp(()=>({
    addEventListener(){throw new Error('API moderne refusee');},
    addListener(){throw new Error('API legacy refusee');}
  })));
});


test('une erreur d initialisation matchMedia n interrompt pas le script',()=>{
  assert.doesNotThrow(()=>runApp(()=>{throw new Error('matchMedia refuse');}));
});


test('un getter moderne matchMedia en erreur replie sur addListener',()=>{
  let legacyListener=null;
  const media={
    addListener(callback){legacyListener=callback;}
  };
  Object.defineProperty(media,'addEventListener',{get(){throw new Error('getter moderne refuse');}});
  assert.doesNotThrow(()=>runApp(()=>media));
  assert.equal(typeof legacyListener,'function');
});

test('des getters matchMedia en erreur n interrompent pas le script',()=>{
  const media={};
  Object.defineProperty(media,'addEventListener',{get(){throw new Error('getter moderne refuse');}});
  Object.defineProperty(media,'addListener',{get(){throw new Error('getter legacy refuse');}});
  assert.doesNotThrow(()=>runApp(()=>media));
});
