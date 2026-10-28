# Centre de notifications interne

Le centre affiche toutes les notifications ou seulement les non lues, par pages
de 50 entrées ordonnées par identifiant décroissant. « Voir les notifications plus
anciennes » utilise un curseur, sans limiter l'historique aux 100 dernières entrées.
Le total des non lues porte sur tout le compte, même lorsque seule une page est visible.

Chaque notification peut être marquée lue séparément. Répéter cette action ne change
pas sa première date de lecture et ne décrémente pas le compteur une seconde fois.
« Tout marquer comme lu » reste disponible et conserve le filtre choisi. Cette
lecture ne concerne que le destinataire connecté et exige un jeton CSRF valide.

Une panne de pagination conserve les résultats déjà affichés et permet de réessayer
la même page. Les changements de filtre ignorent les réponses tardives d'une ancienne
requête. L'intitulé indique le filtre des résultats effectivement chargés ; aucun
échec n'est présenté comme un historique vide ou un compteur zéro.

La vue d'ensemble professionnelle utilise directement le filtre des non lues pour
son aperçu, y compris lorsque les notifications non lues sont anciennes.
Le chargement et l'actualisation sont explicites : ni polling, ni tâche récurrente,
ni service email/push, ni nouveau stockage navigateur ne sont ajoutés.

Les API conservent leurs champs existants, dont le libellé historique
`channel=LAB_LOCAL_ONLY` pour compatibilité. Il signifie un canal interne de test,
y compris lorsque la base est hébergée ; aucune livraison externe n'est réalisée.
Le curseur est optionnel et le filtre n'élargit jamais le destinataire autorisé.

## Événements de statut

Les changements suivants créent une notification pour le seul compte concerné,
dans la transaction qui modifie son état. Une répétition sans changement d'état
ne crée pas de nouvelle notification. Un nouveau cycle désactivation/réactivation
produit bien de nouveaux événements. L'historique ne représente pas l'état actuel :
celui-ci reste contrôlé par les API de profil et de session.

| Événement | Déclencheur réel | Portée du message |
| --- | --- | --- |
| `profile_test_authorized` | Profil non autorisé → autorisé par l'administrateur | Autorisation de test uniquement, sans certification d'entreprise ou d'assurance |
| `test_access_activated` | Accès de test inactif → actif | Aucun paiement ; toutes les autres conditions du chat restent applicables |
| `profile_test_suspended` | Retrait administratif de droits professionnels précédemment actifs | Autorisation et accès de test désactivés |
| `profile_review_required` | Enregistrement d'un profil qui disposait d'une autorisation ou d'un accès de test | Nouvelle revue et révocation des droits précédents |
| `account_suspended` | Compte non suspendu → suspendu | Sessions révoquées ; notification consultable seulement après levée de suspension et reconnexion |
| `account_restored` | Compte suspendu → non suspendu | Reconnexion nécessaire ; aucune réactivation implicite de droits professionnels |

L'enregistrement initial du profil et ses modifications lorsqu'il est déjà en
attente n'annoncent pas une perte de droits inexistants. Les refus d'autorisation,
les jetons CSRF invalides et les cibles absentes n'émettent aucune alerte.
Si l'insertion d'une notification échoue, les changements d'état, révocations de
sessions et écritures d'audit de cette opération sont annulés ensemble.
Les motifs privés de modération, coordonnées et contenus de conversation ne sont
jamais copiés dans ces messages génériques. Une suspension complète empêche toute
consultation du centre : aucune livraison pendant la suspension n'est revendiquée.

Les événements déjà présents restent : candidature reçue, acceptée, refusée ou
retirée, projet clôturé, nouveau message, réponse au support et au signalement.
Les nouveaux statuts ne créent ni email, ni push, ni tâche planifiée.

Les emails transactionnels, notifications système sur téléphone, liens directs
vers chaque objet et politique de conservation définitive restent à réaliser.
La pagination n'est pas une preuve de rendu ou d'accessibilité sur appareil réel.
