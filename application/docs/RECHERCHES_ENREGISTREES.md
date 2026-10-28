# Recherches enregistrées — F37

Dans **Trouver des projets**, un compte professionnel peut conserver jusqu'à dix
recherches privées nommées. « Enregistrer ces critères » conserve les champs du
formulaire, y compris ceux qui n'ont pas encore été appliqués aux résultats.
Le budget zéro reste distinct d'un champ vide. Un nom déjà utilisé par le même
compte, sans distinction de casse et après suppression des espaces extérieurs,
est refusé avec une explication ; le formulaire reste renseigné.

« Appliquer la recherche » remet les critères dans le formulaire puis interroge
la recherche de missions existante. Aucun résultat, contenu de projet ou droit
d'accès n'est mémorisé dans la recherche enregistrée. Un projet masqué, fermé,
hors périmètre ou rattaché à un compte suspendu ne réapparaît pas grâce à elle.
Les critères anciens absents des options actuelles restent visibles comme critères
enregistrés ; ils ne sont pas remplacés silencieusement par un filtre vide.

La suppression demande une confirmation dans l'interface. Elle retire seulement
la recherche enregistrée, en conservant les critères et résultats actuels. Pour
remplacer une recherche, en créer une sous un autre nom puis supprimer l'ancienne.
La limite de dix s'applique dans la transaction serveur, y compris si plusieurs
fenêtres tentent une création simultanée.

Une panne du chargement des recherches n'empêche pas la recherche de missions ni
l'affichage de ses résultats. L'actualisation de la liste est explicite. Une
création refusée conserve le nom et les critères saisis. Une panne d'application
conserve les derniers résultats avec l'avertissement de recherche non appliquée.
Les réponses tardives d'une autre page ou session ne remplacent pas la page active.

Les API `GET/POST /api/saved-searches` et `DELETE /api/saved-searches/{id}` sont
réservées aux professionnels connectés. Chaque écriture exige CSRF et session
toujours valide dans sa transaction. Seul le propriétaire liste ou supprime une
recherche ; aucun lecteur administratif des critères privés n'est ajouté.
Création et suppression sont journalisées sans recopier les critères ou noms dans
l'audit. Une erreur d'audit annule aussi la création ou suppression.

Les critères et noms du seul propriétaire figurent dans `own_saved_searches` de
l'export personnel. La nouvelle table est couverte par les sauvegardes PostgreSQL
et la restauration fictive isolée de CI ; elle a sa protection RLS comme les autres
tables privées. Cela ne prouve pas une restauration du projet Neon distant.

Aucun stockage navigateur, tâche récurrente, abonnement, email ou alerte automatique
n'est ajouté. Les favoris de projets, recommandations IA et classement de
pertinence restent non livrés. La recette DOM ne vaut pas validation sur téléphone.
