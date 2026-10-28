# Auto-audit du travail UCP — 28 octobre 2026

## Verdict

La préproduction fonctionne et conserve le backend existant. Elle reste un produit
incomplet. Les validations API et DOM ne démontrent ni une expérience mobile
satisfaisante ni une conformité d’accessibilité. Le nombre de tests a été trop
mis en avant dans les comptes rendus ; trois nouveaux scénarios ont effectivement
échoué sur la version publiée avant correction.

## Ma méthode à corriger

1. J’ai enchaîné les lots fonctionnels sans donner une vue exhaustive des 92
   exigences. Le suivi précédent ne couvrait qu’une sélection de lignes.
2. J’ai laissé des contrôles de rendu et de navigation derrière les tests API.
   Une autorisation serveur ne suffit pas à protéger un écran contre une réponse
   déjà autorisée pour une ancienne session.
3. Les tests couvraient des parcours normaux et quelques pannes, mais pas assez
   les changements de compte et de navigation pendant une requête en cours.
4. J’ai laissé une aide de confidentialité devenue inexacte après le passage à
   PostgreSQL, ainsi qu’un bouton de candidature proposant une action déjà faite.
5. Le JavaScript concentre encore trop de responsabilités. La fonction de transport
   a été rendue lisible pendant ce lot ; une réorganisation générale reste à faire
   progressivement, après sécurisation des comportements.

## Constats et corrections

| Référence | Gravité et défaut confirmé | Correction | Preuve |
|---|---|---|---|
| A01 | Haute : une réponse privée tardive reste traitable après déconnexion ; un ancien 401 peut aussi affecter le compte suivant. Aucun accès serveur inter-comptes nouveau n’a été observé. | Réponse liée à l’identité et à la session qui ont lancé la requête ; rejet avant restitution ou gestion du 401 si elles ont changé. | Test initial en échec puis réussi ; scénario changement de compte et ancien 401 ajouté. |
| A02 | Moyenne : un détail de projet tardif écrase la page visitée entre-temps. | Génération de navigation vérifiée et rendu préparé hors du document ; insertion seulement si la page est encore courante. | Test initial en échec puis réussi. |
| A03 | Moyenne : la fin d’une action réactive un bouton devenu interdit entre-temps. | Retrait de la réactivation globale des boutons. Verrou de soumission conservé, annonce d’attente et aria-busy sans déplacement du focus. | Comparatif rendu invalide pendant une requête : test initial en échec puis réussi. |
| A04 | Moyenne : bouton Candidater toujours présent après candidature, retrait ou fermeture. | Retour de la seule candidature du professionnel courant ; lien vers son suivi, ou indication de fermeture. | Scénarios API inter-comptes et DOM couvrant les quatre états ; unicité serveur conservée. |
| A05 | Moyenne : un examen support tardif remplace un dialogue ouvert ensuite. | Version du dialogue contrôlée avant restitution du contenu privé ; fermeture respectée. | Scénario DOM avec réponse volontairement retardée. |
| A06 | Moyenne : les mots de passe saisis restent dans des formulaires masqués après connexion/inscription. | Effacement après succès et réinitialisation des formulaires lors de la déconnexion. | Scénario DOM connexion, déconnexion et changement de compte. |
| A07 | Accessibilité/contenu : dialogue sans nom ARIA explicite ; aide affirmant un stockage local en préproduction. | Titre relié au dialogue ; mention exacte de PostgreSQL en préproduction et SQLite en local. | Contrôle DOM du nom accessible et inspection du texte livré. |

Le rejet d’une réponse tardive ne revient pas à annuler une opération déjà exécutée
sur le serveur. Les contrôles d’autorisation serveur et les protections de publication,
candidature et messagerie restent nécessaires et sont conservés.

## Limites et acceptation

La tentative d’ouverture dans le navigateur de contrôle a renvoyé
`ERR_INVALID_AUTH_CREDENTIALS`. Aucun écran applicatif n’a donc été capturé pour
cet audit. Ce document est un audit technique et de tests, pas un audit visuel.
Aucune recette Android/iPhone, lecteur d’écran, zoom 200 % ou contraste n’est
annoncée comme réussie. La protection privée n’a pas été retirée.

La récupération par email, les membres d’entreprise nominatifs, la vérification
réelle des professionnels, la restauration Neon distante et les arbitrages métier
restent ouverts. Voir MATRICE_ACCEPTATION_CDC.md pour toutes les exigences,
y compris celles que cet audit n’a pas réévaluées.

## Validation de ce lot

Les trois premiers scénarios de régression échouaient avant modification et passent
après correction. La suite locale complète réussit : **151 tests Python**, avec
7 contrôles PostgreSQL réservés à la CI, et **42 tests DOM/worker**.
Les scénarios complémentaires couvrent la candidature déjà existante, le dialogue
remplacé pendant une revue, l’ancien 401 et l’effacement des mots de passe.
La validation PostgreSQL et la publication sont requises avant livraison.
