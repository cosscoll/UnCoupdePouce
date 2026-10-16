# Un Coup de Pouce — Vitrine de présentation

Site statique français et anglais, distinct du laboratoire MVP et de l’application d’Elias. Aucun outil de collecte ni appel d’API. Le brief repose sur des règles locales.

## Source et compilation

- `build.py` génère les cinq pages HTML et les fichiers de politique d’indexation.
- `dist/assets/style.css` contient la mise en page et les adaptations mobiles.
- `dist/assets/app.js` gère le menu, les onglets, le presse-papiers et le téléchargement.
- `dist/assets/brief.js` contient les quatre scénarios de préparation.
- `dist/assets/logo.svg` reprend exactement le logo original de la charte officielle UCP Ydays, page 5.
- `docs/` contient la provenance éditoriale, le résultat des contrôles et les points restants.

Générer : `python3 build.py`. Vérifier : `python3 scripts/check_site.py` puis `node --test tests/brief.test.cjs`.

Les fichiers prêts à servir se trouvent dans `dist`. Aucun gestionnaire de paquets ni installation n’est requis. Les polices sont hébergées localement ; licences dans `dist/assets/fonts`.

## Publication

Cette première publication est privée. `noindex` et `robots.txt` complètent, sans remplacer, le contrôle d’accès de l’hébergement.

Pour une diffusion publique : confirmer le domaine exact et l’adresse professionnelle, compléter l’identification de l’éditeur et les mentions d’hébergement, contrôler le rendu et les parcours en navigateur, adapter l’origine dans `build.py`, retirer les règles `noindex`, générer le sitemap et déployer. Ces étapes n’imposent pas d’affirmer une immatriculation inexistante.

Le site n’active aucune offre commerciale. L’ouverture de la plateforme, le lancement de campagnes et l’intégration Claude font l’objet de travaux séparés. La candidature Anthropic n’a pas été envoyée.

Ne pas remplacer les mentions de fonctions envisagées par des affirmations opérationnelles sans vérification. Aucun badge partenaire, avis, statistique commerciale ou certification fictive ne doit être ajouté.

## Tests à effectuer dans un navigateur

Vérifier 320, 375, 390, 768, 1024 et 1440 px ; zoom 200 % ; parcours clavier ; menu mobile et touche Échap ; onglets avec flèches ; les quatre types de brief ; copie acceptée et refusée ; téléchargement ; FAQ ; liens e-mail ; page anglaise ; page introuvable ; absence de débordement. Aucun de ces contrôles visuels n’est revendiqué sans preuve d’exécution.
