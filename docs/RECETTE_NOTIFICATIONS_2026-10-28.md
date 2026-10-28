# Historique des notifications — recette du 28 octobre 2026

Périmètre : préproduction privée fictive, sans email ou push. Le centre conserve les
parcours de lecture existants et ajoute un historique paginé de 50 entrées, un filtre
non lues et la lecture individuelle. Le compteur porte sur tout le compte.

La validation locale comprend 160 tests Python réussis, neuf contrôles PostgreSQL
réservés à la CI, et 56 tests DOM/worker réussis. Les nouveaux scénarios incluent
123 notifications pour un destinataire, celles d'un autre compte, les pages plus
anciennes que la limite précédente de 100, le filtre non lues et les paramètres
invalides, la lecture idempotente et le maintien du compteur de l'autre compte.

Les tests d'interface vérifient le chargement d'une page ancienne, une panne et son
réessai, la conservation des résultats, les réponses arrivant dans le désordre,
la lecture d'une entrée et la conservation du filtre après lecture globale.
La [CI 40711604618](https://github.com/cosscoll/UnCoupdePouce/actions/runs/40711604618) a validé **169 tests Python et 56 tests DOM/worker**, dont PostgreSQL 17. Le commit applicatif `b6e76e9` est déployé à Francfort. Les essais de rendu mobile et
lecteur d'écran restent ouverts et ne sont pas déduits des simulations DOM.

## Recette HTTPS du service publié

Les quatre groupes de contrôles sont réussis : champs de pagination réellement
servis, filtre non lues et curseur invalide ; lecture propriétaire idempotente et
refus par un autre compte ; curseur réel et conservation des réalisations du projet
de démonstration après déploiement ; fichiers d'interface effectivement publiés.
Une seule notification fictive est marquée lue, sans effacer l'historique du compte.
Les 123 notifications du test automatisé ne sont pas créées sur la préproduction.

Avec le compte de démonstration `camille@ucp.test`, le projet
« Découvrir les réalisations fictives 9089603d » conserve ses deux candidatures
individuelle et liée. Les identifiants privés déjà remis ne sont pas publiés dans
le dépôt. Ce lot ne constitue pas une ouverture commerciale ou une validation
mobile complète.
