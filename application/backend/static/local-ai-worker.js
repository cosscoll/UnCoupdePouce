/* Worker UCP. Chargement local sans API payante, erreurs remontées à l'interface. */
import {generate,resetEngine} from './local-ai-engine.js';
const err=e=>e instanceof Error?e.message:String(e);
self.postMessage({type:'ready'});
self.onmessage=async event=>{
 const data=event.data||{},id=data.id;
 if(data.type==='reset'){await resetEngine();return}
 if(!Number.isSafeInteger(id))return;
 try{
  const output=await generate(data.payload||{},(text,progress)=>{
   self.postMessage({type:'progress',id,text,progress})
  });
  self.postMessage({type:'result',id,...output});
 }catch(e){
  self.postMessage({type:'error',id,error:err(e),stage:e?.stage||'inference'});
 }
};
