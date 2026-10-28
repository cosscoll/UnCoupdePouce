# Vue d'ensemble du professionnel

Une entrée « Vue d'ensemble » est disponible dans le menu professionnel. Elle
réunit les missions ouvertes déjà autorisées par le serveur, les candidatures
personnelles en attente/sélectionnées sur des projets non clôturés, les conversations
accessibles, l'état du profil et de l'accès de test, et les notifications non lues.
Le premier écran reste la recherche de projets, afin de conserver le parcours actuel.

Les compteurs reprennent les API authentifiées existantes. Aucun nouveau droit,
critère de matching, tarif ou abonnement réel n'est créé. Le compteur de conversations
exclut celles verrouillées par l'abonnement de test ou l'inactivité d'un profil lié ;
il ne s'agit pas d'un nombre de messages non lus. Les compteurs constituent une
lecture de l'état courant des différentes rubriques, pas un historique analytique
ni un snapshot transactionnel unique. L'ouverture d'une conversation revérifie les droits.

Les sources sont chargées en parallèle. Une panne laisse les autres rubriques
utilisables et affiche « Information indisponible », sans remplacer les informations
manquantes par zéro. Le réessai ne recharge que la rubrique concernée. Naviguer,
changer de compte ou expirer une session invalide les réponses devenues obsolètes.
Aucune donnée privée n'est enregistrée dans un stockage navigateur ou cache PWA.

Les liens conduisent aux rubriques existantes. Consulter une mission depuis cette
vue conserve un retour vers la vue d'ensemble. La consultation du tableau ne marque
pas les notifications comme lues et ne modifie aucun compte ou candidature.

Les recommandations personnalisées, métriques de conversion, visites de profil,
statistiques commerciales et alertes email restent hors de ce lot. Rendu sur appareil
réel, clavier et lecteur d'écran ne sont pas acceptés par les seules simulations DOM.
