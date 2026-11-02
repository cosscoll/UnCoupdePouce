# Favoris privés de projets — F37

Dans **Trouver des projets**, un professionnel peut ajouter ou retirer une mission
de ses favoris. La rubrique **Mes favoris** rassemble jusqu'à 50 références privées
par compte, avec un accès au détail actuel du projet. Aucune candidature, notification
au demandeur ou ouverture de conversation n'est déclenchée par l'enregistrement.

## Droits et confidentialité

La table `project_favorites` conserve uniquement le propriétaire, le projet et la
date d'ajout. Elle ne conserve aucun titre, description, coordonnées ou photo. La
recherche et les favoris partagent le même calcul de découverte dans la transaction
autorisée : profil autorisé pour les tests, métier principal/secondaire ou profil
lié actif, commune déclarée, projet ouvert/non masqué et demandeur non suspendu.

Un projet clôturé, sélectionné, masqué ou devenu hors droits apparaît seulement
comme **Projet indisponible**, sans contenu ni bouton de consultation. Sa référence
précédemment enregistrée reste retirable par son seul propriétaire. Le détail et
les photos gardent leurs propres contrôles ; un favori ne constitue jamais un droit
d'accès. Une suspension ou révocation de session bloque les opérations.

## API et cohérence

| Méthode | Route | Effet |
| --- | --- | --- |
| GET | `/api/project-favorites` | Références privées et seuls contenus encore autorisés |
| PUT | `/api/project-favorites/{project_id}` | Ajout idempotent, après contrôle des droits actuels |
| DELETE | `/api/project-favorites/{project_id}` | Retrait idempotent de la référence du compte courant |
| GET | `/api/account/export` | `own_project_favorites` : références et dates du seul propriétaire |

Les écritures nécessitent rôle professionnel, session et CSRF valides, revérifiés
dans la transaction. La limite de 50 inclut les références indisponibles. Un réessai
d'ajout à la limite réussit si la référence existe déjà et reste autorisée. La
contrainte unique propriétaire/projet et le verrou transactionnel préviennent les
doublons et dépassements concurrents. Ajout/retrait effectif et audit sont atomiques ;
les réessais n'ajoutent pas de nouvelle trace. Aucun contenu de projet n'est exporté
par cette nouvelle rubrique, même lorsque le projet est devenu indisponible.

La création de table et d'index est additive, sous le verrou d'initialisation existant,
compatible SQLite/PostgreSQL. Aucun enregistrement existant n'est supprimé.

## Vérifications et limites

`tests/test_project_favorites.py` couvre confidentialité, export propriétaire, retrait
après clôture, masquage, suspension du demandeur, changement de zone, profil lié
désactivé, droits, CSRF, identifiants invalides, concurrence, quota, réessais et échec
de l'audit. Le parcours commun est aussi exécuté sur PostgreSQL par
`tests/test_postgres.py`. Les simulations DOM couvrent ajout, retrait, erreur réseau,
réponse perdue, projet indisponible, navigation vers le détail et réponses tardives.

Ces vérifications ne constituent pas une recette visuelle ou sur appareil réel.
Les recommandations IA, alertes automatiques et synchronisation en temps réel entre
onglets restent absentes. L'actualisation de la rubrique ou une nouvelle recherche
relit l'état serveur. Les performances sur grands volumes restent à évaluer.
