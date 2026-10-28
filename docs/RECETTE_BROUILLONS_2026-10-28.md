# Sauvegarde des brouillons — recette du 28 octobre 2026

Périmètre : F10, préproduction privée fictive, sans publication automatique.
L'assistant enregistre les modifications après une pause de 1,2 seconde, informe
de leur état et conserve le texte récent pendant une écriture. Une panne suspend
les nouvelles écritures automatiques jusqu'au réessai explicite ou à la correction
de données invalides. La sauvegarde manuelle reste disponible.

## Contrôles automatisés

Les tests API vérifient les réessais simultanés d'une même création, la séparation
des comptes, le quota de trente, les clés invalides, CSRF et rôles, le rollback
commun de l'audit et du marqueur, ainsi que l'impossibilité de ressusciter un brouillon
supprimé. Un réessai ne récupère jamais la version d'une autre fenêtre pour l'écraser.
Une création déjà modifiée ou publiée porte un indicateur de conflit pour le client.

Le scénario partagé PostgreSQL contrôle la propriété et les versions. Le test de
dump/restore isolé vérifie aussi la conservation du marqueur de création après une
photo : la réponse de reprise signale le changement sans adopter sa version récente.
Les anciennes sessions restent exclues de la sauvegarde.

Les simulations DOM couvrent la pause, le maintien du focus et du texte récent,
l'attente d'une sauvegarde lors d'une action manuelle, la réponse de création perdue,
le réessai du contenu initial puis l'envoi du texte récent, le conflit et la copie
de récupération, le budget invalide puis zéro, la déconnexion, la fermeture de page
et les changements de métiers. Un brouillon déjà modifié après sa création n'est
pas présenté à tort comme une copie locale confirmée.

## Limites

Le délai s'exécute uniquement dans la page ouverte. Il n'existe ni tâche récurrente,
ni cache privé hors connexion. La fermeture forcée avant confirmation peut perdre
une saisie. Les tests DOM et API ne valent pas recette sur Android/iPhone réels,
au clavier ou au lecteur d'écran. Les arbitrages D01–D13 restent inchangés.
