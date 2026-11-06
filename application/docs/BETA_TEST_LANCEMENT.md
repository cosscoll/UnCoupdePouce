# UCP — checklist de lancement d'une bêta privée

Dernière revue : 6 novembre 2026. Groupe visé : 5 à 10 personnes, avec
comptes fictifs individuels et aucune transaction commerciale.

## Portes à franchir avant d'envoyer une invitation

| Point | Condition à vérifier | Ce qui est actuellement établi |
| --- | --- | --- |
| Publication | GitHub main, CI verte et Vercel READY sur le même SHA | À revalider sur la dernière version de la préparation |
| Accès externe | Autorisation Vercel nominative ou lien temporaire non public ET mot de passe Basic UCP distinct | Vercel Authentication et le Basic sont actifs ; les invités n'ont pas encore d'accès nominatif documenté |
| Comptes testeurs | 1 compte fictif différent par testeur, 12 caractères minimum pour son mot de passe | Inscription test existante ; aucune liste nominative de testeurs fournie |
| Autorisation artisan | Profil déclaré, zone et métier de test, activation explicite des droits professionnels par admin | Fonction disponible, activation des futurs testeurs non effectuée |
| Parcours complet | Répéter publication, candidature, sélection, conversation et signalement sur la nouvelle version | Recette HTTPS historique et tests automatisés ; recette manuelle de la cohorte nouvelle à réaliser |
| Sauvegarde | Dump privé du schéma Neon puis restauration vérifiée dans une base VIERGE distincte | Outil PostgreSQL testé sur bases CI jetables, Neon réel non sauvegardé ici |
| Appareils | Au moins un Android Chrome et un iPhone Safari physiques testés | Simulations DOM et responsive ; recette physique non faite |
| Support | 1 ticket de test reçu et traité par l'admin, puis visible uniquement par l'auteur | Code de l'assistance existant, nouveau formulaire de feedback ajouté |

L'ouverture aux testeurs externes reste BLOQUÉE tant que les accès et les
opérations contrôlées ci-dessus ne sont pas vérifiés. Les tests techniques
passés ne constituent pas une autorisation de collecte de données réelles.

## Comment ouvrir l'accès sans affaiblir la sécurité

1. Se connecter à l'équipe Vercel propriétaire d'UCP. Pour chaque testeur,
   accorder un accès au déploiement si possible, ou créer un lien de partage
   temporaire PRIVÉ et le révoquer après la campagne. Ne jamais donner accès
   à l'administration GitHub ou aux variables d'environnement aux testeurs.
2. Communiquer le mot de passe du verrou Basic séparément du lien Vercel.
   Ne publier aucun identifiant dans un dépôt, un formulaire de retour, une
   documentation publique ou un chat.
3. Demander à chaque testeur de créer son propre compte de test avec une
   adresse fictive (.test, .example ou .invalid). Ne jamais recycler des
   identifiants partagés ou des données personnelles.
4. Après déclaration du métier et de la commune fictifs, faire valider
   le profil professionnel depuis l'espace admin UCP. L'abonnement éventuel
   est une autorisation de test, pas un paiement ni une certification.
5. Vérifier la possibilité de se reconnecter dans un deuxième navigateur
   et sur un appareil mobile après fermeture.

La récupération de mot de passe par email n'est pas fonctionnelle dans cette
préproduction. Prévoir la révocation administrative des comptes de test.
Ne collecter aucun SIREN réel ni assurance ou pièce d'identité auprès des invités.

## Recette : un particulier A, un professionnel B et un tiers C

1. A rédige une demande de rénovation imaginaire. Sauvegarder un brouillon,
   recharger la page, reprendre le brouillon et publier exactement UNE annonce.
2. B déclare la spécialité et la commune correspondantes. L'admin active
   les droits de test, puis B retrouve la demande dans « Trouver des projets ».
3. B postule une fois. Un deuxième envoi identique ne crée pas un doublon.
4. A voit la candidature de B, compare les profils et confirme sa sélection.
   Les données privées restent invisibles tant que les droits ne sont pas réunis.
5. A et B envoient chacun un message fictif dans la conversation autorisée.
   C ne peut ni lire cette conversation ni les documents privés associés.
6. A clôture son annonce ; les deux espaces reflètent le statut approprié.
7. A ouvre « Guide de test → Signaler un problème de test », remplit le
   formulaire sans données sensibles et vérifie le ticket dans « Assistance ».
   L'admin consulte après motif, répond, et seul A voit sa réponse.
8. En coupure réseau, la saisie du message reste dans l'onglet ouvert ;
   aucun renvoi automatique n'est effectué après reconnexion.

