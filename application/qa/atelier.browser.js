async page => {
 const checks=[],errors=[];const check=(name,value)=>{if(!value)throw Error(name);checks.push(name)};
 page.on('pageerror',e=>errors.push(e.message));
 await page.bringToFront();await page.goto('http://127.0.0.1:8876/');
 await page.getByRole('button',{name:'Espace demandeur',exact:true}).click();
 await page.getByRole('button',{name:'Atelier 3D',exact:true}).click();
 check('no Three.js downloaded before activation',await page.evaluate(()=>!performance.getEntriesByType('resource').some(r=>r.name.includes('three.module'))));
 const before=await page.evaluate(async()=>{const r=await fetch('/api/v4/drafts');return (await r.json()).items.length});
 await page.getByRole('button',{name:'Explorer en 3D',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.atelier-fallback')?.hidden===true);
 check('WebGL canvas rendered',await page.locator('canvas').count()===1);
 const stats=await page.evaluate(()=>atelierController.stats());check('real geometry rendered',stats.triangles>0&&stats.calls>0);
 await page.getByRole('button',{name:'Horizon',exact:true}).click();check('palette selection exposed',await page.getByRole('button',{name:'Horizon',exact:true}).getAttribute('aria-pressed')==='true');
 await page.getByRole('button',{name:'Voir avant rénovation',exact:true}).click();check('before state exposed',await page.getByRole('button',{name:'Voir après rénovation',exact:true}).getAttribute('aria-pressed')==='true');
 await page.getByRole('button',{name:'↷ Tourner à droite',exact:true}).click();await page.waitForFunction(()=>!atelierController.stats().animating);check('animation stops when idle',await page.evaluate(()=>!atelierController.stats().animating));
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Recentrer',exact:true}).click();check('reduced motion skips tween',await page.evaluate(()=>!atelierController.stats().animating));
 for(const width of[320,390,768,1440]){await page.setViewportSize({width,height:950});await page.waitForTimeout(100);check('no overflow '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'C:/Users/a/Documents/GitHub/UnCoupdePouce/application/docs/qa/atelier-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Préparer ce projet →',exact:true}).click();
 check('draft prefilled with chosen ambiance',await page.locator('.wizard [name=description]').inputValue().then(v=>v.includes('horizon')));
 check('canvas disposed on wizard entry',await page.locator('canvas').count()===0&&await page.evaluate(()=>atelierController===null));
 check('nothing saved or published automatically',before===await page.evaluate(async()=>{const r=await fetch('/api/v4/drafts');return (await r.json()).items.length}));
 // Discard only this unsaved synthetic example, never a server-side draft.
 await page.evaluate(()=>{currentDraft=null});await page.reload();await page.getByRole('button',{name:'Espace artisan',exact:true}).click();await page.getByRole('button',{name:'Atelier 3D',exact:true}).click();
 check('artisan has appropriate next action',await page.getByRole('button',{name:'Trouver des projets →',exact:true}).isVisible()&&await page.getByRole('button',{name:'Préparer ce projet →',exact:true}).count()===0);
 await page.evaluate(()=>{window.originalGetContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.startsWith('webgl'))return null;return window.originalGetContext.call(this,type,...args)}});
 await page.getByRole('button',{name:'Explorer en 3D',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.atelier-status')?.textContent.includes('3D indisponible'));
 check('no WebGL fallback remains usable',await page.getByRole('button',{name:'Horizon',exact:true}).isEnabled()&&await page.locator('canvas').count()===0);
 await page.evaluate(()=>{HTMLCanvasElement.prototype.getContext=window.originalGetContext});
 await page.getByRole('button',{name:'Réessayer la 3D',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.atelier-fallback')?.hidden===true);
 check('WebGL retry succeeds',await page.locator('canvas').count()===1);
 await page.getByRole('button',{name:'Trouver des projets →',exact:true}).click();check('canvas disposed on navigation',await page.locator('canvas').count()===0);
 check('no uncaught JavaScript errors',errors.length===0);
 await page.emulateMedia({reducedMotion:'no-preference'});return {passed:checks.length,checks,stats,errors};
}
