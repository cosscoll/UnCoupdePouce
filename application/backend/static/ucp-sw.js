/* Navigation fallback only. No CacheStorage, IndexedDB, background sync or writes.
   The server still authenticates every real request; no account data is stored. */
'use strict';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||request.mode!=='navigate'||url.origin!==self.location.origin||url.pathname!=='/')return;
  event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>new Response(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UCP — Hors connexion</title></head><body><main><h1>La connexion est interrompue.</h1><p>Reconnectez-vous à Internet puis réessayez.</p><p>Cette page ne contient aucune donnée de compte. Les projets et messages restent sur le serveur. Aucune action n’est envoyée en arrière-plan.</p><p><a href="/">Réessayer d’ouvrir UCP</a></p></main></body></html>',
    {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
      'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}}
  )));
});
