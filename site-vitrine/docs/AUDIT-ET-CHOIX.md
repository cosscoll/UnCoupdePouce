# Audit et décisions de conception — 14 octobre 2026

## Éléments retrouvés

La recherche a couvert les conversations UCP, les dossiers Google Drive du projet, les huit dépôts GitHub accessibles, les Sites existants et les archives UCP. Aucun dépôt GitHub UCP ni Site UCP existant n’a été identifié. Le nom exact du domaine et l’adresse sur ce domaine ne figuraient pas dans les références consultées. L’ancienne landing hébergée n’a donc pas pu être inspectée en ligne.

Documents prioritaires lus :

- [Charte officielle UCP Ydays 2025–2026](https://drive.google.com/file/d/1JUNQBM5YGn1yWZHIgRg7VeK0WqgdjbP_/view), 17 pages, logo original page 5.
- [Règles d’application de la charte](https://docs.google.com/document/d/1KNiXz2C9oGoV1OEvnYZcmzUACQnSSozOho-VTyb7l6U/edit).
- [Plateforme de marque et messages](https://docs.google.com/document/d/10AVS1EsVH_l2vpHpYOX58ZnrZM3Z_SLg12w5_ATdNPo/edit).
- [Préparation landing et conversion, 13 octobre](https://docs.google.com/document/d/1OcORa33o46PkcjtTFxGkQIMyd4rkAF1MBnddQ3O9yb8/edit).
- [FAQ actuelle](https://docs.google.com/document/d/1F4ZkofNi9mAq086eAKUxBag_Rx3duc6-38NeWrAaXrM/edit).
- [Pilotage, priorités et décisions](https://docs.google.com/document/d/1QDzmDJSY6ymBD_PdmSgH981AukN8ll5eSyD5kNR-qSg/edit).
- [Kit préproduction](https://docs.google.com/document/d/1wDT-tfiHVtQX3lzovZxxGjF-ZqNwcWLVwfk-NaQTN90/edit).
- [Ancienne landing, référence historique](https://docs.google.com/document/d/1H-0DIaK7AwrnHJUukupeNBa0cJ920ABw9JfS1dmU_g4/edit), source de l’adresse de contact du projet `justeuncoupdepouce@gmail.com`. Ce n’est pas l’adresse sur domaine professionnel annoncée par le fondateur, qui reste à fournir.
- Archives `UCP_MVP_v3_5_LIVRABLE.zip` et `UCP_Ydays_Kit_Visuel_Semaines_1-2.zip` : laboratoire local et kit de communication. Le laboratoire n’est pas une preuve d’application ouverte ni la livraison d’Elias.

## Corrections retenues

L’ancienne palette pétrole/terracotta est explicitement obsolète. La vitrine reprend le logo exact, le bleu-violet #505DC1, l’orange #FF791D et le beige #F5F0EA. Titres Anton, corps Montserrat, fichiers de polices complets obtenus via Google Fonts et servis localement. Les exportations du kit utilisaient des polices de substitution : elles ne sont pas reprises comme typographie du site.

Les anciens textes comportaient des CTA d’inscription, des indications de recrutement et des formulations opérationnelles incompatibles avec le stade courant. Ils sont remplacés par une présentation au futur, des liens de découverte et un atelier local de préparation de brief. Aucune campagne, inscription ou mise en relation n’est activée. Aucune date de lancement n’est promise.

La grille 29 € HT / 20 € HT + 15 € HT par artisan lié est présentée comme prévue et non souscriptible. Aucun mois gratuit, nombre de sélections, badge professionnel ni modalité contractuelle non confirmée n’est promis.

## Direction artistique et UX

Composition éditoriale beige, titres condensés surdimensionnés, surfaces orange et bleu-violet, illustration architecturale originale en SVG. Le dessin d’intérieur concrétise l’habitat sans attribuer un chantier, un professionnel ou un témoignage fictif à UCP.

Les sites [Linear](https://linear.app/) et [Ramp](https://ramp.com/) ont été consultés pour leur progression de présentation et la place donnée au produit. Analyse de la structure textuelle accessible uniquement, sans audit visuel de leurs pages ni copie de leur identité. Application à UCP : promesse immédiatement lisible, exemple concret, parcours par audience, modèle économique, stade et vision IA séparés.

## Claude for Startups

La [page officielle](https://claude.com/programs/startups), consultée le 14 octobre 2026, indique une cohorte complète et l’absence de nouvelles candidatures à cette date. Les [conditions officielles](https://www.anthropic.com/startup-program-official-terms) ne constituent pas une garantie d’admission. L’éligibilité d’une structure non immatriculée n’est pas tenue pour acquise.

La page anglaise présente le besoin, les utilisateurs, le modèle, le stade pré-lancement, le statut non immatriculé et les usages Claude envisagés. L’intégration, les crédits, l’acceptation et un partenariat ne sont jamais présentés comme acquis. Aucune candidature n’a été envoyée. Les usages IA sont des propositions de conception pour cette mission, pas des fonctionnalités existantes.

## Références techniques

- [Google — SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) : titres descriptifs, contenu HTML lisible, navigation et liens compréhensibles.
- [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/) : contraste, clavier, focus, labels, réduction des obstacles. Ce travail n’est pas une certification de conformité.
- [web.dev — Web Vitals](https://web.dev/articles/vitals) : objectifs terrain LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 au 75e percentile. Ces valeurs sont des objectifs, pas des mesures du site livré.
- [OWASP — Content Security Policy](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html) : politique restrictive, scripts externes locaux, absence d’appels réseau applicatifs. Le fichier `_headers` doit être effectivement pris en charge par l’hébergeur ; la politique META fournit un socle, mais pas `frame-ancestors`.

## Points nécessaires pour la diffusion publique

1. Confirmer le domaine exact et ses accès de publication ; aucun changement DNS n’a été réalisé.
2. Fournir l’adresse e-mail professionnelle définitive, puis remplacer le contact historique Gmail.
3. Compléter l’identification de l’éditeur et les mentions d’hébergement. L’immatriculation n’est pas présentée comme une condition technique à l’existence d’une vitrine, et aucun numéro n’est inventé.
4. Faire la recette visuelle desktop/mobile et clavier dans un navigateur disponible, puis vérifier les changements sur l’URL publique réelle.
5. Passer l’audience à publique, adapter les URL canoniques, activer l’indexation et générer le sitemap uniquement sur la version prête à diffuser.

La publication initiale reste privée : elle rend le travail consultable sans confondre présentation, recette du MVP et lancement commercial.
