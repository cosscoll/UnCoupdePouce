# UCP — accès à l’application et deux espaces, 3 novembre 2026

## Problème constaté

L’utilisateur consulte GitHub Pages. Le fichier racine `index.html` redirigeait
immédiatement vers `site-vitrine/dist/index.html`, qui est une présentation du
projet. Le code applicatif était publié dans `application/` et son service était
hébergé séparément sur Vercel. Les comptes rendus précédents ne permettaient pas
à l’utilisateur de constater clairement ce travail depuis son adresse habituelle.

## Correction livrée

- L’adresse principale GitHub Pages devient un écran de choix avec deux entrées
  explicites : **Particulier** et **Professionnel**. La redirection vers la vitrine
  est retirée. Les boutons ouvrent l’application, sans simuler de données métier.
- La navigation de la vitrine donne un accès visible à cette entrée.
- `/particulier` et `/professionnel` servent l’application FastAPI et adaptent
  l’accueil de connexion et le rôle proposé à l’inscription.
- Après connexion, le rôle retourné par le serveur détermine l’interface, même
  quand l’utilisateur a ouvert l’adresse de l’autre rôle.
- L’accueil particulier présente les projets non clôturés, brouillons, échanges
  et notifications du compte. Les actions ouvrent le vrai formulaire de projet,
  un brouillon enregistré, le suivi des projets ou la messagerie.
- L’accueil professionnel ouvre le tableau d’activité existant, puis la recherche,
  les candidatures, les favoris, le profil et les messages.
- Un lien de vue explicite comme `#projects` ouvre une vue autorisée pour le compte.
  Un nom de vue d’un autre rôle est ignoré. Le fragment ne contient pas de données
  de projet ou d’identifiant personnel.

## Adresses de référence

| Usage | Adresse |
|---|---|
| Entrée principale à partager | https://cosscoll.github.io/UnCoupdePouce/ |
| Espace particulier | https://ucp-preproduction.vercel.app/particulier |
| Espace professionnel | https://ucp-preproduction.vercel.app/professionnel |
| Présentation du projet | https://cosscoll.github.io/UnCoupdePouce/site-vitrine/dist/index.html |
| Code livré | https://github.com/cosscoll/UnCoupdePouce/tree/main/application |

## Vérifications et limites

Deux tests serveur vérifient que l’ouverture d’une entrée de l’autre rôle ne
change pas l’identité ni les permissions. Six scénarios DOM couvrent le choix
d’entrée, les deux accueils, la reprise d’un brouillon, les accès par URL et
l’indisponibilité d’une rubrique. Les tests DOM restent des simulations.

La préproduction conserve ses protections d’accès et ses comptes de test. Le
portail GitHub Pages est public ; les tableaux de bord et les actions métier
nécessitent une connexion autorisée à l’application. Ce lot ne retire aucune
protection, ne crée pas de compte réel et n’active aucun paiement. Le verrou
HTTP Basic ayant bloqué la précédente recette navigateur, aucune recette visuelle
des tableaux de bord connectés n’est revendiquée ici. Cette correction d’accès
ne vaut pas conformité complète au cahier des charges.
