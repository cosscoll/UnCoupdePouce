# Assistance générale — préproduction privée

La rubrique Assistance conserve les signalements existants et ajoute des demandes
sans lien obligatoire avec un projet ou une conversation. Seuls les comptes
connectés et actifs peuvent soumettre une demande. Il n'existe pas de formulaire
anonyme, de service email ou de promesse de délai de réponse.

## Parcours

Le demandeur ou professionnel choisit un thème, un objet et décrit son besoin.
La demande est enregistrée sous son propre compte. Une copie exacte déjà ouverte
est refusée, y compris lors d'envois simultanés. Les listes personnelles sont
paginées et montrent l'état ainsi que la réponse du support. Le bouton Actualiser
permet de reprendre le suivi sans renvoyer la demande.

Dans Modération, l'administrateur ne voit d'abord que les métadonnées des demandes
ouvertes. Ouvrir un dossier nécessite un motif interne et une consultation auditée
avant restitution de son contenu. La réponse est impossible avant un examen
journalisé par ce même administrateur. Réponse, clôture, date et notification
interne sont enregistrées dans une seule transaction. Une seconde clôture est
refusée et n'envoie aucune notification supplémentaire.

Les motifs internes ne sont pas exposés à l'auteur. Sa réponse est visible dans
Assistance et dans son export de données, jamais dans un autre compte. Après
clôture, le lecteur administratif de contenu est bloqué. Les actions sont tracées ;
aucun droit d'accès ou abonnement n'est modifié automatiquement par une demande.

## Confidentialité et reprise

Les textes sont rendus comme texte, jamais comme HTML actif. Les vues et dialogues
privés sont effacés lors d'une déconnexion ou expiration de session. Une panne
d'envoi conserve la saisie dans la page sans renvoi automatique à la reconnexion.
La table dédiée `support_tickets` est privée et couverte par les sauvegardes ; la
recette PostgreSQL restaure aussi une demande de support et son accès propriétaire.

La suppression d'un compte ayant un historique de support nécessite la procédure
manuelle existante ; aucune règle définitive de rétention/effacement n'est inventée.
La préproduction n'accepte que des données fictives. Ne pas saisir de mot de passe,
code d'accès ou document personnel dans une demande.

## Périmètre restant

Escalade interne, équipe de support avec rôles distincts, fil de réponses multiples,
contacts anonymes, emails transactionnels, réclamations commerciales, engagements de
délai et politique de conservation restent à définir et réaliser. Aucun paiement,
remboursement, renouvellement ou action commerciale n'est déclenché par ce module.
