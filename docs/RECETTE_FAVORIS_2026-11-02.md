# Favoris privés — recette du 2 novembre 2026

F37 progresse avec une liste de références privées par professionnel. Ce document
distingue les contrôles automatisés et HTTPS de la recette visuelle, toujours ouverte.

| Parcours | Preuve attendue |
| --- | --- |
| Ajouter une mission et réessayer après réponse perdue | Une référence unique, aucune candidature ou notification au demandeur |
| Retrouver ses favoris depuis une nouvelle session | Persistance serveur et contenu recalculé selon les droits actuels |
| Changer de zone ou désactiver le profil lié correspondant | Projet indisponible sans titre, description, coordonnées ni photo |
| Masquer/clôturer le projet ou suspendre son propriétaire | Aucun contenu restitué ; retrait privé encore possible |
| Lire/supprimer depuis un autre compte | Aucune liste d'autrui ; aucun retrait de son favori |
| Dépasser cinquante références ou ajouter en concurrence | Quota et unicité atomiques ; réessai de l'existant autorisé |
| Échec de journalisation | Opération annulée intégralement |
| Session révoquée entre authentification et opération | Lecture/écriture refusée |
| Erreur réseau ou réponse tardive côté interface | État conservé pour réessai ; aucune page plus récente remplacée |

Voir [le contrat détaillé](../application/docs/FAVORIS.md),
[les tests API](../application/backend/tests/test_project_favorites.py) et
[la PR nº 45](https://github.com/cosscoll/UnCoupdePouce/pull/45).

L'export propriétaire contient seulement les références et dates enregistrées.
Les recommandations IA et les alertes automatiques restent absentes. F37 demeure
partiel ; les 39 exigences encore à réévaluer ne sont pas déclarées acceptées.

## Limites de recette

Aucun rendu navigateur, lecteur d'écran, zoom ou appareil réel n'est validé ici.
Le navigateur de contrôle reste bloqué par l'authentification HTTP Basic. Les
simulations DOM ne mesurent pas la mise en page ni le comportement d'un téléphone.

## Résultats automatisés et déploiement

La [CI du lot favoris](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41415631354)
réussit sur la révision `2e67728fc47af84bb423398a8a86d1c61239f2c0` :
**212 tests Python SQLite/PostgreSQL et 94 tests DOM/worker** (91 DOM et 3 worker).
Le lot ajoute treize cas API SQLite, un parcours PostgreSQL et huit scénarios DOM.
La vitrine réussit ses contrôles statiques et ses 55 tests JavaScript.

Le commit applicatif fusionné est `1c2d773520d3a33288f139ad28ae3361ad809e77`.
Le déploiement Vercel `dpl_Cws6JUJU6sUoyRHJhrh1SEoAkpiK` est `READY` et porte
ce même commit sur la préproduction privée.

## Recette HTTPS fictive réussie

Trois groupes de contrôles sont réussis sur le service déployé :

1. Ajout et réessai sans doublon ; aucun favori ni export d'autrui ; aucun effet sur
   les candidatures et notifications du demandeur.
2. Clôture d'un second projet : aucun contenu dans le favori devenu indisponible ;
   nouvel ajout refusé et retrait idempotent encore possible.
3. Reconnexion dans une nouvelle session : favori de démonstration conservé, état
   retrouvé dans la recherche et JavaScript servi strictement identique aux sources.

Voir [la preuve synthétique](qa/favoris-2026-11-02.json). Les comptes, projets et
textes sont fictifs. Un favori de démonstration reste visible pour le professionnel
de test ; le projet servant au contrôle de clôture est fermé et retiré des favoris.
Aucune recette visuelle n'est déduite de ces appels API.
