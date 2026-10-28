# Recette budget et suivi — 28 octobre 2026

Périmètre : préproduction privée UCP, comptes et travaux fictifs seulement.

## Livraisons

- Assistance générale : demande catégorisée, suivi propriétaire, examen administratif audité, réponse privée et notification interne.
- Budget facultatif : bornes en euros entiers, absence distincte de zéro, brouillon versionné, récapitulatif, publication idempotente, affichage autorisé, export personnel et recherche par recoupement.
- Suivi professionnel : compteurs personnels, filtres par état, date de candidature, profil lié et explication de l’accès à la messagerie. L’état historique de sélection reste distinct de la clôture du projet.

## Validation automatisée

- [Budget — CI 40677583672](https://github.com/cosscoll/UnCoupdePouce/actions/runs/40677583672) : 154 tests Python et 34 tests DOM/worker réussis.
- [Suivi — CI 40678149330](https://github.com/cosscoll/UnCoupdePouce/actions/runs/40678149330) : 157 tests Python et 35 tests DOM/worker réussis.
- Les suites incluent SQLite, PostgreSQL 17 et une restauration dans une base de test isolée. Le budget et la demande d’assistance y sont conservés ; anciennes sessions exclues.

## Recette HTTPS réelle du budget

Brouillon relu avec ses montants, conflit de version refusé, publication répétée sans doublon, consultation par le professionnel éligible, recherche par recoupement et exclusion des projets hors droits, validation des montants, export propriétaire, modification après candidature refusée, sélection et message reçu par le demandeur : réussis.

Le premier envoi du script de recette avait une clé de réessai trop courte. Le serveur l’a refusée (422) ; le scénario a été repris sur la même candidature avec une clé valide, sans recréer le projet ni la sélection.

## Recette HTTPS du suivi et persistance

Sur le commit applicatif `83d4d155a73e425e5ea74ae909edd1c5319308ba`, publié à Francfort :

- Candidature sélectionnée sur un projet actif avec état de chat disponible ; date d’envoi présente et champs privés exclus. Les rôles demandeur sont refusés sur cette route professionnelle.
- Budget 1 200–2 500 euros, message fictif et réponse d’assistance retrouvés après le redéploiement.
- Clôture du projet fictif de recette : état projet « clôturé », historique de candidature toujours « sélectionnée », état de conversation « fermée ».
- Lecture et envoi de messages refusés après clôture ; interface de filtres bien publiée.

Ces quatre groupes de contrôles HTTPS ont réussi. Le projet de recette est clos.

## Limites

La recette de restauration utilise une base fictive de CI, pas le projet Neon déployé. Installation et réouverture sur de vrais téléphones, restauration distante, emails transactionnels, comptes nominatifs d’entreprise, vérification professionnelle réelle et arbitrages D01–D13 restent ouverts. Ces lots ne constituent pas une validation commerciale complète du cahier des charges.