**Arrêt immédiat** si fuite entre comptes, identité exposée, messages envoyés
sans confirmation, publication ou candidature dupliquée, données perdues
après confirmation de sauvegarde, paiement réel, ou erreur serveur répétée.
Conserver uniquement des preuves expurgées.

## Vérifier la mise en ligne sans modifier de données

Exécuter, depuis la machine de l'opérateur, le programme Python
application/tools/beta_preflight.py avec les variables d'environnement
UCP_BETA_BASIC_PASSWORD (mot de passe privé de préproduction),
UCP_BETA_BASE_URL (facultatif, HTTPS vers UCP) et
UCP_BETA_SHARE_URL (facultatif, URL de partage Vercel temporaire).

L'outil ne fait que des requêtes GET vers l'accueil et /api/health.
Il vérifie la présence des deux rôles, du guide de test et des en-têtes
no-store, CSP et noindex. Il refuse les domaines redirigeant ailleurs,
le HTTP non chiffré, les URLs contenant des identifiants, ainsi que
les API de santé qui ne se déclarent pas « staging / postgresql /
production=false ». Il ne révèle aucun token dans ses messages.
Un statut BLOCKED ou FAIL interdit de déclarer le préflight réussi.

Cette vérification de disponibilité NE remplace pas la connexion et
la recette manuelle des deux comptes testeurs. Elle ne vérifie pas
non plus le fonctionnement du WebGPU de Yahya sur téléphone.

## Sauvegarde, restauration et sortie de la bêta

La sauvegarde PostgreSQL existante (application/backend/pg_backup.py)
doit être lancée manuellement par l'opérateur depuis une machine sûre,
avec une connexion directe au schéma dédié UCP, en conservant les
identifiants UNIQUEMENT dans l'environnement sécurisé.
L'archive chiffrée est stockée hors GitHub et hors Vercel. La
restauration se teste dans une base totalement vide différente de
la source ; ne jamais utiliser une commande de purge sur Neon actif.
Voir application/docs/SAUVEGARDE_POSTGRESQL.md.

Cette opération réelle Neon n'a pas été effectuée dans cette session :
aucun accès opérateur direct et autorisé à la base n'a été fourni.
Si la bêta est strictement fictive, un responsable peut accepter par
écrit le risque de perdre ses seules données fictives ; cela ne
remplace pas une sauvegarde pour une ouverture commerciale.

En clôture : révoquer les partages Vercel, désactiver les comptes de
campagne, conserver les tickets utiles dépourvus d'identifiants et
planifier la purge uniquement après sauvegarde vérifiée et séparation
claire des données hors campagne. Ne pas créer de cron ni de purge
automatique.


## Suivi administratif des comptes de test

L'écran Administrateur → Vue d'ensemble affiche des compteurs calculés à partir
des vrais profils professionnels enregistrés : « À examiner », « Messagerie à
activer », « Autorisés à échanger » et « Sans profil déclaré ». Les chiffres
proviennent exclusivement de /api/admin/queue et /api/admin/metrics ; ils ne
comptent **pas** des invitations Vercel réellement remises ni des personnes
ayant complété le scénario bêta. Aucun statut de vérification légale n'est
inféré.

Des filtres locaux permettent d'afficher uniquement les profils nécessitant
une action. L'autorisation de test et l'accès messagerie requièrent toujours
un clic explicite et les droits administrateur/CSRF existants. La suspension
nécessite confirmation. Les contenus privés et les mots de passe ne sont
pas présentés dans les compteurs. Le lien « Examiner les retours et
signalements » ouvre la modération existante.

Ces éléments servent à préparer le groupe de testeurs **après** leur
inscription, pas à générer ou inviter automatiquement des comptes.


## Espace administrateur — préparation de la cohorte (6 novembre)

L'accueil administrateur affiche une rubrique **Préparer les tests utilisateurs** :
nombre de comptes particuliers, profils professionnels à examiner, profils approuvés
sans accès aux conversations, profils à accès de test actif. Ces chiffres sont lus
dans les données de préproduction ; **ils incluent les anciens comptes** et ne
mesurent ni les invitations réellement envoyées ni les tests achevés. Les tâches
externes (accès Vercel/Basic, sauvegarde réelle, recette téléphones) restent
explicitement non vérifiées.

La liste des professionnels se filtre localement entre **Tous**, **À examiner**,
**Accès à activer** et **Accès actifs**. Les actions d'autorisation, d'activation
des conversations et de retrait d'accès demandent une confirmation. Le retrait
désactive uniquement le droit simulé d'échanger dans les conversations :
l'autorisation du profil est conservée, les anciens messages ne sont pas effacés,
les décisions sont journalisées et le professionnel est notifié. Une réactivation
recontrôle les droits comme avant. Il ne s'agit **pas** d'un système d'invitations
Vercel ou de gestion d'une cohorte nominative.
