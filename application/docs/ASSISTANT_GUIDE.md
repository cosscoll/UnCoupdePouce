# Assistant UCP — aide conversationnelle guidée

Le bouton **Assistant UCP** apparaît après connexion pour les particuliers et les
professionnels. Une entrée est aussi disponible dans le formulaire d'annonce et
dans Mon profil. La fenêtre utilise le dialogue accessible existant et propose
des messages libres ainsi que des choix guidés.

## Préparer une annonce

Le particulier choisit « Préparer mon annonce », décrit son besoin, confirme les
métiers, indique la commune puis choisit un délai. Les suggestions de métiers
proviennent de règles et du catalogue chargé ; elles sont indicatives et jamais
sélectionnées automatiquement. Le choix « Je ne sais pas » reste exclusif des
métiers précis. Un autre métier peut être choisi dans le catalogue.

L'assistant présente ensuite un titre et une description issus des réponses, sans
inventer dimensions, budget, photos, prix ou diagnostic. Le bouton **Utiliser cette
proposition** prépare un nouveau brouillon dans le formulaire normal. Un éventuel
brouillon en cours est d'abord enregistré. Si l'enregistrement échoue, la saisie
initiale et la proposition restent disponibles. Fermer le dialogue ou changer de
session pendant cet enregistrement empêche le remplacement tardif du formulaire.

Le chatbot ne publie jamais. Le particulier relit, complète le budget facultatif
ou les photos et confirme la publication dans le parcours existant. La validation
serveur des annonces et les droits restent inchangés.

## Aider les professionnels

L'assistant explique profil, métiers et communes déclarés, recherche de missions,
favoris, suivi des candidatures et conditions de messagerie. Ses boutons ouvrent les
rubriques autorisées après un clic explicite. Il ne lit pas les dossiers privés pour
établir un diagnostic, ne débloque aucun compte et n'invente ni abonnement, ni
certification, ni devis. La rubrique Assistance reste accessible pour un cas précis.

## Fonctionnement et confidentialité

Il s'agit d'un **assistant guidé à réponses préparées**, pas d'un modèle de langage
généraliste. Aucun service d'IA externe, clé d'API, abonnement ou nouvel appel payant
n'est ajouté. Le texte saisi n'est pas envoyé à l'analytics ni enregistré comme
historique de chat. La conversation reste en mémoire de la page : au plus 24 messages,
1 200 caractères par saisie. Elle est effacée au changement de compte/session ou au
rechargement ; « Nouvelle conversation » permet de la réinitialiser.

Après validation de la proposition, les champs transférés suivent le fonctionnement
normal des brouillons, y compris leur enregistrement serveur lors des actions du
formulaire. Les coordonnées évidentes sont refusées dans le chatbot pour guider
la saisie ; ce contrôle d'interface ne remplace pas la validation serveur.

Le module `static/guided-help.js` sépare suggestions, construction de proposition
et dialogue de l'intégration `app.js`. Les messages sont insérés comme texte, sans
HTML actif. Le journal ajoute les nouvelles entrées sans réannoncer tout l'historique.
L'absence du module d'aide ne doit pas empêcher le fonctionnement de l'application.

## Recette et limites

Tests de logique : métiers actifs/multi-métiers, coordonnées Unicode, proposition
sans faits inventés. Simulations DOM : parcours particulier/pro, validation explicite,
absence d'écriture avant confirmation, brouillon conservé, refus réseau, annulation,
réponse tardive, déconnexion, historique borné et texte non interprété comme HTML.

Aucune recette visuelle, lecteur d'écran ou appareil réel n'est déduite de ces tests.
Les demandes libres hors des sujets prévus reçoivent une explication des limites et
une orientation ; aucune compréhension générale ou génération par IA n'est revendiquée.
Un modèle externe, mémoire durable, diagnostic technique, estimation de devis et
actions autonomes sur les comptes ne sont pas livrés.
