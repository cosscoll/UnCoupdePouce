# UCP — identifiants distincts des deux comptes de démonstration

La [PR nº 53](https://github.com/cosscoll/UnCoupdePouce/pull/53) permet la connexion
par identifiant court ou email, avec des mots de passe distincts pour les deux
comptes fictifs initiaux. Aucun mot de passe demandé par le propriétaire n’est
présent dans le code, les tests, les journaux ou cette documentation.

Les IDs, rôles et données existantes sont conservés. La configuration est limitée
aux deux comptes fictifs et exige un administrateur connecté avec CSRF valide.
Elle est atomique avec son journal : collision ou erreur d’audit annule le lot.
Les anciennes sessions et les codes de récupération sont révoqués ; alias et email
partagent le même compteur de tentatives. Les autres comptes, dont l’administrateur,
conservent leurs identifiants. L’inscription conserve son minimum de douze caractères.

La [CI complète](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41650251165)
réussit sur `58bbaea21c9a7d09042a35eb318a74b77d3b0930` : **270 tests Python
SQLite/PostgreSQL et 121 tests DOM/logique/worker** (115 DOM, 3 logique et 3 worker).
Six cas dédiés SQLite, deux scénarios PostgreSQL et un scénario DOM ont été ajoutés.

Le commit fusionné est `25e75e7f9e3395a3e3f356e8219f8fc4e96f3a78`. Le déploiement
`dpl_8yfsTcdNFdqzdpdM5G9R2MCmJNov` est `READY` et associé à
`ucp-preproduction.vercel.app` sur ce commit. Les protections privées demeurent
actives ; aucun email ni paiement réel n’a été envoyé. Cette livraison ne constitue
pas une recette visuelle des tableaux de bord connectés.


La configuration a été appliquée par l’administrateur aux deux comptes fictifs.
Le contrôle HTTPS réussit : chaque identifiant demandé ouvre le bon rôle avec son
mot de passe propre, les anciens mots de passe et leur interversion sont refusés,
les anciennes sessions sont invalides et les données exportées des comptes restent
identiques, à l’exception de l’ajout de l’identifiant de connexion.
La [CI de main](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41650864109)
réussit aussi. La fiche privée du propriétaire est actualisée séparément.
Voir la [preuve sans secrets](qa/identifiants-demonstration-2026-11-03.json).
