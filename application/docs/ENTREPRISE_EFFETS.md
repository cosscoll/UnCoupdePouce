# Entreprise : effets et limites des profils liés — 3 novembre 2026

Le modèle actuel reste une simulation : **un seul compte gestionnaire**, des profils
artisan liés sans identifiants personnels, aucun abonnement ou paiement réel.
Ce lot ne décide ni unité tarifaire commerciale ni organisation d'une équipe nominative.

## Désactivation et réactivation

Avant la confirmation, Mon entreprise explique les effets de l'action. Une
désactivation retire les candidatures encore en attente et bloque les messages
des candidatures sélectionnées du profil. La sélection reste dans l'historique.

Dans la même transaction que l'état du profil :

- Le gestionnaire reçoit `linked_profile_paused` ou `linked_profile_resumed`.
- Le demandeur d'une candidature retirée reçoit `application_withdrawn`.
- Pour une candidature sélectionnée sur un projet non clôturé, le demandeur reçoit
  `linked_conversation_paused` ou `linked_conversation_changed`.

La réactivation **ne recrée pas les candidatures retirées**. Elle ne garantit pas
l'ouverture du chat : approbation, accès de test, états du projet et des participants
restent vérifiés par le serveur. Les projets déjà clôturés ne reçoivent pas de
nouvelle alerte de conversation. Les messages génériques ne contiennent ni alias,
coordonnées, motif privé ni contenu de conversation.

Les notifications sont internes à UCP, sans email, push ou tâche planifiée. Leur
historique ne constitue pas un droit d'accès actuel. Un refus, une cible étrangère
ou un réessai sans changement ne crée aucune nouvelle notification. La répétition
d'un état reste un `409`, comme dans le contrat existant.

## Cohérence et audit

Création de l'entreprise, changement de profil, retraits et notifications utilisent
les transactions autorisées existantes. La création de l'entreprise est désormais
journalisée sous `create_lab_enterprise`, sans recopier son libellé. Une erreur
d'audit n'est plus confondue avec un doublon : la transaction est annulée et l'erreur
reste générique. Un index lié/statut facilite la lecture des candidatures concernées ;
il est créé après la migration de la colonne, sans suppression de données.

Un échec de notification ou d'audit annule ensemble état, retraits et nouvelles
notifications. Les transitions concurrentes vers le même état ne produisent qu'un
changement et ses notifications. Le contrôle s'applique également sur PostgreSQL.

## Vérifications et limites

`tests/test_enterprise_effects.py` couvre les deux parties, retraits, sélection
historique, clôture, répétition, réactivation sans accès de test, refus, concurrence
et rollback des deux transitions. Le parcours commun est repris sur PostgreSQL.
Les tests DOM vérifient confirmation, annulation et explication de la réactivation.

Ne sont pas livrés : identité juridique propre à l'entreprise avec établissements
SIRET, invitations et utilisateurs nominatifs, rôles d'équipe, facturation réelle,
procédure commerciale d'annulation ou politique définitive de sanctions/recours.
Les effets existants ne valent pas acceptation de ces règles. Recette visuelle,
appareils et charge réelle restent ouverts.
