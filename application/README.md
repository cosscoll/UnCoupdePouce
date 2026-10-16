# Un Coup de Pouce — version Work 4.0.2

Application de développement privée, locale et persistante, issue du laboratoire UCP v3.6 existant. Date : 16 octobre 2026. Cette archive contient le code de référence du fil Work UCP et ses tests ; elle ne représente pas une application déployée ni une autorisation commerciale.

## Utiliser la version

Python 3.12 est la version vérifiée. Depuis le dossier extrait : `sh DEMARRER.sh` (macOS/Linux) ou `DEMARRER.bat` (Windows). Le lanceur installe les dépendances verrouillées puis démarre sur http://127.0.0.1:8765. Les dépendances nécessitent un accès réseau lors de la première installation ; aucun service payant ou clé API n'est utilisé.

Pour préparer une démonstration, arrêter le serveur puis exécuter depuis `backend/` : `../.venv/bin/python demo.py` (Windows : `..\.venv\Scripts\python.exe demo.py`). La commande refuse toute base contenant déjà des utilisateurs. Elle crée trois comptes fictifs et affiche un mot de passe aléatoire à conserver uniquement sur la machine : `admin@ucp.test`, `camille@ucp.test`, `atelier@ucp.test`. Aucun identifiant généré n'est inclus dans cette archive. Relancer ensuite le serveur.

La base est `backend/ucp_local.sqlite3`, créée au premier démarrage. `UCP_LOCAL_DB` permet de sélectionner une autre base locale. Aucune base, sauvegarde, session, clé ou donnée utilisateur n'est livrée dans ce ZIP. N'utiliser que des personnes, textes et photos fictifs. Ne pas exposer ce serveur sur Internet.

## Renforcement 4.0.2

Sessions revérifiées dans la transaction de chaque accès authentifié, lectures privées cohérentes, décisions admin atomiques avec leur audit, connexion protégée contre une réinitialisation concurrente du mot de passe, masquage des conversations modérées. Voir `docs/AUDIT_SECURITE.md` pour les preuves et limites. Aucun nouveau schéma ni fournisseur externe requis.

## Fonctions développées

- Comptes demandeur/professionnel, sessions serveur, protection CSRF, récupération opérateur locale, export individuel, révocation de sessions.
- Catalogue de métiers administrable, recherche de catégories, publication guidée en trois étapes, plusieurs métiers par projet, brouillons versionnés et publication idempotente.
- Photos privées réencodées sans métadonnées EXIF, contrôle de taille et d'accès.
- Matching métier/commune, candidatures individuelles et profils liés d'entreprise, sélection, retrait, refus et clôture.
- Messagerie privée conditionnée aux droits, notifications internes, protection contre les doubles envois après perte de réponse.
- Vérification et abonnement simulés, modération des projets/comptes, signalements, journal d'audit.
- Interface responsive avec logo officiel et polices locales Anton/Montserrat. Instrumentation préparée mais collecte désactivée.

## Contrôler le code

Depuis la racine, après installation des dépendances :

```sh
.venv/bin/python -m pytest -q backend/tests
cd qa
npm ci
node --test frontend.test.cjs
```

Les tests DOM utilisent jsdom et des réponses API simulées. Ils ne prouvent pas le rendu dans un navigateur réel. Les preuves de cette version sont dans `docs/qa/` et leurs limites dans `docs/QA.md`.

## Sauvegarde et restauration

```sh
.venv/bin/python scripts/database.py backup backend/ucp_local.sqlite3 backups/copie.sqlite3
.venv/bin/python scripts/database.py restore backups/copie.sqlite3 backups/restauree.sqlite3
```

La destination doit être un nouveau fichier. La restauration invalide sessions et codes de récupération. Conserver les copies hors du dépôt, avec accès restreint. Une restauration de test doit utiliser une base fictive.

## Sources et continuité

Lire `docs/SYNCHRONISATION.md` avant toute reprise. Le journal Google Docs reste la référence commune des priorités et arbitrages ; les archives sont identifiées par leurs empreintes. Le dépôt distant et la branche de développement active sont des supports de travail, pas une preuve de déploiement ou d'ouverture commerciale. Ne pas qualifier cette archive de production.

Le backend est FastAPI/SQLite ; il ne dépend ni de Supabase ni d'une API payante. Les lots classiques 05 à 09 sont des contributions isolées : certains contrôles ont été adaptés, leur serveur n'a pas été fusionné. Voir `docs/RAPPROCHEMENT_LOTS.md`.

## Travail restant avant un service opérationnel

Base de production et staging privé vérifiés, hébergement autorisé sans dépense, compte fournisseur et droits de propriété, migrations réversibles, tests navigateur/API et accessibilité, vérification professionnelle réelle, messagerie transactionnelle, facturation TEST réellement intégrée, protections anti-abus et supervision, politique d'effacement/conservation approuvée, installation PWA et recette finale. L'application native et les paiements réels ne sont pas réalisés.

Les prix, la sélection d'un seul professionnel et l'accès au chat sont des hypothèses de laboratoire. Les décisions D01–D13 restent non approuvées. Aucun GO commercial n'est donné par les tests locaux.
