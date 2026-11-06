# F11 — Dimensions facultatives des chantiers (6 novembre 2026)

## Fonctionnement dans UCP

Un particulier peut désormais préciser quatre mesures **facultatives** dans une annonce :
- surface approximative en m² ;
- longueur en mètres ;
- largeur en mètres ;
- hauteur en mètres.

Les valeurs sont numériques, positives, au maximum 10 000, avec deux décimales maximum. Les champs vides ne constituent pas des zéros. La surface n'est jamais calculée automatiquement à partir de la longueur et de la largeur : les métrés peuvent concerner des zones différentes. Ces valeurs sont **déclaratives**, sans estimation de prix, devis ou certification technique.

**Parcours** : Espace particulier → Créer un projet → Les détails → « Préciser des surfaces ou dimensions (facultatif) » → récapitulatif. La section reste repliée tant qu'aucune mesure n'existe. La sauvegarde automatique protège les valeurs pendant la rédaction. Le détail du projet affiche uniquement les mesures réellement renseignées. Dans « Modifier la demande », le propriétaire peut les actualiser en conservant la protection contre les conflits de version et la notification des candidatures en attente.

## Sécurité et intégrité

Les mesures sont stockées dans `projects.dimensions_json`, créé par migration additive compatible SQLite/PostgreSQL ; les anciens projets restent valides avec `{}`. Les brouillons conservent leur représentation structurée dans leur `payload` versionné. Les modèles Pydantic rejettent les champs inconnus, données textuelles à la place de chiffres, booléens, valeurs négatives, nulles ou supérieures à 10 000 et plus de deux décimales.

- Création, modification et lecture conservent les droits de demandeur, professionnel éligible et administrateur déjà appliqués au projet.
- Les mesures sont visibles dans le détail d'une annonce **uniquement si cette annonce est déjà accessible** selon les règles serveur UCP.
- Pas de données de géolocalisation, de nouvelle API externe, ni d'accès accordé par la présence des mesures.
- En cas de modification d'une annonce déjà candidature, les professionnels en attente reçoivent une notification interne ; les règles de verrouillage de commune, métiers et sélection restent inchangées.
- L'export individuel des données contient les dimensions déclarées du propriétaire.

## Recette

Tests backend : validation stricte, brouillon sauvegardé/publié, lecture par profil éligible, refus inter-comptes, modification avec conflit, notification, suppression explicite des mesures, migration depuis une annonce ancienne. Tests DOM : formulaire à trois étapes, champs facultatifs, récapitulatif, lecture d'une annonce et édition.

## Limites

F11 reste **partiel** : l'upload de photos est déjà présent, mais il n'existe pas de plans cotés interactifs, de métrés vérifiés par un artisan, ni de paramètres d'administration pour ajuster les plafonds. Une recette mobile et d'accessibilité réelle est encore nécessaire avant l'ouverture au public.
