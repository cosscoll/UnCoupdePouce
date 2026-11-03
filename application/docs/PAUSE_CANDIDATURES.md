# Mettre les nouvelles candidatures en pause

Depuis le détail de son projet encore ouvert, le demandeur peut **mettre les
candidatures en pause**, puis les rouvrir après confirmation explicite. La pause
concerne la réception de nouvelles candidatures. Elle ne supprime pas le projet,
ne retire pas les candidatures reçues et ne change pas les droits des échanges
existants. Le demandeur peut encore examiner et sélectionner un candidat reçu.

Pendant la pause :

- le projet disparaît de la recherche professionnelle, y compris des recherches
  enregistrées ; les favoris gardent seulement leur référence et deviennent
  indisponibles sans restituer le contenu ;
- les nouvelles candidatures individuelles et via profil lié sont refusées par
  le serveur, même depuis une ancienne page ouverte ;
- le professionnel déjà candidat retrouve la pause dans son suivi et peut encore
  retirer une candidature en attente ; son état n’est pas transformé en refus ;
- les candidats en attente ou sélectionnés reçoivent chacun une notification
  interne. Les destinataires sont dédupliqués par compte.

La réouverture recalcule la visibilité selon les droits actuels. Une annonce en
modération ne peut pas être rouverte par ce bouton. Une sélection qui termine la
réception, ou la clôture, efface le marqueur de pause. Un projet sélectionné ou
clôturé n’offre pas de réouverture par ce mécanisme. Dans l’hypothèse de laboratoire
à sélection multiple, une pause ne bloque pas un échange déjà autorisé.

La **clôture** demeure une action distincte et définitive dans cette version :
les candidatures en attente sont refusées, les échanges deviennent inaccessibles
et les professionnels concernés sont informés. L’annulation distincte du projet
et ses éventuelles règles commerciales restent à définir.

## Contrat serveur

`POST /api/projects/{id}/application-intake` reçoit `paused` (booléen strict) et
`version` (entier strict positif ou nul). Le propriétaire authentifié, son rôle,
le CSRF, l’état du projet et la révision sont revérifiés dans la transaction.
Un état déjà appliqué ou une ancienne révision donne 409, sans notification ni
écriture supplémentaire. Le détail, la liste propriétaire et l’export personnel
contiennent `applications_paused` et `intake_version`.

La mise à jour de l’état et de la révision, les notifications et l’audit sont
atomiques. Un échec de notification ou de journal annule le lot. Une pause et une
candidature concurrentes sont sérialisées : soit la candidature est reçue avant
la pause et le candidat est informé, soit elle est refusée après la pause.

Cette révision concerne la réception des candidatures ; elle ne versionne pas le
contenu de l’annonce. Aucun paiement, email ou changement d’abonnement n’est activé.
Les tests serveur/DOM et HTTPS ne remplacent pas une recette sur appareils réels.
