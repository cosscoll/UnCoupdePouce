# Profils historiques — recette du 2 novembre 2026

Le lot complète le contrôle des nouvelles saisies par une protection lors de la
restitution des anciennes données à un autre compte. Aucune migration ou suppression
des données privées du propriétaire n'est effectuée.

## Régression reproduite

Sur la base `04a1f21c4106e98d8e160c0e8d36bad1a8b7be33`, les neuf premiers tests
échouent : noms, communes, zones, métiers et alias d'anciennes candidatures ; trois
champs de présentation ; noms/titres dans les en-têtes. Ils utilisent uniquement
des coordonnées fictives en `.test`.

Après correction et ajout d'un cas de zone liée, les dix cas dédiés vérifient le
masquage sans perte pour le propriétaire. La suite ciblée comprend 22 tests réussis :
profils historiques, comparatif, présentations et suivi de candidature. Un parcours
PostgreSQL reprend les noms, titres, vues privées et conversations verrouillées.
Deux nouveaux scénarios DOM vérifient l'explication du masquage et la présentation
indisponible.

| Parcours | Résultat attendu |
| --- | --- |
| Ancien champ sensible dans une candidature | Champ masqué ou valeur retirée, état et identifiant conservés |
| Carte et comparatif | Explication du masquage, sans badge de vérification inventé |
| Ancienne présentation sensible | 404 générique, aucune introduction/réalisation restituée |
| Correction par le propriétaire | Valeurs privées conservées, version contrôlée, présentation consultable après correction |
| Suivi des candidatures et en-têtes | Pas de coordonnées détectables par le filtre actuel |
| Conversation verrouillée | Les en-têtes ne contournent pas le verrou ; messages refusés |
| Autre demandeur ou professionnel | Autorisations existantes conservées |

Voir [le contrat et ses limites](../application/docs/PROFILS_PUBLICS_HISTORIQUES.md),
[les tests API](../application/backend/tests/test_legacy_public_profiles.py) et
[la PR nº 48](https://github.com/cosscoll/UnCoupdePouce/pull/48).

## Limites

Les motifs de coordonnées restent non exhaustifs ; aucun OCR ou audit externe
n'est livré. Les données autorisées de modération, messages et exports propriétaires
gardent leur périmètre distinct. Aucun rendu navigateur, zoom, lecteur d'écran ou
appareil réel n'est validé. F15/F35/F39 demeurent partiels ; 38 exigences restent à
réévaluer sur les 92 de la matrice.

## CI et livraison

La [CI complète](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41425945268)
réussit : **249 tests Python SQLite/PostgreSQL et 97 tests DOM/worker** (94 DOM et
3 worker), sur la révision `1d59f181a5ec08210b1a76b039b6358137297717`.
Le commit applicatif fusionné est `c4a848f8e0563f3330022d3b586589df9dda6c74`.
Le lot ajoute dix cas dédiés SQLite, un parcours PostgreSQL et deux scénarios DOM.

Le déploiement `dpl_HK1HjoYAika7wN7d6NLAGYtBTFKt` est `READY`, sur ce même
commit applicatif. La vitrine réussit ses contrôles statiques et ses 55 tests
JavaScript.

## Contrôles HTTPS réussis

Les lectures autorisées de la candidature et de la présentation fictives réussissent.
Le profil privé et la présentation du propriétaire restent identiques après ces
lectures. Les accès avec le rôle professionnel ou sans session applicative sont
refusés. Le JavaScript servi correspond strictement aux sources.
Voir [la preuve synthétique](qa/profils-historiques-2026-11-02.json).

Aucune donnée ancienne sensible n'a été injectée dans la base distante pour ce
contrôle en lecture seule. Le masquage des noms et en-têtes est vérifié sur SQLite/PostgreSQL ; celui des
présentations et leur reprise après correction sont vérifiés sur SQLite. Ces appels
HTTPS vérifient le parcours
nominal et les refus d'accès. Aucun rendu visuel n'en est déduit.
