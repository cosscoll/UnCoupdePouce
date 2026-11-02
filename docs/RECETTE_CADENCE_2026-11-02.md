# Cadence des candidatures — recette du 2 novembre 2026

F42 progresse avec une protection technique de préproduction : dix envois par
minute et cinquante par heure glissantes par défaut, configurables et communs au
compte gestionnaire. Aucun forfait commercial ni suivi d'IP n'est défini par ce lot.

| Contrôle | Résultat attendu |
| --- | --- |
| Deux routes individuelle/profil lié | Même historique et même limite |
| Dernière place demandée en concurrence | Un seul envoi réussi, un refus 429 |
| Refus à la limite | Retry-After exact ; aucune candidature/notification/audit de réussite ajouté |
| Doublon sur le même projet | 409 conservé, même à la limite |
| Retrait, nouvelle session et réinitialisation | Aucun compteur remis à zéro |
| Fenêtre exactement expirée | Place libérée, sous réserve de l'autre fenêtre |
| Seuil abaissé sous l'historique existant | Délai jusqu'à la sortie d'un nombre suffisant d'envois |
| Transaction annulée | Aucun quota consommé |
| Autre compte / changement d'IP déclarée | Compte indépendant / aucun contournement du même compte |
| Configuration invalide | Démarrage refusé |
| Refus dans l'interface | Projet conservé, délai visible et réessai explicite seulement |

Les douze cas dédiés réussissent localement. Deux parcours communs sont également
exécutés sur PostgreSQL : fenêtres partagées et concurrence. La simulation DOM du
refus 429 complète les contrôles de l'API.

Voir [le contrat opérateur et les limites](../application/docs/LIMITATION_CANDIDATURES.md),
[les tests](../application/backend/tests/test_application_rate.py) et
[la PR nº 47](https://github.com/cosscoll/UnCoupdePouce/pull/47).

## Limites

F42 demeure partiel : création de comptes multiples, masse de requêtes invalides,
spam de messages, sanctions/recours et charge réelle restent ouverts. Les seuils
commerciaux ne sont pas approuvés. Aucun test sur appareil réel ni rendu navigateur
n'est revendiqué. La matrice conserve 92 exigences, dont 38 encore à réévaluer.

## CI et livraison

La [CI complète](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41419774001)
réussit : **238 tests Python SQLite/PostgreSQL et 95 tests DOM/worker** (92 DOM et
3 worker), sur la révision `3ca424f627410ab8f9080ebc5fd687afe60c8165`.
Le commit applicatif fusionné est `5c7c0a30e826e9475dd37d8dc013ccd6d6236af8`.
Le lot ajoute douze cas dédiés, deux parcours PostgreSQL et un scénario DOM.

Le déploiement `dpl_GnJt53DYL6KVXcc7zPTYpxuyZkmp` est `READY`, au même commit
applicatif, sur la préproduction privée. La vitrine réussit ses contrôles statiques
et ses 55 tests JavaScript.

## Contrôle HTTPS nominal réussi

Un compte professionnel fictif a envoyé une candidature ; son doublon renvoie 409
sans nouvelle candidature ni notification. Le retrait puis la clôture du projet
fictif réussissent. Le JavaScript servi correspond exactement aux sources.
Voir [la preuve synthétique](qa/cadence-candidatures-2026-11-02.json).

Le quota distant n'a pas été épuisé pour ce contrôle nominal. Les preuves du 429,
des délais, des fenêtres et de la concurrence viennent des tests d'intégration
SQLite/PostgreSQL, et non d'un test de charge de la préproduction.
