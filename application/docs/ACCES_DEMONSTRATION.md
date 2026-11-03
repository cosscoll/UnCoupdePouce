# Identifiants des deux comptes fictifs

La connexion accepte l’email existant ou un identifiant court, conservé dans
`login_aliases`. Le rôle, l’email et les données du compte restent inchangés.
L’inscription publique du laboratoire conserve sa règle de douze caractères.

Un administrateur authentifié peut configurer les deux comptes fictifs fournis
avec la démonstration par `POST /api/admin/demo-access`, avec CSRF valide.
Le corps contient `accounts` (un ou deux éléments), chaque élément ayant `email`,
`alias` et `password`. Seuls les deux comptes de démonstration initiaux sont
éligibles ; aucun compte administrateur ne peut être modifié par cette route.
L’alias est normalisé en minuscules, unique et limité à des lettres/chiffres ASCII,
points, tirets et soulignés. Le mot de passe n’est jamais renvoyé ni journalisé.
Les erreurs de validation sont génériques et n’incluent pas le corps reçu.

L’opération conserve les IDs, rôles, profils, projets et échanges. Elle remplace
le hash du mot de passe, révoque les sessions et codes de récupération des comptes
concernés, nettoie leurs compteurs de connexion et trace la modification sous
l’administrateur. Toute erreur annule le lot entier. Les identifiants courts et
les emails utilisent le même compteur de tentatives, sans contournement par
alternance. La réinitialisation par canal email demeure non livrée.

Les mots de passe et les accès privés sont transmis au propriétaire séparément.
Ils ne doivent pas figurer dans le dépôt ou dans les exemples de requêtes.
Ce mécanisme est réservé au laboratoire/à la préproduction privée ; aucun mode
commercial ne peut être activé par cette opération.

Vérifications : tests d’accès par alias, conservation des rôles/IDs, révocation,
limitation commune alias/email, validation sans écho des secrets, droits admin/CSRF,
collision et panne du journal. Deux scénarios sont repris dans PostgreSQL ; un
test DOM vérifie que le formulaire accepte un identifiant sans arobase.
