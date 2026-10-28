# Alertes de statut — recette du 28 octobre 2026

Périmètre : F79 et documentation partielle de F81, préproduction privée fictive.
Six événements complètent les alertes de candidature, message et assistance :
autorisation professionnelle de test, activation de l'accès de test, retrait de
l'autorisation, nouvelle revue après modification du profil, suspension et levée
de suspension du compte. Aucun paiement ou abonnement réel n'est créé.

Les messages sont génériques, sans motif privé de modération, coordonnées ou
contenu de conversation. Ils précisent le périmètre des droits de test et ne
promettent aucune certification ni ouverture inconditionnelle d'une conversation.

## Validation automatisée

`test_notification_events.py` couvre les transitions réelles, les répétitions,
l'absence d'alerte lors d'une action refusée, la confidentialité par destinataire,
la révocation des sessions et le maintien des autres restrictions après restauration.
Cinq simulations d'échec d'insertion contrôlent le rollback des états, sessions,
notifications et audits pour l'autorisation, l'activation, les deux suspensions et
la modification de profil. Un scénario partagé exécute aussi le cycle de vie dans
un schéma PostgreSQL isolé en CI.

Les tests historiques sont adaptés aux alertes désormais présentes : ils vérifient
que le professionnel reçoit sa propre autorisation sans recevoir la candidature
destinée au demandeur ; la lecture globale et l'export incluent ses nouvelles alertes.

## Limites

Les notifications sont internes et consultées explicitement. Un compte suspendu
n'a pas accès à son centre ; ses événements restent consultables après levée de la
suspension et reconnexion. Les anciennes sessions ne sont jamais réactivées.
Les réessais ne dupliquent pas l'alerte tant que l'état ne change pas ; un nouveau
cycle légitime produit un nouvel événement. Aucune validation de navigateur réel,
d'email, de push, d'abonnement commercial ou des 17 événements historiques complets
n'est déduite de ces contrôles.
