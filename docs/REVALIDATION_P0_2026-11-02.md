# Réévaluation des exigences critiques — 2 novembre 2026

Périmètre : préproduction privée UCP, données fictives. Base de départ `cea0128`.
Vingt et une exigences auparavant « à réévaluer » reçoivent une conclusion précise,
des preuves de tests et leurs limites. Elles comprennent dix-neuf P0 et deux P1.
Les 92 exigences restent dans la matrice, dont 39 encore « à réévaluer » après ce lot.
Ces nombres mesurent la couverture de cette réévaluation, pas des fonctions terminées.

Les identifiants et tests exacts figurent dans
[le manifeste](qa/revalidation-2026-11-02.json) et
[la matrice](MATRICE_ACCEPTATION_CDC.md). Le contrôle porte sur comptes et états,
photos, projets, candidatures, catalogue/matching, messagerie, révocations et
distinction entre autorisation de test et vérification professionnelle réelle.

## Écart corrigé

Avant correction, `GET /api/v4/photos/{id}` accordait au rôle administrateur une
exception générale aux contrôles de propriétaire/sélection. Le test de régression
qui exige un refus sans dossier motivé échoue sur cette version : réponse 200.

La lecture administrative exige maintenant un dossier de projet précis et ouvert,
déjà examiné avec motif par le même administrateur. L'interface affiche les seuls
liens de photos du projet après cet examen, sans les télécharger automatiquement.
Chaque lecture vérifie de nouveau la portée du dossier et écrit deux traces liées,
photo et dossier, dans la même transaction avant restitution. Une clôture de dossier
retire l'accès par son lien. Un échec d'audit ne restitue pas l'image.
Voir [le contrat de modération](../application/docs/MODERATION_PHOTOS.md).

Les accès propriétaire et professionnel sélectionné conservent leurs contrôles.
Deux messages d'erreur auparavant formulés « non vérifié » parlent désormais
d'autorisation pour les tests, sans laisser entendre qu'une simple approbation
administrative vérifierait une société ou ses assurances.

## Contrôles

La suite de référence est rejouée localement le 2 novembre avant correction :
181 tests Python réussis, 12 PostgreSQL réservés à la CI et 75 tests DOM/worker.
Les nouveaux scénarios couvrent l'absence de dossier, le mauvais projet, le rôle,
l'identité de l'administrateur ayant examiné le dossier, sa clôture et l'échec de
la trace. Le scénario partagé couvre également PostgreSQL. Les tests existants de
photos, signalements et droits du chat restent inclus dans les contrôles.

Le nouveau test DOM vérifie la demande de motif avant apparition des liens, leur
rattachement au dossier et l'absence de lecture automatique des photos.

La [CI 41409762758](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41409762758)
réussit **198 tests Python et 76 tests DOM/worker**, avec PostgreSQL 17 et restauration
isolée. Les 24 tests API ciblés de photos, modération et parcours existants réussissent
également après correction. La [pull request 43](https://github.com/cosscoll/UnCoupdePouce/pull/43)
est fusionnée au commit applicatif `01ad1c7`.

## Recette HTTPS

Quatre groupes de contrôles réussissent sur la préproduction : propriétaire autorisé
mais rôle admin seul insuffisant ; examen motivé avec CSRF, dossier exact et trace
de consultation ; refus après clôture du dossier avec accès propriétaire conservé ;
liens contextualisés présents dans l'interface effectivement publiée.

Un projet et une photo entièrement fictifs sont créés pour ces contrôles. Le dossier
est résolu et le projet est clôturé en fin de recette. Aucun ancien projet ou dossier
n'est modifié. Les identifiants privés restent hors du dépôt. Les interactions de
navigateur et le rendu visuel ne sont pas déduits des requêtes API ou du code livré.

Le commit applicatif `01ad1c7` est READY sur le projet privé `ucp-preproduction`.
Les contrôles statiques et les 55 tests de la vitrine réussissent après sa mise à
jour du 2 novembre.

## Conclusions qui restent partielles

Les comptes nominatifs d'entreprise, les pièces jointes de chat, les liens temporaires,
la vérification officielle des sociétés/assurances, les paiements et règles métier
D01–D13 ne sont pas déclarés livrés. Le filtrage géographique reste fondé sur les
communes déclarées. Les 21 lignes ne sont pas transformées en acceptations globales.

Les recettes mobile, installation sur appareils, accessibilité complète, charge et
restauration du projet Neon distant restent ouvertes. Les tests DOM/API ne constituent
pas une recette visuelle réelle ni un audit de sécurité externe.
