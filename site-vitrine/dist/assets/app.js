(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');
  const toArray=collection=>{
    let from=null;
    try{from=Array.from;}catch{}
    if(typeof from==='function'){
      try{return from.call(Array,collection);}catch{}
    }
    return Array.prototype.slice.call(collection);
  };
  const menu=document.querySelector('.menu-toggle');
  const nav=document.querySelector('#main-nav');
  const closeMenu=()=>{if(!menu||!nav)return;menu.setAttribute('aria-expanded','false');nav.classList.remove('is-open');};
  if(menu&&nav){
    menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('is-open',open);});
    toArray(nav.querySelectorAll('a')).forEach(link=>link.addEventListener('click',closeMenu));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}});
    document.addEventListener('click',event=>{if(!nav.contains(event.target)&&!menu.contains(event.target))closeMenu();});
    let wideViewport=null;
    let matchMedia=null;
    try{matchMedia=window.matchMedia;}catch{}
    if(typeof matchMedia==='function'){
      try{wideViewport=matchMedia.call(window,'(min-width: 761px)');}catch{}
    }
    if(wideViewport){
      let viewportListenerAdded=false;
      let modernViewportListener=null;
      try{modernViewportListener=wideViewport.addEventListener;}catch{}
      if(typeof modernViewportListener==='function'){
        try{modernViewportListener.call(wideViewport,'change',closeMenu);viewportListenerAdded=true;}catch{}
      }
      let legacyViewportListener=null;
      try{legacyViewportListener=wideViewport.addListener;}catch{}
      if(!viewportListenerAdded&&typeof legacyViewportListener==='function'){
        try{legacyViewportListener.call(wideViewport,closeMenu);}catch{}
      }
    }
  }
  const tabs=toArray(document.querySelectorAll('[role="tab"]'));
  function activateTab(tab,focus){
    tabs.forEach(item=>{const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;const panel=document.getElementById(item.getAttribute('aria-controls'));if(panel)panel.hidden=!selected;});
    if(focus)tab.focus();
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>activateTab(tab,false));
    tab.addEventListener('keydown',event=>{
      let target=null;
      if(event.key==='ArrowRight')target=tabs[(index+1)%tabs.length];
      if(event.key==='ArrowLeft')target=tabs[(index+tabs.length-1)%tabs.length];
      if(event.key==='Home')target=tabs[0];
      if(event.key==='End')target=tabs[tabs.length-1];
      if(target){event.preventDefault();activateTab(target,true);}
    });
  });
  const form=document.getElementById('brief-form');
  if(!form||!window.UCPBrief)return;
  const type=document.getElementById('project-type');
  const state=document.getElementById('project-state');
  const timing=document.getElementById('project-timing');
  const status=document.getElementById('brief-status');
  let brief=window.UCPBrief.create(type.value,state.value,timing.value);
  function appendTemporaryNode(node){
    let appended=false;
    let append=null;
    try{append=document.body.append;}catch{}
    if(typeof append==='function'){
      try{append.call(document.body,node);appended=true;}catch{}
    }
    let appendChild=null;
    try{appendChild=document.body.appendChild;}catch{}
    if(!appended&&typeof appendChild==='function'){
      appendChild.call(document.body,node);appended=true;
    }
    if(!appended)throw new Error('DOM append unavailable');
  }
  function update(announce){
    brief=window.UCPBrief.create(type.value,state.value,timing.value);
    for(const key of ['title','trade','state','timing']) document.getElementById('brief-'+key).textContent=brief[key];
    const list=document.getElementById('brief-checklist');
    let cleared=false;
    if(typeof list.replaceChildren==='function'){
      try{list.replaceChildren();cleared=true;}catch{}
    }
    if(!cleared){
      try{list.textContent='';}catch{}
    }
    brief.checklist.forEach(text=>{
      const li=document.createElement('li');li.textContent=text;
      let appended=false;
      if(typeof list.append==='function'){
        try{list.append(li);appended=true;}catch{}
      }
      if(!appended&&typeof list.appendChild==='function'){
        try{list.appendChild(li);}catch{}
      }
    });
    if(announce)status.textContent='Votre exemple est prêt. Vous pouvez le copier ou le télécharger.';
  }
  form.addEventListener('change',()=>{update(false);status.textContent='Exemple mis à jour selon vos choix.';});
  form.addEventListener('submit',event=>{event.preventDefault();update(true);});
  document.getElementById('copy-brief').addEventListener('click',async()=>{
    update(false);
    const text=window.UCPBrief.toText(brief);
    try{
      let clipboard=null;
      if(typeof navigator!=='undefined')clipboard=navigator.clipboard;
      let writeText=null;
      if(clipboard)writeText=clipboard.writeText;
      if(typeof writeText==='function'){
        await writeText.call(clipboard,text);
        status.textContent='Brief copié dans votre presse-papiers.';
        return;
      }
    }catch{}
    let field=null;
    try{
      if(typeof document.execCommand!=='function')throw new Error('clipboard unavailable');
      field=document.createElement('textarea');
      field.value=text;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';
      appendTemporaryNode(field);field.select();
      if(!document.execCommand('copy'))throw new Error('copy rejected');
      status.textContent='Brief copié dans votre presse-papiers.';
    }catch{
      status.textContent='La copie n’est pas disponible ici. Utilisez « Télécharger en .txt » pour conserver votre brief.';
    }finally{
      if(field){
        let fieldRemoved=false;
        if(typeof field.remove==='function'){
          try{field.remove();fieldRemoved=true;}catch{}
        }
        if(!fieldRemoved&&field.parentNode&&typeof field.parentNode.removeChild==='function'){
          try{field.parentNode.removeChild(field);}catch{}
        }
      }
    }
  });
  document.getElementById('download-brief').addEventListener('click',()=>{
    update(false);
    let url=null;
    const releaseObjectUrl=()=>{
      if(!url||typeof URL==='undefined')return;
      let revokeObjectUrl=null;
      try{revokeObjectUrl=URL.revokeObjectURL;}catch{}
      if(typeof revokeObjectUrl!=='function')return;
      try{revokeObjectUrl.call(URL,url);}catch{}
    };
    try{
      if(typeof Blob!=='function'||typeof URL==='undefined')throw new Error('download unavailable');
      let createObjectUrl=null;
      try{createObjectUrl=URL.createObjectURL;}catch{}
      if(typeof createObjectUrl!=='function')throw new Error('download unavailable');
      const blob=new Blob(['\uFEFF'+window.UCPBrief.toText(brief)],{type:'text/plain;charset=utf-8'});
      url=createObjectUrl.call(URL,blob);
      const link=document.createElement('a');
      link.href=url;link.download='UCP-mon-exemple-de-brief.txt';appendTemporaryNode(link);link.click();
      let linkRemoved=false;
      if(typeof link.remove==='function'){
        try{link.remove();linkRemoved=true;}catch{}
      }
      if(!linkRemoved&&link.parentNode&&typeof link.parentNode.removeChild==='function'){
        try{link.parentNode.removeChild(link);}catch{}
      }
      if(typeof setTimeout==='function'){
        try{setTimeout(releaseObjectUrl,1000);}catch{releaseObjectUrl();}
      }else releaseObjectUrl();
      status.textContent='Le téléchargement du brief a été déclenché.';
    }catch{
      releaseObjectUrl();
      status.textContent='Le téléchargement n’est pas disponible ici. Utilisez « Copier le brief » pour conserver votre brief.';
    }
  });
  update(false);
})();
