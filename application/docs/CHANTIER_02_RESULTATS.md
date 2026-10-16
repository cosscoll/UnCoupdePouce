# Lot 02 — V1 de démonstration interactive

16 octobre 2026, branche `dev/ucp-codex`. Le lot complète l'accueil du lot 01 et approfondit les espaces connectés sans changement de schéma ni ajout de dépendance.

## Fonctionnalités livrées

- Demandeur : projets en cartes, compteurs privés, reprise des brouillons, filtres combinables commune/métier/statut, recherche, tri et six projets par page ; présentation plus lisible des candidatures et ouverture de la bonne conversation depuis le professionnel sélectionné.
- Artisan : suivi du profil et de ses droits simulés, projets compatibles, indication des candidatures déjà envoyées, filtres de candidatures et accès au fil correspondant au projet.
- Entreprise : sélection des spécialités avec le catalogue visuel, à la place de codes métier saisis à la main ; ajout/désactivation des artisans liés via les routes existantes.
- Messagerie : première conversation ou conversation ciblée ouverte automatiquement, sélection visible, prévention des rafraîchissements simultanés sur réseau lent, protection des réessais existante conservée.
- Notifications : lecture individuelle en plus du marquage global.
- Interactions : transitions de vue/dialogue et appuis sur les boutons, animés avec CSS et respectant `prefers-reduced-motion`. Aucun GSAP, React ou autre paquet ajouté.
- Navigation : retour en haut et focus sur le titre après changement de vue, pour éviter de rester au milieu du nouvel écran après avoir parcouru une longue liste.
- Compatibilité : les projets historiques dont `trades_json` vaut `[]` conservent leur métier principal dans l'affichage et les filtres.

## Présentation locale indépendante

`backend/presentation.py` crée une nouvelle base synthétique avec quatre projets, un brouillon, deux professionnels, deux candidatures à comparer et une conversation existante. Le bandeau permet de passer entre demandeur, artisan et administration. Un secret aléatoire reste côté serveur ; le changement de rôle utilise les sessions normales et révoque la session précédente.

Les accès rapides n'existent pas sur le lancement normal `app:app`. Le script refuse un fichier SQLite préexistant ; les actions de présentation exigent un client loopback et une origine locale identique. `PRESENTATION.bat` ne télécharge rien et utilise uniquement un environnement Python déjà installé.

## Contrôles réellement exécutés

| Contrôle | Résultat |
|---|---|
| Suite backend complète | 118 PASS, 0 FAIL, 0 ERROR ; rapport `qa/presentation-pytest.xml` ; 307,20 secondes. |
| Tests DOM | 21 PASS, 0 FAIL ; régressions du lot précédent conservées. |
| Scénario navigateur réexécutable | 22 contrôles PASS dans `qa/presentation.browser.js`, exécuté avec le MCP Playwright sur l'application réelle. |
| Syntaxe Python/JavaScript et diff | PASS : parsing du script de présentation, `node --check` et `git diff --check`. |

Les huit nouveaux cas backend couvrent le mode normal sans accès rapide, la révocation de session en changeant de rôle, les droits ordinaires, le CSRF, les origines absentes/externes/nulles, un client distant, un rôle inconnu, le refus de toucher à un fichier existant et l'absence d'identifiants dans les métadonnées.

La recette navigateur réalise une publication en trois étapes, la recherche du projet, une candidature professionnelle, la sélection, le ciblage de conversation, l'envoi et la réponse. Elle contrôle demandeur/artisan/messagerie à 320, 375, 390, 768 et 1440 px : aucun débordement horizontal observé. Elle vérifie également la désactivation des animations et l'absence d'exception JavaScript.

Des essais supplémentaires ont couvert les deux candidatures comparables, les filtres commune/métier, la création d'entreprise, l'ajout d'un artisan lié avec le sélecteur, la désactivation, le calcul simulé de 35 € HT/mois pour un profil actif, la lecture individuelle d'une notification, les métriques et la navigation de modération.

## Autocritique et performance

La première mesure Chrome DevTools révélait un CLS de 0,20 au rechargement : l'accueil anonyme s'affichait avant la résolution de la session et l'arrivée du bandeau. La première vue attend désormais l'initialisation ; le statut de chargement est annoncé avec `aria-busy` et libéré aussi en cas d'erreur.

Après correction, trace locale : LCP 391 ms et CLS 0,00, sans bridage réseau/CPU. Ce sont des observations sur loopback, pas des résultats terrain ni un test de charge. La pagination limite les cartes DOM, mais les API retournent encore leurs listes complètes : pagination SQL et indexation adaptées à la volumétrie restent à préparer.

Une dépréciation Starlette/AnyIO demeure dans les tests. Aucune exception JavaScript n'a été observée pendant le scénario ; un 401 de contrôle de session est attendu lors d'une visite anonyme.

## Remise et limites

Le serveur de présentation est laissé ouvert sur `http://127.0.0.1:8876/` pour permettre la manipulation réelle demandée. Arrêt avec Ctrl+C. Une nouvelle session propre est préparée après recette ; les bases d'essai précédentes sont conservées dans leurs dossiers temporaires et ne sont pas réutilisées.

Le mode d'emploi et le scénario investisseur sont dans `PRESENTATION.md`. Les captures `qa/presentation-demandeur.png`, `qa/presentation-artisan.png`, `qa/presentation-candidatures.png` et `qa/presentation-mobile.png` documentent l'interface ; elles ne remplacent pas l'application ouverte.

La facturation et la vérification professionnelle restent simulées. Pièces de conversation, avis, vérification réelle d'assurance/entreprise, sécurité de production et arbitrages métier ouverts restent hors de ce lot. Aucun chiffre ne doit être présenté comme une traction commerciale réelle. Aucun achat, installation de dépendance, push, déploiement public ou changement de `main` n'a été effectué.
