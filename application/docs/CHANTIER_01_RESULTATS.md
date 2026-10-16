# Lot 01 — Expérience d'accueil et première recette réelle

Date : 16 octobre 2026. Branche : `dev/ucp-codex`. Base de départ locale : commit documentaire `02666a9`. Ce rapport décrit les modifications locales non publiées de ce lot.

## Sources rapprochées

- [Cahier des charges fonctionnel v1.2 historique](https://docs.google.com/document/d/1cOJh1_637CEvcFRxbRu5eZo4gd__AJtqdQDCDnOhOgQ/edit) : cycle publication, matching, candidature, sélection, échange ; le texte contient des choix historiques et ne suffit pas à figer les décisions actuelles.
- [Référentiel de passation et décisions](https://docs.google.com/document/d/1GjkjrDCiwwb44Ytm0-ohHWeMGWSd0eDQ0tZznYR1O_g/edit) et [kit préproduction](https://docs.google.com/document/d/1wDT-tfiHVtQX3lzovZxxGjF-ZqNwcWLVwfk-NaQTN90/edit) : charte Ydays, confidentialité, critères de recette et décisions ouvertes.
- Conversation ChatGPT « UCP — Construction autonome » : livrables complémentaires signalés, dont export des conversations, pièces jointes, sauvegardes et défaut mobile de la page Avancement. Ces contributions n'ont pas été fusionnées ni présumées présentes dans le clone local.

Le travail conserve les règles métier de la base locale. Il ne tranche pas D01–D13, ne change pas la sélection unique de laboratoire et n'intègre aucun service payant.

## Livré dans les fichiers

- Accueil de l'application redessiné autour des travaux : illustration SVG originale locale, palette et polices existantes, promesse et étapes lisibles.
- Accès direct au formulaire sur mobile, ajouté après critique de la première capture où la connexion se trouvait trop bas.
- Vue d'ensemble des projets du demandeur : projets ouverts, en relation et brouillons, calculés sur les réponses de ses API privées existantes.
- Affichage/masquage du mot de passe par formulaire ; mot de passe effacé et masqué après connexion réussie, effacé après inscription.
- État de sélection des boutons d'accès annoncé via `aria-pressed`.
- Correction des suggestions : choisir un métier précis retire « Je ne sais pas », pour respecter le contrat de publication.
- Icône de site déclarée : suppression de la requête automatique vers un favicon absent.
- Lecture explicite UTF-8 du catalogue dans les deux modules serveur.
- Exclusion Git des environnements et traces temporaires de recette créés pendant les essais.

Aucun changement de dépendance applicative, de schéma ou de règle de facturation. Les bases existantes du projet n'ont pas été utilisées. Le correctif UTF-8 concerne la lecture des sources et les nouvelles bases : il ne répare pas automatiquement un catalogue déjà enregistré avec un mauvais encodage.

## Anomalie backend démontrée

Sous Windows, la première exécution exploitable s'est arrêtée avec **106 PASS et 1 FAIL**, au test `test_catalog_live_add_disable_and_unknown_classification`. La recherche `electricite` renvoyait une liste vide alors que le catalogue contient `Électricité`. La cause était `Path.read_text()` sans encodage explicite lors de l'initialisation du catalogue UTF-8.

Après correction : test ciblé PASS, suite complète 110 PASS, puis recherche HTTP réelle sur une nouvelle base fictive retournant correctement `Électricité`. Aucune migration ni réécriture d'une base existante n'a été effectuée.

## Tests automatisés réellement exécutés

| Suite | Résultat final | Preuve / portée |
|---|---|---|
| Backend FastAPI | 110 PASS, 0 FAIL, 0 ERROR | `qa/mission4-pytest.xml`, Python 3.12.14, SQLite temporaire distincte par cas ; 356,88 s. |
| Interface DOM | 13 PASS, 0 FAIL | 8 tests conservés et 5 nouveaux : compteurs, visibilité du mot de passe, état accessible, suggestion sans conflit et effacement après connexion. API simulée. |
| Brief vitrine | 3 PASS, 0 FAIL | Scénarios combinatoires et entrées invalides dans `site-vitrine/tests/brief.test.cjs`. |
| Contrôle statique vitrine | PASS | 368 assertions de pages, 8 paires de contrastes, aucune erreur. |
| Syntaxe / diff | PASS | `node --check application/backend/static/app.js` et `git diff --check`. |

Une dépréciation Starlette/AnyIO demeure : alias `anyio.abc.BlockingPortal`. Aucun avertissement n'a été supprimé pour obtenir le résultat.

Commandes depuis `application/`, avec les dépendances déjà préparées pour cette session :

```powershell
.\.test-venv\Scripts\python.exe -m pytest -q --basetemp .pytest-tmp-nouveau backend/tests
node --test qa/frontend.test.cjs
```

Choisir un nouveau chemin `--basetemp` : pytest gère ce répertoire et peut le vider. Ne jamais cibler un répertoire contenant des données à conserver. Les premières tentatives dans le dossier temporaire sandbox Windows étaient bloquées ; la suite finale a été exécutée avec autorisation dans un répertoire de recette dédié.

Depuis `site-vitrine/` :

```powershell
..\application\.test-venv\Scripts\python.exe -X utf8 scripts/check_site.py
node --test tests/brief.test.cjs
```

Le contrôle statique réécrit son rapport JSON ; aucune génération de vitrine n'a été nécessaire. Aucun lancement des scripts `DEMARRER` ni installation supplémentaire de bibliothèque n'a eu lieu dans ce lot.

## Recette navigateur réellement exécutée

Playwright et Chrome DevTools ont utilisé le serveur `127.0.0.1:8876`, avec des fichiers SQLite nouvellement créés sous l'environnement de test ignoré par Git. Tous les comptes, noms et contenus étaient fictifs ; aucun email envoyé, aucun paiement activé. L'administrateur de recette a été créé avec l'outil opérateur local sur cette seule base fictive.

Parcours vérifiés dans l'interface :

1. Inscription demandeur, connexion, ouverture du formulaire, saisie titre/description, choix plomberie, commune Blagnac et délai, récapitulatif, confirmation et publication.
2. Inscription professionnel, déclaration du métier plomberie, communes Toulouse/Blagnac, SIREN fictif et enregistrement du profil.
3. Connexion administrateur, autorisation du profil pour les tests et activation de l'accès messagerie simulé.
4. Connexion professionnel, projet correspondant visible, détail et candidature ; connexion demandeur, sélection avec confirmation.
5. Message envoyé par le demandeur, lu par le professionnel, puis réponse du professionnel affichée.

L'accueil et le tableau de projets ont été contrôlés à 320, 375, 390, 768 et 1440 px : aucun débordement horizontal détecté sur ces dix combinaisons. Captures inspectées : `qa/ucp-accueil-desktop.png` et `qa/ucp-accueil-mobile.png`. Le lien mobile vers le formulaire a été cliqué et son arrivée dans la zone visible contrôlée.

Chrome DevTools n'a relevé aucune exception JavaScript pendant la navigation examinée. La console conserve le 401 attendu de `/api/session` pour un visiteur déconnecté. Le 404 du favicon observé initialement a été corrigé et n'est plus présent lors du dernier chargement.

Trace locale d'accueil : LCP 72 ms, CLS 0,00, sans bridage CPU ni réseau. Il s'agit d'une observation sur loopback, pas d'une mesure de performances terrain ni d'une garantie en production. Aucune mesure INP représentative, test de charge ou certification d'accessibilité n'est revendiqué.

## Suite prioritaire

1. Rendre la recette navigateur complète réexécutable avec création automatique d'une base et de comptes fictifs, puis arrêt et vérification du serveur.
2. Rapprocher les contributions distantes et les décisions produit avec le travail local avant toute intégration : export des messages reçus, pièces jointes, historique après clôture et sélection multiple restent des sujets distincts.
3. Poursuivre la hiérarchie de l'espace connecté, la comparaison des candidatures et l'onboarding professionnel, avec tests clavier et captures systématiques.
4. Préparer migrations versionnées, sauvegardes chiffrées et gestion des clés avant toute utilisation avec données réelles ou staging autorisé.

Le commit documentaire local demandé précédemment existe : `02666a9` (`docs: establish UCP development and recovery procedures`). Ce lot n'a donné lieu à aucun push, déploiement ou changement de `main`.
