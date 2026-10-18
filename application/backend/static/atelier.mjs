// Procedural illustration: not a survey, quote or technical building plan.
export const ambiances = Object.freeze({
 naturel:{label:'Naturel',wall:0xe9e0d0,floor:0xc69c72,accent:0x71836b},
 argile:{label:'Argile',wall:0xe6c7b8,floor:0xc49c7d,accent:0xad6047},
 horizon:{label:'Horizon',wall:0xdde1ef,floor:0xc4b29a,accent:0x505dc1}
});
export function prepareProject(ambiance){
 if(!Object.hasOwn(ambiances,ambiance))throw new Error('Ambiance inconnue');
 return {title:'Donner une nouvelle vie à mon salon',description:`Je souhaite rénover mon salon : revoir la peinture des murs et le revêtement de sol. L’ambiance ${ambiances[ambiance].label.toLowerCase()} de l’atelier 3D est une inspiration à préciser avec le professionnel. Les dimensions et les matériaux restent à confirmer sur place.`,town:'',trades:['peinture'],timing:'flexible',version:0,photos:[]};
}
export async function mountAtelier(host,{onSelect=()=>{}}={}){
 const T=await import('./vendor/three-r180/three.module.min.js');
 if(!host.isConnected)return null;
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
 renderer.setClearColor(0xf1ece4,1);renderer.outputColorSpace=T.SRGBColorSpace;
 const canvas=renderer.domElement;canvas.setAttribute('aria-label','Salon 3D interactif : faites glisser pour tourner. Les boutons offrent les mêmes commandes.');canvas.setAttribute('role','img');canvas.style.touchAction='pan-y';host.append(canvas);
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-5,5,4,-4,.1,80);
 scene.add(new T.HemisphereLight(0xffffff,0x858098,3));const light=new T.DirectionalLight(0xfff1db,3);light.position.set(3,8,4);scene.add(light);
 const room=new T.Group();scene.add(room);const geometries=new Set(),materials=new Set(),selectable=[];
 const mat=(color,roughness=.8)=>{const m=new T.MeshStandardMaterial({color,roughness});materials.add(m);return m};
 const wall=mat(ambiances.naturel.wall),floor=mat(ambiances.naturel.floor),accent=mat(ambiances.naturel.accent),white=mat(0xfffaf0),wood=mat(0x936e48),dark=mat(0x33384b),leaf=mat(0x54775b);
 function box(w,h,d,x,y,z,m,name){const g=new T.BoxGeometry(w,h,d);geometries.add(g);const o=new T.Mesh(g,m);o.position.set(x,y,z);room.add(o);if(name){o.userData.part=name;selectable.push(o)}return o}
 function ball(r,x,y,z,m,sx=1,sy=1,sz=1){const g=new T.SphereGeometry(r,16,10);geometries.add(g);const o=new T.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);room.add(o);return o}
 box(6,.22,4.8,0,-.15,0,wood);box(5.8,.08,4.6,0,0,0,floor,'sol');
 for(let i=0;i<11;i++)box(.015,.012,4.6,-2.65+i*.53,.046,0,wood);
 box(6,3,.14,0,1.5,-2.4,wall,'murs');box(.14,3,4.8,-3,1.5,0,wall,'murs');
 box(5.9,.12,.09,0,.12,-2.27,white);box(.09,.12,4.6,-2.87,.12,0,white);
 // Window, frame and an abstract picture: no textures or remote models.
 box(.1,1.65,1.9,-2.9,1.85,-.2,white);box(.12,1.4,1.65,-2.82,1.85,-.2,mat(0xb8d6dc));
 box(.14,1.45,.055,-2.73,1.85,-.2,white);box(.14,.055,1.65,-2.73,1.85,-.2,white);
 box(1.2,1,.07,.55,2,-2.27,wood);box(1.06,.86,.08,.55,2,-2.22,white);ball(.22,.6,2.05,-2.16,mat(0xff791d),1,1,.1);
 // Sofa, cushions, rug and coffee table.
 box(2.8,.48,1,0,.45,-1.45,accent);box(2.8,.75,.24,0,.94,-1.88,accent);
 box(.22,.65,1.15,-1.42,.7,-1.44,accent);box(.22,.65,1.15,1.42,.7,-1.44,accent);
 box(1.28,.15,.82,-.68,.76,-1.3,white);box(1.28,.15,.82,.68,.76,-1.3,white);
 const cushion=box(.48,.48,.17,-.95,1.02,-1.6,mat(0xc68455));cushion.rotation.z=.18;
 box(.48,.48,.17,1,1.02,-1.6,white);box(3.4,.025,2,0,.065,.55,mat(0xe5ded2));
 box(1.6,.12,.85,.2,.65,.4,wood);for(const x of[-.4,.8])for(const z of[.1,.7])box(.07,.56,.07,x,.32,z,dark);
 box(.45,.035,.3,0,.74,.4,accent);ball(.12,.65,.81,.4,white,.7,1,.7);
 // Plant and standing lamp.
 box(.46,.48,.46,2.2,.3,-1.7,mat(0xc99070));box(.06,1.05,.06,2.2,1.05,-1.7,wood);
 for(let i=0;i<7;i++){const a=i*2.4;ball(.29,2.2+Math.cos(a)*.24,1.3+i*.085,-1.7+Math.sin(a)*.22,leaf,1,.4,.7)}
 box(.4,.05,.4,-2,.08,-1.6,dark);box(.04,2,.04,-2,1.08,-1.6,dark);box(.65,.32,.65,-2,2.12,-1.6,white);
 let yaw=.68,disposed=false,frame=0,pointer=null,mode='naturel',before=false,tween=null;
 const raycaster=new T.Raycaster(),ndc=new T.Vector2(),target=new T.Vector3(0,1,0);
 function render(now){frame=0;if(disposed||document.hidden)return;if(tween){const t=Math.min(1,(now-tween.start)/260);yaw=tween.from+(tween.to-tween.from)*(1-Math.pow(1-t,3));if(t===1)tween=null}camera.position.set(Math.sin(yaw)*10,7.2,Math.cos(yaw)*10);camera.lookAt(target);renderer.render(scene,camera);if(tween)invalidate()}
 function turn(value){const to=Math.max(-.3,Math.min(1.35,value));if(matchMedia('(prefers-reduced-motion: reduce)').matches){yaw=to;tween=null}else tween={from:yaw,to,start:performance.now()};invalidate()}
 function invalidate(){if(!disposed&&!frame)frame=requestAnimationFrame(render)}
 function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);const aspect=w/h,extent=aspect<1?4.8:3.8;camera.left=-extent*aspect;camera.right=extent*aspect;camera.top=extent;camera.bottom=-extent;camera.updateProjectionMatrix();invalidate()}
 function update(){const p=before?{wall:0xb9b8ad,floor:0x999084,accent:0x888f87}:ambiances[mode];wall.color.setHex(p.wall);floor.color.setHex(p.floor);accent.color.setHex(p.accent);invalidate()}
 function down(e){if(e.button!==0)return;tween=null;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,last:e.clientX,moved:false};canvas.setPointerCapture(e.pointerId)}
 function move(e){if(!pointer||e.pointerId!==pointer.id)return;if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>8)pointer.moved=true;if(pointer.moved){yaw=Math.max(-.3,Math.min(1.35,yaw-(e.clientX-pointer.last)*.006));invalidate()}pointer.last=e.clientX}
 function up(e){if(!pointer||pointer.id!==e.pointerId)return;const click=!pointer.moved;pointer=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!click)return;const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(ndc,camera);const hit=raycaster.intersectObjects(selectable)[0];if(hit)onSelect(hit.object.userData.part)}
 function cancel(){pointer=null}
 function lost(e){e.preventDefault();onSelect('indisponible')}
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);canvas.addEventListener('webglcontextlost',lost);
 document.addEventListener('visibilitychange',invalidate);const observer=new ResizeObserver(resize);observer.observe(host);resize();
 return {setAmbiance(value){if(!Object.hasOwn(ambiances,value))throw Error('Ambiance inconnue');mode=value;update()},setBefore(value){before=!!value;update()},rotate(delta){turn((tween?.to??yaw)+delta)},reset(){turn(.68)},stats(){return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,animating:!!tween}},dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',invalidate);for(const [event,fn]of[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel],['webglcontextlost',lost]])canvas.removeEventListener(event,fn);for(const g of geometries)g.dispose();for(const m of materials)m.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove()}};
}
