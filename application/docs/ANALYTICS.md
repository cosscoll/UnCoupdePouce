# Mesure produit préparée, collecte désactivée

`backend/static/analytics.js` n'inclut aucun SDK, cookie, stockage persistant, appel réseau, replay ou capture automatique. Un transport explicite ET un consentement actif sont requis. Les événements sont limités à une liste fermée ; les champs libres, identifiants métier, coordonnées et contenus de messages ne sont pas transmis.

Événements préparés : account_created, project_started, project_step_completed, project_published, project_viewed, application_submitted, match_confirmed, technical_error. Propriétés limitées : environnement, format d'écran, rôle, étape 1–3, type d'erreur. L'identifiant de session est aléatoire et éphémère. Aucun suivi intersessions n'est activé.

Le projet PostHog accessible « Default project » a été consulté sans collecte observée. Son rattachement UCP n'est pas confirmé. Aucun événement, dashboard, feature flag, enregistrement de session ou SDK n'a été activé.

## Indicateurs à configurer après rattachement vérifié

| Analyse | Définition | Limite |
|---|---|---|
| Publication | project_started → étapes 1/2/3 → project_published | Mesure uniquement la session consentie ; ne pas assimiler abandon à un besoin non satisfait. |
| Mise en relation | projets publiés, candidatures, sélections | Événements anonymes sans ID projet : pas de jointure fiable interutilisateurs. Utiliser des agrégats serveur validés pour le taux par projet. |
| Fiabilité | technical_error par type et format | Ne représente pas toutes les erreurs serveur ni les utilisateurs sans consentement. |

Avant activation : confirmer le projet UCP et son hébergement, la politique de données et le consentement, vérifier l'absence de dépenses, tester la minimisation des événements et le retrait de consentement. Ne pas envoyer de données réelles pendant les tests locaux.
