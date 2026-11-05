# Modification d’une annonce publiée

Le lot F14 protège le contenu des annonces modifiables lorsqu’elles sont
ouvertes dans plusieurs fenêtres. Dans l’espace Particulier, ouvrir
**Mes projets**, **Voir les candidatures**, puis **Modifier la demande**.

## Annonce avec candidatures

Tant que l’annonce est ouverte et qu’aucun professionnel n’a été sélectionné,
le demandeur peut corriger le titre, la description et le budget indicatif.
Dès la première candidature, la commune et les métiers sont figés. Le suivi
des candidatures reçues, leurs états et les droits de messagerie sont conservés.

Une différence effective dans le titre, la description ou une borne de
budget est un changement significatif pour ce lot. Chaque candidature
en attente reçoit une notification interne, y compris via un profil lié.
**Voir ma candidature** ouvre la candidature concernée dans le suivi pro.
Le formulaire indique au demandeur combien de candidatures ont été averties.
Un enregistrement identique, un refus ou une ancienne révision ne créent
aucune notification.

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
  indique aussi `content_editable` et `content_scope_locked`. Les annonces antérieures reçoivent une
  révision initiale à 0 par migration additive SQLite et PostgreSQL.
- `PUT /api/projects/{id}` exige la version entière lue par le propriétaire.
  La transaction contrôle les droits, la sélection, l’état ouvert,
  la version et la stabilité du périmètre après la première candidature. Une version périmée renvoie `409 project_content_conflict`.
  La révision, le journal et les notifications sont écrits dans la même
  transaction. En cas d’échec de notification, l’enregistrement est annulé.
- Le classement du métier par la modération change la révision du contenu.
  La réception des candidatures garde son compteur indépendant.
- Le jeton CSRF reste stable pour une même session dans plusieurs onglets.
  Les requêtes d’écriture exigent toujours un jeton valide pour leur session.
- Une modification de commune ou de métier après candidature renvoie
  `409 project_scope_locked`. Recharger remet la commune publiée dans le
  formulaire et conserve les autres saisies.

## Recette

| Scénario | Vérification attendue |
| --- | --- |
| MOD01 | Deux fenêtres lisent la même version. Le premier enregistrement avance la version et le second est refusé sans écriture supplémentaire. |
| MOD02 | Le formulaire conserve la saisie. Charger la version publiée permet la comparaison, sans nouvelle écriture automatique. |
| MOD03 | La version est obligatoire. Les refus d’accès, la clôture et la sélection figent le contenu. Une candidature fige la commune et les métiers. |
| MOD04 | La mise à jour et le journal partagent une transaction. Les tests couvrent la migration SQLite et la concurrence SQLite et PostgreSQL. |
| MOD05 | Rejouer MOD01 et MOD02 depuis deux fenêtres connectées en préproduction, confirmer le contenu et la version après rechargement, puis clôturer le projet fictif. |
| MOD06 | Déposer une candidature, modifier le budget et la description, retrouver la notification et ouvrir la bonne candidature. Un enregistrement identique ne crée pas une deuxième alerte. |
