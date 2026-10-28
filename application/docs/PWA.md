# Installation web et reprise réseau — préproduction du 28 octobre 2026

L'application existante reste à https://ucp-preproduction.vercel.app.
Le manifeste et le service worker passent par les mêmes protections Vercel et
HTTP Basic que le reste de l'application. Aucune protection n'est désactivée.

## Parcours livré

Le bouton **Installer UCP** ouvre une aide adaptée aux navigateurs usuels.
Lorsque le navigateur fournit `beforeinstallprompt`, un bouton explicite déclenche
sa boîte de dialogue. Son acceptation n'est pas présentée comme une installation
terminée : seule la confirmation `appinstalled` ou le mode standalone est reconnue.
Sans événement d'installation, l'aide manuelle reste accessible.

- Android : menu du navigateur, option Installer ou Ajouter à l'écran d'accueil.
- iPhone : Safari, Partage, Sur l'écran d'accueil, selon la version.
- Ordinateur : option du navigateur compatible.

Ce parcours prépare une **PWA**, pas une application native ni une publication
sur les stores. La disponibilité exacte dépend du navigateur et des protections
privées ; l'installation et la réouverture sur de vrais appareils restent à tester.
Les accès Vercel/HTTP Basic peuvent être demandés de nouveau dans le mode installé.
Aucun compte, identifiant ou jeton ne figure dans le manifeste ou les icônes.

## Limites hors connexion et confidentialité

- Le service worker ne répond qu'à une navigation GET vers `/` sur le même domaine.
- Il transmet la requête originale au serveur avec `cache: no-store` ; les réponses
  401/403/500 sont conservées. Il ne remplace jamais un refus d'accès par une page.
- Un échec réseau produit uniquement une page HTML générique 503 et un lien Réessayer.
- Aucun accès à CacheStorage, IndexedDB, cache applicatif, synchronisation de fond
  ou push. Aucun envoi automatique de message ou autre écriture en arrière-plan.
- Les API, exports, photos et ressources ne sont pas interceptés. Les réponses
  du serveur restent `no-store`. Le navigateur conserve naturellement le code
  du service worker et les éléments nécessaires à l'installation ; aucune donnée
  métier n'est enregistrée par UCP pour une consultation hors connexion.
- Le texte non envoyé et les messages déjà affichés restent seulement dans la page
  ouverte lors d'une coupure. Fermer/recharger la page peut perdre cette saisie.
  Un refus 403/404 efface immédiatement l'historique affiché ; le texte propre de
  l'utilisateur reste récupérable et l'envoi est bloqué jusqu'à un contrôle réussi.

## Reprise de la messagerie

Une panne ne masque plus le formulaire. Le dernier historique autorisé, le texte
non envoyé et la clé de réessai sont conservés en mémoire dans la page ouverte.
Le bouton Réessayer effectue uniquement une lecture. Après un contrôle réussi,
l'envoi redevient possible sur action explicite de l'utilisateur. Une réponse tardive
provenant d'un ancien chat ne peut pas masquer le chat courant ou arrêter son suivi.

## Sources et reproduction

- [Installation PWA, MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [Déclenchement de l'installation, MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt)
- Manifeste : `backend/static/manifest.webmanifest` ; worker : `backend/static/ucp-sw.js`.
- Icônes : logo SVG officiel existant, exporté sans nouveau dessin par
  `python application/tools/build_pwa_icons.py` (CairoSVG, dépendance de développement).
- Tests : `backend/tests/test_pwa.py`, `qa/frontend.test.cjs`, `qa/service-worker.test.cjs`.
  Les tests DOM/worker sont des simulations, pas des essais sur téléphone.
