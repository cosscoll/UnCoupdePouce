(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');
  const menu=document.querySelector('.menu-toggle');
  const nav=document.querySelector('#main-nav');
  const closeMenu=()=>{if(!menu||!nav)return;menu.setAttribute('aria-expanded','false');nav.classList.remove('is-open');};
  if(menu&&nav){
    menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('is-open',open);});
    nav.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}});
    document.addEventListener('click',event=>{if(!nav.contains(event.target)&&!menu.contains(event.target))closeMenu();});
    window.matchMedia('(min-width: 761px)').addEventListener('change',closeMenu);
  }
  const tabs=Array.from(document.querySelectorAll('[role="tab"]'));
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
  function update(announce){
    brief=window.UCPBrief.create(type.value,state.value,timing.value);
    for(const key of ['title','trade','state','timing']) document.getElementById('brief-'+key).textContent=brief[key];
    const list=document.getElementById('brief-checklist');list.replaceChildren();
    brief.checklist.forEach(text=>{const li=document.createElement('li');li.textContent=text;list.append(li);});
    if(announce)status.textContent='Votre exemple est prêt. Vous pouvez le copier ou le télécharger.';
  }
  form.addEventListener('change',()=>{update(false);status.textContent='Exemple mis à jour selon vos choix.';});
  form.addEventListener('submit',event=>{event.preventDefault();update(true);});
  document.getElementById('copy-brief').addEventListener('click',async()=>{
    update(false);
    try{if(!navigator.clipboard||!navigator.clipboard.writeText)throw new Error('clipboard unavailable');await navigator.clipboard.writeText(window.UCPBrief.toText(brief));status.textContent='Brief copié dans votre presse-papiers.';}
    catch{status.textContent='La copie n’est pas disponible ici. Utilisez « Télécharger en .txt » pour conserver votre brief.';}
  });
  document.getElementById('download-brief').addEventListener('click',()=>{
    update(false);
    const blob=new Blob(['\uFEFF'+window.UCPBrief.toText(brief)],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='UCP-mon-exemple-de-brief.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Le téléchargement du brief a été déclenché.';
  });
  update(false);
})();
