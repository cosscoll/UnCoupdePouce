# Modification d’une annonce publiée

Le lot F14 protège le contenu des annonces modifiables lorsqu’elles sont
ouvertes dans plusieurs fenêtres. Dans l’espace Particulier, ouvrir
**Mes projets**, **Voir les candidatures**, puis **Modifier la demande**.

## Récupération d’un conflit

Si une autre fenêtre a déjà enregistré une modification, le formulaire
conserve la saisie et affiche **Charger la version actuelle**. Cette action
relit l’annonce, actualise les champs que le demandeur n’avait pas touchés
et laisse ses modifications visibles. La version publiée est affichée
pour comparaison. Le demandeur doit ensuite confirmer lui-même
**Enregistrer les modifications**. Si l’annonce est devenue non modifiable,
le formulaire garde la saisie et bloque l’enregistrement.

## Contrat serveur

- Le détail et l’export propriétaire exposent `content_version`. Le détail
  indique aussi `content_editable`. Les annonces antérieures reçoivent une
  révision initiale à 0 par migration additive SQLite et PostgreSQL.
- `PUT /api/projects/{id}` exige la version entière lue par le propriétaire.
  La transaction contrôle les droits, l’absence de candidature, l’état ouvert
  et la version. Une version périmée renvoie `409 project_content_conflict`.
  L’annonce et son journal ne sont modifiés que par un enregistrement valide.
- Le classement du métier par la modération change la révision du contenu.
  La réception des candidatures garde son compteur indépendant.
- Le jeton CSRF reste stable pour une même session dans plusieurs onglets.
  Les requêtes d’écriture exigent toujours un jeton valide pour leur session.
- F14 reste partielle. La modification après candidature et les notifications
  de changement significatif restent à spécifier.

## Recette

| Scénario | Vérification attendue |
| --- | --- |
| MOD01 | Deux fenêtres lisent la même version. Le premier enregistrement avance la version et le second est refusé sans écriture supplémentaire. |
| MOD02 | Le formulaire conserve la saisie. Charger la version publiée permet la comparaison, sans nouvelle écriture automatique. |
| MOD03 | La version est obligatoire. Les refus d’accès, la clôture et la réception d’une candidature protègent le contenu. |
| MOD04 | La mise à jour et le journal partagent une transaction. Les tests couvrent la migration SQLite et la concurrence SQLite et PostgreSQL. |
| MOD05 | Rejouer MOD01 et MOD02 depuis deux fenêtres connectées en préproduction, confirmer le contenu et la version après rechargement, puis clôturer le projet fictif. |
