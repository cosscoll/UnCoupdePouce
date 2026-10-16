# Vérification de la vitrine UCP — 14 octobre 2026

## Exécuté avec succès

- Génération de cinq pages : accueil FR, projet FR, présentation EN, informations/confidentialité et 404.
- 368 assertions structurelles réparties sur les pages : titres H1 uniques, langues, métadonnées, labels, contrôles ARIA, chemins locaux, ressources et ancres.
- Présence des ressources CSS, des polices locales et de l’image Open Graph ; SVG bien formés.
- Huit paires principales de couleurs dépassent le contraste 4,5:1. Le détail numérique est dans `qa-static.json`.
- Syntaxe des deux scripts JavaScript contrôlée avec Node.
- Les 36 combinaisons type de projet / maturité / horizon génèrent un texte cohérent et exportable.
- Entrées inconnues, chaînes HTML et noms de propriétés de prototype remplacés par un scénario sûr.
- L’altération d’une liste d’un brief ne modifie pas les générations suivantes.
- Logo original et illustration architecturale examinés en rendu PNG, ainsi que la carte de partage 1200 × 630.
- Pas d’appel API, de stockage local, de code exécuté depuis une saisie ou d’injection HTML dans les scripts applicatifs.

## Limites explicitement conservées

Le navigateur prévu par la procédure Sites n’est pas disponible dans cet environnement. Aucun serveur de prévisualisation ou autre navigateur n’a été lancé pour contourner cette limite.

Un aperçu de l’en-tête et du premier écran, fourni par l’hébergement après publication, a été inspecté : la typographie et les illustrations sont chargées. Une étiquette coupée dans le visuel et des retours à la ligne peu élégants ont été corrigés. Cela ne remplace pas une recette interactive. Le rendu des pages complètes, les interactions réelles du navigateur, les tailles mobiles, le zoom 200 %, le lecteur d’écran, Lighthouse et les Core Web Vitals n’ont donc pas été mesurés. Les adaptations CSS, le focus, les onglets clavier et la réduction de mouvement sont implémentés, mais leur présence ne constitue pas une recette visuelle réussie.

Aucune vérification de délivrabilité du contact Gmail n’a été effectuée et aucun message n’a été envoyé. La démonstration ne constitue ni une intégration Claude ni une connexion à l’application UCP.

La première publication est privée. La vérification HTTP après déploiement, si possible, est consignée séparément. Une URL privée n’est pas une preuve d’accessibilité publique ni d’indexation SEO.
