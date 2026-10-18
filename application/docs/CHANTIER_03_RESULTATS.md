# Chantier 03 — Atelier 3D et découverte de chantiers

Réalisé le 17 octobre 2026 sur `dev/ucp-codex`. Aucun push, déploiement, paiement, changement de schéma SQL ou utilisation de données réelles. Les anciennes bases de démonstration sont conservées ; une nouvelle base temporaire a été créée pour cette recette.

## Fonctions livrées

- Atelier Three.js procédural local : salon isométrique, trois ambiances, avant/après illustratif, rotation au glissement ou boutons, sélection des murs/sol, brouillon prérempli sans publication automatique. Ni plan mesuré, ni devis, ni diagnostic.
- Chargement 3D sur activation seulement, fallback sans WebGL, animation finie avec réduction des mouvements, DPR limité à 1,5, rendu au besoin et destruction des ressources en quittant la vue.
- Fil artisan vertical : six cartes par page, recherche/filtres, tri par nombre de métiers correspondants puis récence, explication du rapprochement, commune, délai, actions, carrousel de photos autorisées et candidature directe confirmée. Pas de pourcentage artificiel, géolocalisation ou IA déclarée.
- Demandeur : actions attendues (12 lignes de 120 caractères maximum), catalogue multi-métiers existant, photos et consentement facultatif avant candidature, récapitulatif du consentement et retrait du partage depuis Mes projets.
- Inscription/connexion testées avec deux nouveaux comptes fictifs. Profil artisan : métiers, communes, SIREN de test, revue obligatoire. Avertissement explicite lors de la modification d'un profil existant : remise en revue et invalidation des candidatures en attente, conformément au serveur existant.
- Identité conservée : logo officiel local, orange `#FF791D`, violet `#505DC1`, beige `#F5F0EA`, Anton et Montserrat. La compétence Frontend Design a guidé la hiérarchie : les compteurs secondaires restent dans « Votre activité », tandis que les chantiers et leurs actions sont mis en avant.

## Confidentialité

`actions` et `photo_visibility` sont conservés dans le JSON existant des brouillons, sans migration. Défaut `private`, y compris pour les anciennes données. Seul le choix explicite `matched` au stade brouillon permet les aperçus aux professionnels actuellement compatibles et autorisés.

Photos authentifiées, réencodées sans EXIF, non publiques, `Cache-Control: no-store`. La découverte revérifie éligibilité, approbation, statut ouvert, modération et suspensions. Retrait du partage par écriture CSRF journalisée. Les accès privés du propriétaire, de l'administration et d'une relation sélectionnée autorisée restent régis par les règles existantes. Les fichiers déjà téléchargés ne peuvent pas être rappelés. L'interface interdit les coordonnées, visages ou documents dans les images ; aucune détection automatique de contenu n'est annoncée.

## Résultats exécutés

| Contrôle | Résultat final | Portée |
| --- | --- | --- |
| Python complet | 123 réussis, 0 échec, 1 avertissement | SQLite temporaires neufs, API/sécurité/concurrence, dont 5 nouveaux tests découverte |
| JavaScript / DOM / configuration 3D | 29 réussis, 0 échec | jsdom et Node ; pas de GPU simulé |
| `qa/presentation.browser.js` | 22 contrôles réussis | Publication, candidature, sélection, messages et responsive |
| `qa/discovery.browser.js` | 20 contrôles réussis | Deux inscriptions, profil/revue, envoi de deux images synthétiques, consentement, matching, carrousel/clavier, candidature et retrait |
| `qa/atelier.browser.js` | 19 contrôles réussis | WebGL réel, import différé, ambiances, mouvement réduit, responsive, formulaire et fallback |

Commandes : depuis `application/`, `.test-venv\Scripts\python.exe -m pytest -q --basetemp .pytest-tmp-feed-fixed-20261017 backend/tests` (770,75 secondes). Depuis le dépôt, `node --test application/qa/atelier.test.cjs application/qa/frontend.test.cjs`. Scénarios navigateur via Playwright sur `127.0.0.1:8876`, avec écritures exclusivement dans la présentation fictive.

La première passe a détecté un refus de publication avec liste d'actions vide : le garde anti-coordonnées refusait la chaîne vide. Correction : ne contrôler ce champ facultatif que s'il contient des actions, puis suite complète réussie. Les attentes/sélecteurs de recette ont aussi été ajustés pour l'initialisation et les deux zones de texte. Les anciens échecs ne sont pas présentés comme des succès.

Chrome DevTools : accueil local sans bridage CPU/réseau, LCP 221 ms et CLS 0,00 lors de la dernière trace (première mesure : 200 ms). Ce n'est ni une mesure mobile physique ni le temps de démarrage 3D. Scène : 52 appels de dessin, 3108 triangles, 52 géométries. Trois remontages donnent les mêmes compteurs avec un seul canvas ; cela ne prouve pas l'absence de toute fuite GPU. Pas de chronométrage GPU ni promesse de 60 FPS. Aucun appel réseau tiers observé à l'activation. Le 401 de session anonyme et l'erreur de contexte WebGL provoquée par le test de fallback sont attendus ; aucune exception JavaScript non interceptée dans les scénarios réussis.

Captures fictives dans `docs/qa/` : `atelier-desktop.png`, `atelier-mobile.png`, `chantier-feed-desktop.png`, `chantier-feed-mobile.png`. Elles ne remplacent pas l'application interactive.

## Outils, dépendance et limites

Three.js 0.180.0 / r180 depuis le dépôt officiel GitHub, MIT incluse, empreintes dans `backend/static/vendor/three-r180/README.md`. Environ 720 Ko JavaScript non compressés, chargés seulement sur activation. Pas de dépendance Python/npm ajoutée, de migration React ou de service externe. Compétences Three.js scène/interaction/performance et Frontend Design appliquées ; Playwright et Chrome DevTools utilisés. Spline interrogé : aucun éditeur/pont connecté. Aucune scène Spline/Blender prétendue créée. GSAP non ajouté : CSS et Three.js couvrent les interactions sans doubler les moteurs.

Le matching reste une intersection de métiers/communes déclarés, pas un rayon ou une analyse des diplômes/disponibilités. Le chargement intégral et l'enrichissement des brouillons doivent évoluer vers pagination/filtrage serveur et tests de charge avant gros volume. Vérifier ensuite normalisation des communes, cas entreprise et métiers multiples.

Comptes limités aux domaines `.test`, `.example`, `.invalid`. Avant ouverture réelle : identité/assurance professionnelle, conditions de partage et conservation validées, anti-abus/modération des images, infrastructure approuvée et recette staging/sécurité. Abonnement simulé, pas d'email, paiement, production ou GO commercial.
