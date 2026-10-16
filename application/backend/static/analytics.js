/* Privacy-first instrumentation seam. No SDK, network, storage or replay by default.
   A reviewed deployment must configure a transport AND obtain opt-in before sending. */
(function(root){
 'use strict';
 const events=new Set(['account_created','project_started','project_step_completed','project_published','project_viewed','application_submitted','match_confirmed','technical_error']);
 let transport=null,consent=false,session=null;
 function track(event,props={}){if(!consent||!transport||!events.has(event))return false;const safe={environment:'private_beta',viewport:root.innerWidth<680?'mobile':'desktop'};
 if(['requester','professional'].includes(props.role))safe.role=props.role;
 if(Number.isInteger(props.step)&&props.step>=1&&props.step<=3)safe.step=props.step;
 if(['network','server','validation'].includes(props.kind))safe.kind=props.kind;
 try{transport({event,properties:{...safe,distinct_id:session,$process_person_profile:false,$geoip_disable:true}});return true}catch{return false}}
 root.UCPAnalytics=Object.freeze({track,configure(fn){transport=typeof fn==='function'?fn:null},setConsent(value){consent=value===true;session=consent?crypto.randomUUID():null},reset(){consent=false;session=null},enabled(){return !!(consent&&transport)}});
})(globalThis);
