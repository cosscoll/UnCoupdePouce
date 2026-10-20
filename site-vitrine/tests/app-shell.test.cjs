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
