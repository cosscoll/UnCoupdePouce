# Navigation et orientation clavier — 2 novembre 2026

Périmètre : améliorations techniques F88/F91 de l'interface existante. Le navigateur
de contrôle est bloqué par l'authentification HTTP Basic avant le parcours : aucune
capture utilisable n'a été produite. Ce document décrit des contrôles du code et
simulations d'interaction, pas un audit visuel achevé.

| Étape | Contrôle | Résultat disponible |
| --- | --- | --- |
| 1 | Menu ouvert/fermé, section courante, attributs accessibles et Échap | Simulations DOM |
| 2 | Navigation réussie, échec de sauvegarde et réponse tardive | Simulations DOM ; saisie conservée en cas d'échec |
| 3 | Entrée dans un dialogue, remplacement de contenu, retour au déclencheur et confirmation | Simulations DOM du focus |
| 4 | Étapes de création, lecture d'un projet et titre d'onglet après déconnexion | Code et simulations DOM |
| 5 | Huit paires de couleurs définies dans le CSS | Calcul RGB ; seuils choisis atteints |
| 6 | Écrans étroits, zoom, clavier et lecteur d'écran réels | Non validés ; capture bloquée |
| 7 | Téléphones et installation Android/iPhone | Non effectués |

Le menu se replie après une navigation réussie, mais reste ouvert quand la sauvegarde
du brouillon empêche de quitter. Un résultat ancien ne peut pas reprendre le focus
d'une page plus récente. Les dialogues retrouvent leur déclencheur ou, s'il a disparu,
le titre courant. La page complète n'est plus annoncée comme une unique région vive.

Les styles corrigent la hauteur fixe d'un en-tête susceptible de se répartir sur
deux lignes, bornent la navigation dépliée et augmentent plusieurs cibles à 44 pixels.
Les textes indicatifs passent de la couleur `#767687` (rapport calculé 4,46 sur blanc)
à la couleur secondaire `#626477` (5,82 sur blanc). Les nouvelles bordures présentent
un rapport calculé de 3,54 sur blanc. Ces calculs ne valent pas validation de toutes
les couleurs et de tous les états de l'application.

Voir [le contrat détaillé](../application/docs/NAVIGATION_ACCESSIBILITE.md) et
[la preuve de couleurs](qa/navigation-couleurs-2026-11-02.json).

## Livraison vérifiée

La [PR nº 44](https://github.com/cosscoll/UnCoupdePouce/pull/44) est fusionnée au commit
`76644b62436e1e172cc41ef0c4f63996c2e567aa`. La
[CI de la dernière révision](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41413700156)
réussit : **198 tests Python et 86 tests DOM/worker** (83 DOM et 3 worker),
dont dix nouveaux scénarios d'interface. Une confirmation lente conserve désormais
le dialogue ouvert entre-temps et ne lui reprend pas le focus.

Le déploiement applicatif `dpl_D5gKfwuVat45JRPERnUhmGhz1wWR` est `READY`.
Un contrôle HTTPS indépendant, sans connexion à un compte applicatif, retrouve
les attributs attendus du menu et des fichiers `app.js` et `style.css` strictement
identiques aux sources fusionnées (comparaison des octets et SHA-256).
Voir [la preuve de livraison](qa/navigation-livraison-2026-11-02.json).

Ces preuves ne ferment pas la recette visuelle F88/F91 : le rendu sur petits écrans,
le zoom 200 %, le clavier natif, le lecteur d'écran et les appareils réels restent
non validés. Les 39 exigences encore à réévaluer dans la matrice restent ouvertes.
