# Complément au cahier des charges — chatbot UCP

Demande du 2 novembre : guider les particuliers et professionnels dans l'application,
notamment pour remplir une annonce de chantier. Ce complément détaille cette demande
et la relie à F20 ; il ne redéfinit pas les règles commerciales D01–D13.

| Référence | Comportement attendu | État et limites |
| --- | --- | --- |
| CA01 | Assistant visible, conversation et choix adaptés au rôle | Développé pour les comptes particuliers/professionnels connectés ; recette appareils ouverte |
| CA02 / F20 | Questions sur besoin, métiers, commune et délai | Développé ; suggestions déterministes à confirmer, sans diagnostic ni géocodage |
| CA03 / F10-F12 | Proposition modifiable, transfert explicite, sauvegarde préalable de la saisie en cours | Développé et simulé en DOM ; aucune publication par le chatbot |
| CA04 | Orientation du professionnel vers profil, missions, candidatures, messages et assistance | Développé ; réponses préparées et navigation explicite, aucun examen de dossier privé |
| CA05 / F39 | Échanges privés, bornés et séparés des comptes successifs | Mémoire de page seulement, effacement à la déconnexion/changement de session, aucune transmission à un modèle externe |
| CA06 | Afficher les limites, sans inventer prix, certification ou diagnostic | Libellé « assistant guidé », réponses de périmètre et recours à l'assistance ; modèle de langage non branché |
| CA07 / F91 | Clavier, rendu responsive, lecteur d'écran et erreurs | Simulations et styles adaptés ; recette visuelle et sur appareils réels non validée |

Le déploiement de ce premier chatbot n'engage aucun nouveau service payant. La
conversation n'est pas conservée entre rechargements. Après validation, les champs
de la proposition sont gérés par le parcours normal de brouillon et ses contrôles
serveur. Tout futur modèle externe et toute persistance de conversation nécessitent
une conception distincte du budget, de la confidentialité et des autorisations.

Voir [le fonctionnement livré](../application/docs/ASSISTANT_GUIDE.md). F20 reçoit
une conclusion partielle ; les 92 exigences historiques restent dans leur matrice,
dont 37 encore à réévaluer après ce lot. Aucun pourcentage d'achèvement n'en est déduit.
