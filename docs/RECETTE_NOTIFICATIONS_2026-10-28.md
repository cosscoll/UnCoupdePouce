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
La CI doit valider PostgreSQL avant publication. Les essais de rendu mobile et
lecteur d'écran restent ouverts et ne sont pas déduits des simulations DOM.
