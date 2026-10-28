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

Les emails transactionnels, notifications système sur téléphone, liens directs
vers chaque objet et politique de conservation définitive restent à réaliser.
La pagination n'est pas une preuve de rendu ou d'accessibilité sur appareil réel.
