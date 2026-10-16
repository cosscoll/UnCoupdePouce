# Protocole de reprise et de synchronisation — UCP Work 4.0.2

Ce document est le point d'entrée technique pour reprendre le développement du laboratoire UCP. Il décrit l'état observé dans ce dépôt, pas une autorisation de déploiement, d'ouverture commerciale ou de traitement de données réelles.

## 1. Cadre de travail non négociable

- Travailler sur `dev/ucp-codex`. Ne jamais modifier directement `main`.
- Ne pas pousser, fusionner, ouvrir de pull request, déployer, installer une dépendance ou activer un service externe sans autorisation explicite.
- Aucun achat, crédit, abonnement, API facturée à l'usage ou autre dépense n'est autorisé.
- N'utiliser que des données, comptes, projets, photos et adresses e-mail fictifs. Les domaines réservés de test sont requis par l'application.
- Ne jamais écraser, supprimer, migrer, restaurer ou ouvrir à des fins de test une base locale existante sans autorisation explicite.
- Lire aussi `../../AGENTS.md` avant toute intervention ; ses règles s'appliquent à l'ensemble du dépôt.

## 2. Carte du dépôt

| Chemin | Rôle |
|---|---|
| `application/backend/app.py` | API FastAPI, schéma SQLite local, authentification, projets, candidatures, messages, notifications, administration et serveur de fichiers statiques. |
| `application/backend/features_v4.py` | Fonctions v4 : brouillons, photos, signalements, modération, catalogue et récupération de compte. |
| `application/backend/static/` | Interface HTML/CSS/JavaScript servie par FastAPI. |
| `application/backend/tests/` | Tests API et sécurité avec bases SQLite temporaires. |
| `application/qa/` | Tests DOM jsdom avec réponses API simulées. |
| `application/scripts/database.py` | Outil de sauvegarde/restauration SQLite qui refuse l'écrasement de destination. |
| `application/docs/` | Architecture, qualité, audit sécurité, historique et rapprochement des lots. |
| `site-vitrine/` | Vitrine statique distincte de l'application ; `build.py` génère `dist/`. |

## 3. Architecture actuelle

L'application est un laboratoire local Python 3.12, FastAPI, Pydantic, Uvicorn et SQLite. FastAPI sert l'interface HTML/CSS/JavaScript native et les routes `/api/` sur la même origine. Le lanceur écoute uniquement sur `127.0.0.1:8765`.

SQLite stocke notamment les utilisateurs, sessions, profils, projets, candidatures, messages, notifications, entreprises, brouillons, photos, signalements, décisions de modération, journal d'audit et codes de récupération. Une connexion est ouverte par opération ; les écritures sensibles sont transactionnelles. Les évolutions de schéma locales sont additives au démarrage, mais ne remplacent pas un système de migrations de production.

L'application protège les écritures authentifiées par une session HttpOnly/SameSite et un jeton CSRF. Les accès privés revérifient l'état de session et les autorisations dans la transaction. Les photos restent privées et sont réencodées sans EXIF. Ces protections sont décrites en détail dans `ARCHITECTURE.md` et `AUDIT_SECURITE.md`.

## 4. Fonctionnalités présentes et limites

### Présentes dans le laboratoire

- Comptes demandeur, professionnel et administrateur, sessions, révocation, récupération locale et export individuel.
- Publication guidée de projets, brouillons versionnés, métiers multiples, communes déclarées et matching métier/commune.
- Candidatures, sélection unique de laboratoire, retrait, refus, clôture et messagerie privée avec clé d'idempotence.
- Notifications internes, profils d'entreprise et artisans liés, modération, signalements, journal d'audit et catalogue de métiers.
- Photos privées limitées et réencodées, sauvegarde/restauration de bases SQLite, analyse produit préparée mais désactivée.

### Limites à conserver explicitement

- Pas d'hébergement public, paiement, e-mail/SMS/push transactionnel, fournisseur d'identité, PWA, géocodage, supervision distante ni collecte analytics active.
- Les abonnements, SIREN, vérification professionnelle et indicateurs sont simulés ; ils ne prouvent aucune information réelle.
- La sélection unique, la tarification et les décisions D01–D13 sont des hypothèses de laboratoire, pas des décisions commerciales validées.
- Les tests navigateur réel, accessibilité complète, charge, staging, migrations de production, MFA, rétention/effacement et vérifications professionnelles restent à réaliser.

## 5. Démarrage local

Prérequis vérifié : Python 3.12. Le premier démarrage peut accéder au registre Python pour installer les versions verrouillées. Ne pas le lancer sans autorisation si l'environnement n'est pas déjà préparé.

Depuis `application/` :

```sh
./DEMARRER.sh
```

Sous Windows :

```bat
DEMARRER.bat
```

