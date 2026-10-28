# Recherches enregistrées — recette du 28 octobre 2026

Périmètre : F37, préproduction privée fictive. Un professionnel conserve jusqu'à
dix jeux de critères nommés, les réapplique ou les supprime explicitement. Aucun
résultat de mission n'est conservé : les droits sont recalculés à chaque recherche.
Les favoris, recommandations et alertes automatiques ne sont pas développés.

## Contrôles automatisés

Les tests API couvrent la propriété des critères et de l'export, les rôles, sessions
et jetons CSRF, les noms en doublon, budgets et paramètres invalides, le maximum de
dix sous concurrence et le rollback en cas de panne d'audit. Une recherche conservée
ne permet pas de retrouver un projet devenu masqué ni de contourner le retrait
d'une autorisation professionnelle. Un scénario partagé vérifie PostgreSQL.

Le test de sauvegarde PostgreSQL réalise aussi la conservation de ces critères dans
un vrai dump/restore en base fictive isolée, avec exclusion des anciennes sessions.
Il ne restaure pas la base Neon distante.

Les tests DOM couvrent la sauvegarde des champs saisis et de zéro, le double clic,
la requête de recherche actuelle, la panne isolée du chargement et son réessai,
la création refusée sans perte de saisie, la suppression confirmée sans perte du
formulaire et le rejet d'une réponse tardive après navigation. Les noms sont rendus
comme texte et aucun service externe n'est appelé.

## Limites

Les contrôles DOM simulent les interactions et les réponses API. Ils ne prouvent
pas le rendu mobile, le clavier ou le lecteur d'écran sur appareils réels.
Les règles commerciales D01–D13 restent ouvertes et aucun paiement n'est ajouté.
