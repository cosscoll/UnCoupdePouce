# Assistant conversationnel guidé — recette des 2 et 3 novembre 2026

Demande : accompagner particuliers et professionnels dans UCP, notamment pour
remplir une annonce. La version livrée est explicitement guidée, sans modèle de
langage externe ni nouveau service payant.

| Parcours | Preuve automatisée |
| --- | --- |
| Particulier : besoin → métiers confirmés → commune → délai → proposition | Simulation DOM, aucune écriture avant validation |
| Transfert vers une nouvelle annonce | Formulaire rempli, aucune publication automatique |
| Brouillon déjà en cours | Sauvegarde de la saisie initiale avant remplacement ; double clic sans double transfert |
| Échec réseau, fermeture ou déconnexion pendant la sauvegarde | Saisie initiale et proposition conservées ; remplacement tardif empêché |
| Professionnel : profil, missions, candidatures, chat et assistance | Réponses adaptées au rôle, navigation après clic explicite seulement |
| Choix des métiers | Catalogue courant, suggestions indicatives, métier inconnu exclusif, confirmation obligatoire |
| Coordonnées et balises HTML | Avertissement de saisie, texte non interprété comme HTML |
| Confidentialité | Aucun stockage navigateur ; historique borné et effacement à la déconnexion/changement de session |
| Accessibilité logique | Journal ajouté sans recréer les anciens messages, focus du dialogue et des choix |
| Module indisponible | Application principale encore utilisable, aide signalée indisponible |

Trois tests de logique vérifient les suggestions, coordonnées Unicode et absence de
faits inventés dans la proposition. Douze nouveaux scénarios DOM complètent la suite
d'interface. Le chatbot ne lit aucun dossier privé pour donner un avis, ne débloque
aucun compte et ne certifie aucun professionnel.

Voir [le fonctionnement](../application/docs/ASSISTANT_GUIDE.md),
[le complément au cahier des charges](CHATBOT_CAHIER_DES_CHARGES_2026-11-02.md) et
[la PR nº 49](https://github.com/cosscoll/UnCoupdePouce/pull/49).

## Limites

La version ne comprend pas librement tous les sujets : elle pose des questions et
oriente au moyen de règles/réponses préparées. Conversation non conservée après
rechargement ; aucun modèle externe, devis, diagnostic technique ou action autonome
sur les comptes. Le formulaire et le serveur restent responsables de la validation
et de la publication après la décision de l'utilisateur.

Aucun rendu sur téléphone, zoom, lecteur d'écran ou navigateur réel n'est validé
par ces simulations. F20 demeure partiel. La matrice conserve 92 exigences
historiques, dont 37 encore à réévaluer.

## CI et livraison

La [CI complète](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41429540457)
réussit : **249 tests Python SQLite/PostgreSQL et 112 tests DOM/logique/worker**
(106 DOM, 3 logique de l'assistant et 3 worker), sur la révision
`f9073a68c3a9c0b3534c0e6d0550c34258078f39`. Le commit fusionné est
`85224070b3fdd281e028844631ec4671bb0060c7`.

Le déploiement `dpl_7RW1U5hxRC98gqgfm3jiFZAznWZ6` est `READY`, au même commit
applicatif. La vitrine réussit ses contrôles statiques et ses 55 tests JavaScript.

## Vérification HTTPS finale du 3 novembre

Le bouton de l'assistant, l'ordre de chargement des scripts et les octets des fichiers
`guided-help.js`, `app.js` et `style.css` correspondent aux sources fusionnées.
Une proposition fictive issue du constructeur de l'assistant a été acceptée par
l'API de brouillons. Sa relecture confirme les réponses, l'absence de projet publié
et la conservation du budget facultatif vide. Le brouillon de test a été supprimé.
Voir [la preuve synthétique](qa/chatbot-2026-11-03.json).

La création d'un brouillon renvoie seulement son identifiant et sa version : le
contrôle du contenu a été fait par sa relecture propriétaire. Aucune publication
n'a été demandée. Ces vérifications HTTPS ne constituent pas une interaction dans
un navigateur réel ni une recette visuelle sur téléphone.
