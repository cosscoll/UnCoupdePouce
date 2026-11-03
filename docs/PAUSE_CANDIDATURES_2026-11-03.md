# UCP — pause de réception des candidatures, 3 novembre 2026

## Fonctionnement développé — publication en attente

Le particulier ouvre un projet encore ouvert et choisit « Mettre les candidatures
en pause ». La confirmation explique la disparition de la recherche, le refus des
nouvelles candidatures et la conservation des candidatures reçues. Il peut ensuite
choisir « Rouvrir les candidatures ». La clôture reste une action distincte.

Le professionnel déjà candidat voit l’information dans « Mes candidatures » et
reçoit une notification interne. Une candidature en attente peut encore être
retirée ou sélectionnée par le propriétaire. Une pause ne donne pas accès à une
conversation : les autorisations existantes restent contrôlées par le serveur.

## Droits et intégrité

- Recherche, recherches enregistrées et favoris recontrôlent la visibilité.
  Un favori indisponible ne restitue pas le contenu du projet.
- Une ancienne page ne permet pas de contourner la pause : les candidatures
  individuelles et via profil lié sont refusées côté serveur.
- Seul le propriétaire peut changer la réception, avec session et CSRF valides.
  La réouverture ne contourne pas la modération.
- Une ancienne révision ou une répétition est refusée sans effet supplémentaire.
  Une pause concurrente avec une candidature est sérialisée : soit le candidat
  est enregistré avant la pause et informé, soit son envoi est refusé.
- État, révision, notifications et audit partagent la même transaction ; un échec
  du journal ou d’une notification annule le lot.

## Avancement du cahier des charges

F18 est réévaluée comme **partielle** : la pause des nouvelles candidatures et la
clôture sont développées, avec leurs effets explicites. L’annulation distincte et
la suspension complète du projet ne sont pas livrées. F13 décrit maintenant le
marqueur de pause dans le suivi propriétaire. Aucun pourcentage de conformité
n’est déduit et aucune acceptation complète supplémentaire n’est accordée.
**29 des 92 exigences restent à réévaluer** après ce lot.

## Vérifications du code

Treize scénarios serveur dédiés couvrent le cycle pause/reprise, les droits,
les doublons, les favoris, les deux routes de candidature, la sélection, la clôture,
la modération, les transactions annulées et deux types de concurrence.
Trois scénarios sont repris dans PostgreSQL. Cinq nouveaux scénarios DOM couvrent
les confirmations, la révision envoyée, le conflit, le suivi professionnel et
l’absence de commandes de réception sur un projet sélectionné ou fermé.

Les protections d’accès privées, les comptes demandés par le propriétaire et les
règles commerciales restent inchangés. Aucun paiement ou email n’est activé.
La recette visuelle des écrans connectés et les tests sur appareils réels restent
ouverts. Voir [contrat fonctionnel et serveur](../application/docs/PAUSE_CANDIDATURES.md).


## CI réussie et blocage de livraison

La [CI complète](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41655725118)
réussit sur `7ae7392cefed661ef71ede2f9f831104c4991a9d` : **286 tests Python et
126 tests DOM/logique/worker** (120 DOM, 3 logique et 3 worker). Le lot est fusionné
par la [PR nº 54](https://github.com/cosscoll/UnCoupdePouce/pull/54) au commit
`75c3b4f5e5c3f514cf51fcfc3daf11334e405c09`.

Vercel refuse ce déploiement avec le statut « Deployment rate limited — retry in
24 hours. », enregistré le 3 novembre à 14:43:56 UTC. Aucun changement d’offre ou
achat n’a été effectué. Aucun déploiement de ce commit n’a été créé et aucun
contournement de cette limite n’est tenté.

Le déploiement encore associé à `ucp-preproduction.vercel.app` est
`dpl_DYvEah6SxT7zviWhTLdMJGgWYxHn`, `READY` sur le commit
`2f82a071ac26f937fce164d0c306693cc8735c0d`. Il conserve l’application et les accès
existants, sans la nouvelle pause des candidatures. Le contrôle HTTPS de ce nouveau
parcours **n’a pas été exécuté**, afin de ne pas tester par erreur l’ancienne
version. Aucun projet ou candidature de recette supplémentaire n’a été créé.

La vitrine réussit ses contrôles statiques et ses 55 tests JavaScript. Le script de
recette HTTPS est préparé pour la reprise : création d’un projet fictif distinct,
pause/reprise, droits de découverte/favoris, ancienne révision, puis clôture et
retrait du favori de recette. Cette préparation ne vaut pas résultat réussi.
Voir la [preuve structurée](qa/pause-candidatures-2026-11-03.json).
