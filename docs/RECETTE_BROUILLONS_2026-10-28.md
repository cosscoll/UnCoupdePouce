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

La [CI 40753348285](https://github.com/cosscoll/UnCoupdePouce/actions/runs/40753348285)
valide **193 tests Python et 75 tests DOM/worker**, avec PostgreSQL 17 et le vrai
dump/restore en base fictive isolée. La [pull request 42](https://github.com/cosscoll/UnCoupdePouce/pull/42)
est fusionnée au commit applicatif `4964369`. La suite locale comprend 181 tests
Python réussis et douze contrôles PostgreSQL exécutés par cette CI.

Les derniers tests DOM vérifient aussi le remplissage déclenchant seulement
`change` et le retrait d'une photo pendant une sauvegarde. La suppression attend
l'écriture en cours et sa version est utilisée pour la sauvegarde suivante.

## Recette HTTPS de la version publiée

Quatre groupes de contrôles réussissent sur le service déployé : reprise de la
première création avec la même clé sans second brouillon ; modification par une
autre session du même compte puis refus de version périmée, contrôle propriétaire
et CSRF ; suppression conservée malgré un ancien réessai ; brouillon de démonstration
rééditable et code de l'interface effectivement publié. La perte de réponse initiale
est simulée par la répétition de la même tentative après son premier enregistrement.
Aucune panne du réseau ou interaction de navigateur réel n'est revendiquée par ce test.

Le brouillon de recette supprimé reste supprimé. Un second brouillon fictif
« Reprendre ma demande fictive », suivi d'un identifiant de recette, est conservé
sur le compte `camille@ucp.test`, dans **Mes projets → À reprendre**. Le test ne
publie aucun projet et ne modifie aucun projet existant. Les identifiants privés
déjà remis ne sont pas copiés dans le dépôt.

Le commit applicatif `4964369` est READY sur le projet privé `ucp-preproduction`.
La page d'avancement publique est actualisée ; ses contrôles statiques et 55 tests
réussissent après cette modification.

## Limites

Le délai s'exécute uniquement dans la page ouverte. Il n'existe ni tâche récurrente,
ni cache privé hors connexion. La fermeture forcée avant confirmation peut perdre
une saisie. Les tests DOM et API ne valent pas recette sur Android/iPhone réels,
au clavier ou au lecteur d'écran. Les arbitrages D01–D13 restent inchangés.