Le serveur local écoute sur `http://127.0.0.1:8765`. La base par défaut est `application/backend/ucp_local.sqlite3`, créée au premier démarrage. `UCP_LOCAL_DB` permet de choisir un autre chemin ; l'utiliser pour isoler tout essai autorisé. Ne jamais exposer ce serveur sur Internet.

La démonstration `backend/demo.py`, le bootstrap administrateur et la récupération locale créent ou manipulent des données : ils exigent une instruction explicite et ne doivent agir que sur une base fictive dédiée.

## 6. Procédure de test

Les tests doivent être exécutés uniquement après vérification qu'ils utilisent des bases temporaires ou des données fictives. Les résultats historiques sont consignés dans `QA.md`, mais ne remplacent pas une exécution actuelle.

Depuis `application/`, après préparation autorisée de l'environnement :

```sh
.venv/bin/python -m pytest -q backend/tests
cd qa
npm ci
node --test frontend.test.cjs
```

Sous Windows, employer l'interpréteur de `.venv\Scripts`. `npm ci` peut télécharger des paquets et nécessite donc une autorisation distincte si `node_modules` n'est pas déjà présent. Les tests DOM ne sont pas des tests de rendu navigateur.

Pour tout changement d'interface, compléter les tests ciblés par une recette navigateur Playwright ou Chrome DevTools : clavier, mobile et desktop, erreurs, console, réseau, autorisations et non-régression des parcours concernés. Ne pas utiliser de données réelles.

Pour la vitrine, consulter son README avant toute génération :

```sh
cd site-vitrine
python3 build.py
python3 scripts/check_site.py
node --test tests/brief.test.cjs
```

La génération modifie `site-vitrine/dist/` ; ne l'exécuter que lorsqu'une modification de vitrine est attendue et autorisée.

## 7. Sauvegarde et restauration

Avant une opération autorisée sur une base : arrêter le serveur, identifier le chemin absolu de la source, travailler sur une copie fictive et conserver la sauvegarde hors du dépôt. Le script refuse toute destination existante.

Depuis `application/` :

```sh
.venv/bin/python scripts/database.py backup backend/ucp_local.sqlite3 backups/copie.sqlite3
.venv/bin/python scripts/database.py restore backups/copie.sqlite3 backups/restauree.sqlite3
```

La restauration doit viser un nouveau fichier ; elle invalide sessions et codes de récupération. Vérifier `integrity_check` et les relations avant usage. Ne pas supprimer l'original ; aucun rollback automatique d'une base modifiée n'est garanti.

## 8. GitHub et contrôle des changements

Avant toute écriture :

```sh
git branch --show-current
git status --short --branch
```

La branche attendue est `dev/ucp-codex`. Utiliser `git diff --check` puis `git diff` avant de remettre un changement. Préserver les modifications d'autrui et ne pas employer de commandes destructrices. Aucun `push`, tag, pull request ou déploiement ne doit être effectué sans autorisation explicite.

Le dépôt possède un distant `origin`, mais la présence d'un distant Git ne constitue ni une autorisation de publication ni une preuve de déploiement. Les archives historiques restent des références de traçabilité ; leur contenu ne doit pas être fusionné sans analyse et tests sur le code Work.

## 9. Ordre de lecture pour une reprise

1. `../../AGENTS.md` et le README racine.
2. `../README.md` pour le périmètre et les limites du laboratoire.
3. `ARCHITECTURE.md` pour le modèle d'exécution et de données.
4. `QA.md` et `AUDIT_SECURITE.md` pour les preuves et leurs limites.
5. `RAPPROCHEMENT_LOTS.md` pour les divergences avec les lots historiques.
6. `ANALYTICS.md` avant toute discussion de mesure produit.
7. Les documents dans `historique/` seulement lorsqu'une décision ou un comportement ancien doit être retracé.

Consigner tout changement d'architecture, de sécurité, de test ou de limite dans le document approprié. Ne pas transformer un résultat de test local en affirmation de disponibilité, conformité ou sécurité de production.

## 10. Passage futur vers la production

Le préalable n'est pas un changement de code isolé. Il faut d'abord un environnement de staging privé autorisé, un hébergement sans dépense non validée, des migrations versionnées et réversibles, une gestion de secrets, HTTPS, anti-abus, sauvegardes opérationnelles, supervision, tests navigateur/accessibilité/performance, politique de conservation/effacement, MFA admin et règles de vérification professionnelle.

Toute intégration d'e-mail, de paiement, de stockage, d'identité ou d'IA doit faire l'objet d'une décision dédiée : besoin documenté, coût nul ou explicitement approuvé, licence et sécurité vérifiées, protection des données définie, tests d'échec et procédure de retrait. Rien de cela n'est autorisé par ce document.
