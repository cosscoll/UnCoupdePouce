# Préproduction UCP — 27 octobre 2026

## Architecture et périmètre

Même interface HTML/CSS/JS, mêmes routes FastAPI, sessions, CSRF et règles serveur.
SQLite reste utilisable en local sans service externe. La préproduction utilise
PostgreSQL via psycopg 3.2.12 (LGPL-3.0, conducteur PostgreSQL maintenu), sans frais
de licence et sans fournisseur d'authentification supplémentaire. Les photos,
comptes et messages sont persistés dans la même base, jamais sur le disque éphémère
Vercel. Aucun fichier utilisateur n'est servi publiquement.

L'adaptateur `backend/postgres.py` traduit les seules constructions SQLite utilisées
par UCP, conserve les clés étrangères, IDs, résultats et transactions. Un verrou
consultatif transactionnel sérialise les écritures, comme `BEGIN IMMEDIATE` en local.
C'est une solution de préproduction à faible charge, pas une architecture de montée
en charge validée. Les initialisations additives sont sérialisées séparément.
Aucune donnée SQLite existante n'est déplacée ou effacée. Une migration de données
réelles n'est ni réalisée ni autorisée par cette configuration.

Le schéma `ucp_private` n'est pas exposé au navigateur/Data API. Son accès PUBLIC est
révoqué ; RLS est activé sur les tables sans politiques publiques. Le propriétaire
PostgreSQL côté serveur conserve les droits nécessaires. Les autorisations métier
restent dans FastAPI ; RLS ne remplace pas ces contrôles. Aucune clé service_role
n'est nécessaire côté navigateur. Utiliser une base UCP dédiée, jamais les bases
IAgile ou CONTROL. Avant ouverture réelle, séparer le rôle de migration du rôle
applicatif et tester une politique de moindre privilège.

Sources consultées :
- https://vercel.com/docs/frameworks/backend/fastapi
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL

## Configuration Vercel prévue

Importer `cosscoll/UnCoupdePouce`, branche `main`, racine `application`.
Le point d'entrée `backend.app:app` est défini dans `pyproject.toml`.
Ne pas publier avant confirmation du plan gratuit et des limites du compte cible.
Les fichiers `.vercelignore` excluent les bases, environnements et tests du bundle.
Le serveur refuse de démarrer en mode staging si un élément obligatoire manque.

Définir directement dans les variables chiffrées Vercel, sans transmettre les
valeurs secrètes dans un chat ou un commit :

| Variable | Valeur attendue |
|---|---|
| `UCP_ENV` | `staging` |
| `UCP_DATABASE_URL` | URL PostgreSQL du projet UCP, connexion directe ou **pooler session** port 5432, avec `sslmode=verify-full` et certificat racine valide (`sslrootcert=system` si compatible) |
| `UCP_DATABASE_SCHEMA` | `ucp_private` |
| `UCP_ALLOWED_HOSTS` | Liste exacte des domaines autorisés, séparés par des virgules ; aucun joker |
| `UCP_STAGING_PASSWORD` | Secret aléatoire d'au moins 24 caractères |

L'accès privé utilise HTTP Basic, identifiant `ucp`, avant tout accès à la page,
aux ressources ou aux API. Les comptes demandeur/pro/admin ont ensuite leurs propres
identifiants. HTTPS et cookies Secure/HttpOnly/SameSite sont obligatoires.
Le domaine de chaque preview doit être explicitement ajouté ou rester inaccessible.
Ne jamais configurer `UCP_LOCAL_ADMIN_BOOTSTRAP` sur l'hébergement.
Ne pas utiliser de pooler **transaction** : cet adaptateur conserve un search_path
par session et le verrou d'initialisation est lié à la session. Les instructions
préparées automatiques sont désactivées par précaution.

Créer l'administrateur fictif depuis une session opérateur avec la même configuration
et `python backend/create_local_admin.py`. Le helper et `backend/demo.py` restent des
commandes manuelles ; ne jamais les lancer automatiquement sur une base non vide.
Les règles de tarif, sélection, chat et entreprise sont celles du laboratoire,
explicitement simulées. D01–D13 ne sont pas validées par ce déploiement.

## Publication après tests

`Application CI` exécute les tests SQLite, les tests d'intégration PostgreSQL 17 et
les huit tests DOM à chaque push concerné. Aucun déclencheur horaire, paiement,
email ou tâche autonome. Le projet Vercel `ucp-preproduction` a été créé avec le dépôt GitHub et la racine
`application`. Les builds sont temporairement ignorés (`exit 0`) tant que la base
et les secrets ne sont pas configurés ; rétablir les builds après configuration.
Ce workflow de tests ne prétend pas déployer le backend. Vérifier le commit,
les tests verts et le plan avant import/promotion. Ajouter l'URL réelle au README
et le lien vitrine uniquement après recette HTTPS du service déployé.

## Sauvegardes et recette de réception

Les tests SQLite existants vérifient sauvegarde/restauration et révocation des
sessions. Pour PostgreSQL, utiliser `pg_dump --format=custom --schema=ucp_private`
avec les identifiants dans l'environnement opérateur, puis `pg_restore` dans une
**base vide distincte**. Révoquer sessions/codes de récupération dans cette copie et
rejouer le parcours. Ne pas mettre une URL avec mot de passe dans les arguments de
commande ni committer les dumps. Le dump/restore PostgreSQL distant reste à exécuter
sur le projet choisi ; aucune sauvegarde fournisseur gratuite n'est présumée.

À vérifier sur l'hébergement : persistance après redéploiement, accès privé,
inscription distincte, annonce → candidature → sélection → messages, photos et
comptes tiers refusés, mobile/clavier, cookies HTTPS et restauration réelle.
Vercel limite la taille des requêtes : les photos volumineuses du laboratoire
peuvent être refusées par la plateforme ; réduire les images avant envoi. Pas de
PWA ou fonctionnement hors connexion promis ; les API privées ne doivent pas être
mises en cache par un futur service worker.

## Blocages constatés pendant la session

- Vercel : accès autorisé et revérifié après intervention utilisateur. Projet
  `ucp-preproduction` créé, ID `prj_rbWCIYaeYmGDe8Xg9Ftc2n5CArlv`, espace
  `team_S3CZCMukEO0dAG8QdpmXtabI`, framework FastAPI. Aucune version déployée
  et aucun domaine applicatif : la base et les variables restent à configurer.
  Les protections SSO par défaut sont conservées. Aucun service payant ajouté.
- Supabase : seule l'organisation IAgile est visible ; l'utilisateur a choisi une
  autre organisation. Son nom/accès reste à fournir. Aucun projet créé ou facturé.
- Chromium local : téléchargement refusé/tronqué par l'environnement. Les tests DOM
  ne sont pas présentés comme une recette visuelle de l'application.
