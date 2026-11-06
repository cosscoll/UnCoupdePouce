# F19 — Retour d’expérience privé après une mise en relation (lot 6 novembre 2026)

## Périmètre livré dans le code

Un particulier peut remplir un retour **privé, non publié** uniquement si son annonce est **clôturée et non annulée** et qu’une candidature a effectivement été **acceptée**. Il doit cocher une confirmation d’interaction et rédiger une évaluation de 1 à 5 accompagnée de 20 à 800 caractères de retour.

- Accès dans le détail du projet clôturé : formulaire affiché seulement après vérification par l’API.
- Une évaluation par candidature acceptée et projet (contrainte SQL d’unicité et écriture atomique).
- Autorisation recalculée côté serveur après vérification de la session et du CSRF ; demandeur propriétaire uniquement.
- Lecture de l’évaluation par son auteur uniquement, incluse dans son export de compte.
- Trace d’audit. Aucun avis, note, témoignage ou certification n’est rendu public ; aucun professionnel ne peut lire ce module pour le moment.
- Aucun email, API facturée, outil IA ou notification extérieure.

Les essais de préproduction utilisent **exclusivement des comptes et projets fictifs**.

## Critères d’acceptation et limites

F19 reste **partiel** : la clôture administrative et une affirmation de collaboration ne prouvent pas l’exécution réelle des travaux. Ce module est un retour privé de bêta, **pas un système d’avis clients publics vérifiés**. Les procédures de contestation, de modération, de réponse du professionnel, de durée de conservation, de consentement et de preuve d’intervention doivent être arbitrées avant tout affichage public.

Tests API à conserver : refus des autres rôles et autres propriétaires, refus sans sélection, avant clôture ou après annulation, CSRF, note hors 1–5, commentaire trop court, refus d’une seconde soumission, concurrence de deux soumissions, isolation des exports. Tests d’interface : disponibilité conditionnelle, formulaire avec consentement explicite, lecture du retour enregistré.

Référence : matrice d’acceptation CDC F19 ; le statut est limité au périmètre ci-dessus.
