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


## Publication et vérification constatées

La [PR nº 52](https://github.com/cosscoll/UnCoupdePouce/pull/52) est fusionnée dans
`main` au commit `75b6a2e6fba8137f3ac4a79c2ee15cb28ecf8c9d`.
La [CI applicative](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41644161575)
réussit sur `dbf2378c9b77d6b492fc36c536a609a7a4c05542` : **262 tests Python et
120 tests DOM/logique/worker**. La
[CI de vitrine](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41644161530)
réussit également, y compris régénération identique et 55 tests JavaScript.

Le déploiement Vercel `dpl_3AxZw9jffE48odaETGfRsmoi9PYk` est `READY` sur le
commit fusionné et associé à `ucp-preproduction.vercel.app`. La publication
[GitHub Pages](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41644754018)
réussit sur le même commit. Le HTML de l’adresse principale, récupéré par HTTPS
avec revalidation, est identique au fichier publié et ne contient plus de redirection.

Dans le navigateur de contrôle, l’ancienne redirection était encore en cache.
L’[adresse actualisée](https://cosscoll.github.io/UnCoupdePouce/?v=75b6a2e)
affiche les deux entrées et leurs boutons réels. La
[capture de l’accueil publié](qa/accueil-deux-espaces-1793712734357.jpg) montre ce
rendu sur le navigateur de bureau de contrôle ; elle ne montre pas les tableaux
de bord connectés et ne vaut pas recette mobile ou sur appareil réel.


Les contrôles HTTPS des deux comptes fictifs réussissent après déploiement : les
pages d’entrée et les API des deux accueils répondent, une entrée opposée conserve
le rôle authentifié et les routes de l’autre rôle restent refusées. Le JavaScript
et le CSS servis sont identiques aux fichiers livrés ; le service reste en mode
staging PostgreSQL. Aucune donnée métier n’a été créée ou modifiée par ce contrôle.
La CI automatique de `main` réussit également au
[run 41644753705](https://github.com/cosscoll/UnCoupdePouce/actions/runs/41644753705).

La [preuve structurée](qa/deux-espaces-2026-11-03.json) distingue les contrôles
serveur/DOM, le contrôle HTTPS et le seul rendu visuel observé : l’accueil public.
