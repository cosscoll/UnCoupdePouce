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

La [CI 40743078659](https://github.com/cosscoll/UnCoupdePouce/actions/runs/40743078659)
valide **186 tests Python et 64 tests DOM/worker**, dont PostgreSQL 17 et la
restauration réelle en base fictive isolée. La [pull request 41](https://github.com/cosscoll/UnCoupdePouce/pull/41)
est fusionnée au commit applicatif `9e1343a`. La suite locale complète réussit
175 tests Python, les onze contrôles PostgreSQL étant exécutés par cette CI.

## Recette HTTPS de la version publiée

Quatre groupes de contrôles réussissent sur la préproduction : persistance des
critères et de zéro, doublon de nom et paramètres invalides ; liste, export et
suppression limités au propriétaire professionnel ; réapplication par la recherche
autorisée actuelle ; suppression ciblée et présence des contrôles dans l'interface
effectivement publiée. La recherche temporaire est supprimée et sa seconde
suppression renvoie 404. Aucun projet ou profil existant n'est modifié.

Une recherche « Plomberie Toulouse · démo » suivie d'un identifiant de recette est
conservée sur le compte fictif `atelier@ucp.test`, dans **Trouver des projets → Mes
recherches enregistrées**. Les accès privés déjà remis ne sont pas publiés dans le
dépôt. Le déploiement `9e1343a` est READY sur le projet privé `ucp-preproduction`.

La page d'avancement publique présente aussi ce lot ; les contrôles statiques de
la vitrine et ses 55 tests réussissent après cette modification.

## Limites

Les contrôles DOM simulent les interactions et les réponses API. Ils ne prouvent
pas le rendu mobile, le clavier ou le lecteur d'écran sur appareils réels.
Les règles commerciales D01–D13 restent ouvertes et aucun paiement n'est ajouté.
