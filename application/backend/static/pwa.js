/* Installation is user initiated. Network state never replays writes or stores data. */
(function(){
  'use strict';
  let promptEvent=null,installed=false;
  const trigger=document.querySelector('#install-app'),help=document.querySelector('#install-help');
  const standalone=()=>navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches===true;
  const update=()=>{trigger.hidden=installed||standalone();};
  function instructions(){
    const box=el('div',{},el('p',{text:'Ajoutez UCP à votre écran d’accueil depuis un navigateur compatible. Il s’agit d’une application web, sans téléchargement depuis un store.'}),
      el('h4',{text:'Android · Chrome ou navigateur compatible'}),el('p',{text:'Ouvrez le menu du navigateur, puis « Installer l’application » ou « Ajouter à l’écran d’accueil », selon les options proposées.'}),
      el('h4',{text:'iPhone · Safari'}),el('p',{text:'Ouvrez le menu Partage, puis « Sur l’écran d’accueil ». Le nom des commandes peut varier selon votre version.'}),
      el('h4',{text:'Ordinateur · Chrome ou Edge'}),el('p',{text:'Utilisez l’option d’installation proposée dans la barre d’adresse ou le menu du navigateur.'}),
      el('p',{class:'hint',text:'La préproduction reste privée : les accès Vercel et UCP peuvent être redemandés à l’ouverture. Une connexion Internet est nécessaire pour lire ou modifier les données. Les données ne sont pas enregistrées pour une consultation hors connexion. Une saisie non envoyée reste seulement dans la page ouverte.'}));
    if(standalone())box.prepend(el('p',{class:'status-note',text:'UCP est ouvert en mode application sur cet appareil.'}));
    if(promptEvent)box.prepend(button('Lancer l’installation',async e=>{
      e.currentTarget.disabled=true;
      const event=promptEvent;promptEvent=null;
      try{await event.prompt();const choice=await event.userChoice;
        msg(choice.outcome==='accepted'?'Demande d’installation acceptée. Suivez les indications du navigateur.':'Installation annulée. Vous pouvez continuer dans le navigateur.');
        document.querySelector('#dialog').close();
      }catch{msg('Le navigateur ne propose plus cette installation. Utilisez son menu ou les instructions affichées.','error');}
    },'primary'));
    showDialog('Installer UCP sur cet appareil',box);
  }
  trigger.addEventListener('click',instructions);help.addEventListener('click',instructions);
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;update();});
  window.addEventListener('appinstalled',()=>{promptEvent=null;installed=true;trigger.hidden=true;msg('Installation confirmée par le navigateur.','success');});
  const display=window.matchMedia?.('(display-mode: standalone)');display?.addEventListener?.('change',update);update();
  const status=document.querySelector('#connection-status');
  window.addEventListener('offline',()=>{status.textContent='Vous êtes hors connexion. Vos saisies restent dans cette page. Rien ne sera envoyé automatiquement.';status.hidden=false;});
  window.addEventListener('online',()=>{status.textContent='Connexion détectée. Vous pouvez réessayer vos actions ; rien n’a été envoyé automatiquement.';status.hidden=false;});
  if(navigator.onLine===false)window.dispatchEvent(new Event('offline'));
  if(window.isSecureContext&&'serviceWorker' in navigator){
    navigator.serviceWorker.register('/ucp-sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{
      // Installation help and the online application remain usable without a worker.
    });
  }
})();
