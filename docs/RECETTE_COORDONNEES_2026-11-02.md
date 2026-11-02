# Filtre de coordonnées Unicode — recette du 2 novembre 2026

Le lot corrige un contournement reproduit du garde de coordonnées avant sélection.
Il ne constitue pas une acceptation complète des exigences F39/F42.

## Avant/après démontré

Sur la base `4f3524313db7c2d826f9a0f77ee70eaffa5add48`, la première exécution
des nouveaux tests donne **5 échecs et 4 succès** : emails avec arobase pleine largeur,
chiffres/URL pleine largeur, création d'annonce et diffusion d'une ancienne annonce.
Après correction et ajout des scénarios complémentaires, **11 cas dédiés réussissent**.
Les sept variantes de coordonnées sont refusées ; la prose sûre conserve sa forme.

Les tests d'entrée couvrent création et modification d'annonce, publication de
brouillon, nom de compte, zone d'intervention et présentation professionnelle.
Les tests de lecture couvrent recherche, détail, candidature et favori d'une ancienne
annonce. Un parcours PostgreSQL reprend ce dernier contrôle.

Le détail utilise le calcul partagé de découverte dans sa transaction courante.
Aucun champ ni schéma de base n'est modifié.

Voir [le contrat et les limites](../application/docs/COORDONNEES_AVANT_SELECTION.md),
[les tests](../application/backend/tests/test_contact_normalization.py) et
[la PR nº 46](https://github.com/cosscoll/UnCoupdePouce/pull/46).

## Avancement du cahier des charges

F42 reçoit désormais une conclusion partielle explicite : doublons serveur et filtre
de coordonnées présents ; cadence/masse de candidatures, sanctions et recours non
livrés ou non validés. **38 exigences restent à réévaluer**, sur les 92 de la matrice.
Ce décompte n'est ni un pourcentage d'achèvement ni une nouvelle acceptation complète.

Les anciens profils ne sont pas audités exhaustivement, les images ne sont pas
analysées par OCR et le filtre ne reconnaît pas toutes les obfuscations ou coordonnées
internationales. Aucune recette visuelle ou sur appareil réel n'est revendiquée.

## Livraison et contrôles automatisés

La [CI complète](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41417924830)
réussit : **224 tests Python SQLite/PostgreSQL et 94 tests DOM/worker**.
Elle porte la révision `86a1bd6adadd5fcd0f6d44bb97e160d1d8426b9d`.
Le commit fusionné est `37fc720bfea352293b56dbe295a091a33fe4ee1e` ; le déploiement
`dpl_681bovVmqEbukvCMd7QLJti1uYu7` est `READY` sur ce même commit.
La vitrine réussit ses contrôles statiques et ses 55 tests JavaScript.

## Recette HTTPS réussie

Sur la préproduction déployée, trois groupes de contrôles réussissent : refus des
emails/téléphones/URL Unicode ; conservation exacte d'un projet fictif valide après
une modification rejetée ; brouillon privé non publiable avec ces coordonnées.
Le projet de test est clôturé et le brouillon de test supprimé.
Voir [la preuve synthétique](qa/coordonnees-unicode-2026-11-02.json).
Ces appels API ne constituent pas une recette navigateur ou sur téléphone.
