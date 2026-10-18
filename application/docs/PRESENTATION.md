# Présentation interactive UCP

## Lancer et utiliser

Depuis `application/`, sous Windows : double-cliquer sur `PRESENTATION.bat`. Il utilise un environnement Python déjà présent, sans installer de dépendance. La commande équivalente depuis `application/backend/` est `..\.test-venv\Scripts\python.exe presentation.py --port 8876` (ou l'interpréteur de `.venv` si c'est l'environnement préparé).

Ouvrir **http://127.0.0.1:8876/**. Les boutons du bandeau donnent accès aux espaces demandeur, artisan et administration, sans saisie de mot de passe. Pour arrêter le serveur, utiliser Ctrl+C dans son terminal. Le port doit être libre.

Chaque lancement crée une nouvelle base SQLite dans un nouveau dossier temporaire `ucp-presentation-*`. Il ignore le chemin `UCP_LOCAL_DB` précédent et refuse d'initialiser tout fichier SQLite existant. Les anciennes données de démonstration ne sont pas effacées : elles restent dans leur répertoire temporaire. Ce mode est exclusivement local et n'est pas destiné à accueillir des données réelles.

## Scénario conseillé pour un investisseur

Depuis le chantier 03, le fil artisan comporte carrousels des images partagées, commune, délai, métiers, actions et candidature directe. Les images fournies par la présentation sont des illustrations synthétiques fictives, pas des photos de logements réels. Le demandeur choisit leur visibilité avant publication et peut retirer le partage. Les nouvelles inscriptions utilisent des domaines réservés de test ; la revue du profil artisan reste obligatoire.

**Atelier 3D** permet d'activer un salon interactif, changer l'ambiance, comparer avant/après et préparer un exemple de demande. Ni plan, ni devis. Three.js est servi localement à la demande avec fallback sans WebGL. Voir [le compte rendu du chantier 03](CHANTIER_03_RESULTATS.md).

1. Cliquer sur **Espace demandeur** : voir les projets, reprendre le brouillon de cuisine ou créer une demande en trois étapes.
2. Ouvrir **Une salle de bains plus confortable** : comparer les deux candidatures fictives. Les informations présentées viennent des profils enregistrés ; aucun avis ni badge de vérification réelle n'est inventé.
3. Cliquer sur **Espace artisan** : voir les opportunités correspondant à plomberie/carrelage et aux communes déclarées, filtrer et candidater.
4. Revenir côté demandeur, sélectionner le professionnel et ouvrir sa conversation. Basculer côté artisan pour lire le message et répondre.
5. Dans **Mon entreprise**, créer une entreprise fictive et gérer ses artisans avec le sélecteur de métiers. Les montants sont explicitement simulés et ne déclenchent aucun paiement.
6. Dans **Administration**, consulter les métriques de cette seule base fictive, les profils, le catalogue et la modération.

La présentation est interactive : publication, candidature, sélection, messages, notifications et modifications des profils sont réellement enregistrés dans cette base temporaire. Les compteurs reflètent ces enregistrements, pas une traction commerciale réelle.

## Frontière avec le fonctionnement normal

Les routes de changement de rôle sont ajoutées uniquement par `backend/presentation.py`. Le lancement normal avec `app:app` ne les possède pas. Aucun mot de passe n'est transmis au navigateur ; un secret aléatoire reste dans le processus. Le changement de rôle révoque la session de démonstration précédente et utilise le mécanisme normal de connexion, avec sessions HttpOnly et CSRF pour les opérations suivantes.

Les changements de rôle exigent une connexion loopback et un en-tête Origin correspondant exactement à l'origine locale. Ne jamais exposer le serveur par tunnel, proxy public, interface `0.0.0.0` ou hébergement partagé. Les droits administrateur sans saisie de mot de passe sont une commodité de cette seule présentation fictive et locale.

## Qualité et limites

Les animations de changement de vue et de dialogue utilisent des transformations et l'opacité, respectent `prefers-reduced-motion`, et n'ajoutent ni bibliothèque ni appel réseau externe. La liste affiche six projets à la fois ; le filtrage reste côté navigateur et ne constitue pas encore une pagination SQL pour des volumes de production.

Les tests de `backend/tests/test_presentation.py` couvrent l'absence des accès rapides sur le serveur normal, les changements de rôle, la révocation de session, les contrôles CSRF, le rejet des origines externes/absentes, des clients distants et des fichiers SQLite préexistants. Le scénario `qa/presentation.browser.js` est réexécutable avec le MCP Playwright, outil `browser_run_code_unsafe`, en lui passant le chemin absolu du fichier comme `filename`. Il crée un projet fictif unique, réalise candidature/sélection/messages et contrôle les largeurs ainsi que la réduction des animations.

La vérification réelle des assurances/entreprises, la facturation, les pièces jointes de conversation, les avis et la préparation d'un hébergement de production restent des chantiers distincts. La sélection unique et la fermeture du chat suivent encore les règles du laboratoire ; les arbitrages métier ouverts ne sont pas modifiés par cette présentation.
