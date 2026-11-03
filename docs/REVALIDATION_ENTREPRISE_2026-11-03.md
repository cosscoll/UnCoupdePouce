# Entreprise : réévaluation et correctifs — 3 novembre 2026

Sept exigences jusque-là « à réévaluer » reçoivent une conclusion fondée sur le
code et les tests : F41, F43, F52, F53, F54, F55 et F56. Plusieurs conclusions
constatent un manque ou un arbitrage, pas une réalisation. La matrice reste de
92 exigences historiques, dont **30 encore à réévaluer**. Aucun pourcentage
d'achèvement et aucune nouvelle acceptation complète ne sont déduits de ce décompte.

| ID | État constaté | Preuve et limite |
| --- | --- | --- |
| F41 | Partiel renforcé | Notifications de sélection/refus/clôture existantes ; désactivation/réactivation liée maintenant expliquée avant confirmation et aux deux parties. Annulation distincte et règles commerciales non livrées |
| F43 | Partiel | `UNIQUE(project_id,professional_id)` empêche les doublons du même gestionnaire via plusieurs profils ; comptes nominatifs rattachés non livrés |
| F52 | Identité distincte non livrée | `enterprise_accounts` possède libellé et propriétaire. SIREN rattaché au profil du gestionnaire ; pas d'identité juridique propre ni établissements SIRET ou vérification officielle |
| F53 | Partiel | Le gestionnaire voit et active ses profils liés. Ce ne sont ni des utilisateurs authentifiés ni une vue d'administration nominative des rôles/droits |
| F54 | Arbitrage ouvert | Calcul option A simulé par profils actifs, gestionnaire inclus seulement après activation explicite. Unité commerciale non approuvée ; aucun contrôle anti-partage nominatif ou paiement |
| F55 | Non livré | Aucun identifiant salarié, invitation, rôle d'équipe ou siège opérationnel nominatif. Un seul compte de connexion |
| F56 | Partiel | Le gestionnaire candidate et suit les échanges via ses profils liés, sous droits serveur. L'organisation réelle du travail hors plateforme et le modèle multi-utilisateurs ne sont pas contrôlés |

## Écarts corrigés

La désactivation retirait les candidatures en attente et bloquait le chat sans
notification explicite aux demandeurs concernés. La création d'entreprise n'écrivait
aucune trace d'audit. Les nouveaux tests reproduisent ces écarts : **trois échecs et
un succès** sur la base `e93c2f897c0bf4881ae07bdbcf54cec9ce584566`.

Le lot ajoute confirmation, notifications internes atomiques, journal de création
et refus sans effet. Une réactivation ne rétablit ni candidature retirée ni droit
de chat absent. Le libellé des profils actifs est corrigé pour ne pas évoquer une
facturation réelle. Les montants restent la simulation historique, sans décision
tarifaire nouvelle.

Voir [contrat et limites](../application/docs/ENTREPRISE_EFFETS.md).

## Sources de vérification

- `backend/tests/test_lab_api.py` : création réservée au professionnel autorisé,
  quantité simulée, gestionnaire artisan explicite, profils inactifs, isolation
  des entreprises, export propriétaire et unicité de candidature.
- `backend/tests/test_enterprise_effects.py` : notifications et effets des deux
  transitions, audit, transactions annulées, répétition et concurrence.
- `backend/tests/test_postgres.py` : parcours des effets repris dans un schéma
  PostgreSQL fictif isolé.
- `qa/frontend.test.cjs` : contenu de la confirmation, annulation et absence de
  promesse de restauration automatique du chat.

Les tests ne valent pas recette sur appareils réels ou audit juridique. Invitations,
paiements, vérification légale et politique commerciale restent ouverts.
