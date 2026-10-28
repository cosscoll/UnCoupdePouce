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

## Configuration Vercel effective

Importer `cosscoll/UnCoupdePouce`, branche `main`, racine `application`.
Le point d'entrée `backend.app:app` est défini dans `pyproject.toml`.
Plan Hobby Vercel et Neon Free vérifiés ; aucune offre payante souscrite.
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

Le premier démarrage peut peupler une base **vide** avec `UCP_DEMO_SEED_PASSWORD`
(secret aléatoire >= 24 caractères). Le verrou d'initialisation empêche les doubles
semis ; une base déjà peuplée n'est ni réinitialisée ni modifiée par ce mécanisme.
Les règles de tarif, sélection, chat et entreprise restent celles du laboratoire,
explicitement simulées. D01–D13 ne sont pas validées par ce déploiement.

## Publication effective

Application : https://ucp-preproduction.vercel.app

Vercel importe `main`, racine `application`. Les builds ne sont plus ignorés.
Les protections Vercel Authentication et HTTP Basic sont conservées.
Neon `ucp-preproduction` est une base dédiée ; aucune base IAgile/CONTROL modifiée.
L'intégration Marketplace a fourni `UCP_DATABASE_DATABASE_URL_UNPOOLED` ; le serveur
l'utilise sans divulgation au navigateur. TLS vérifie le nom DNS et la chaîne de
certificats via certifi ; une adresse IPv4 est sélectionnée côté Vercel pour libpq.
Le backend conserve les comptes, sessions, messages et photos dans PostgreSQL.

`Application CI` contrôle SQLite, PostgreSQL 17 et les tests DOM à chaque push.
Vercel déploie automatiquement les commits `main`. Le statut de CI doit être vérifié
avant de considérer une version validée : le build Vercel n'est pas bloqué par CI.
Aucun déclencheur horaire, paiement, email ou tâche autonome n'a été ajouté.

## Sauvegardes et recette de réception

Les tests SQLite existants vérifient sauvegarde/restauration et révocation des
sessions. L’outil manuel `backend/pg_backup.py` est maintenant testé avec les vrais
clients PostgreSQL 17 et une base jetable de CI ; voir SAUVEGARDE_POSTGRESQL.md.
Il ne fournit aucune API de sauvegarde et ne touche pas au projet Neon réel.
Pour une intervention opérateur brute PostgreSQL, utiliser `pg_dump --format=custom --schema=ucp_private`
avec les identifiants dans l'environnement opérateur, puis `pg_restore` dans une
**base vide distincte**. Révoquer sessions/codes de récupération dans cette copie et
rejouer le parcours. Ne pas mettre une URL avec mot de passe dans les arguments de
commande ni committer les dumps. Le dump/restore PostgreSQL distant reste à exécuter
sur le projet choisi ; aucune sauvegarde fournisseur gratuite n'est présumée.

Recette HTTPS réussie : persistance après redéploiement, accès privé, inscription
distincte, annonce → candidature → sélection → messages, photos et refus inter-comptes,
cookies HTTPS. Restent mobile/clavier et restauration PostgreSQL distante.
Vercel limite la taille des requêtes : les photos volumineuses du laboratoire
peuvent être refusées par la plateforme ; réduire les images avant envoi. Le parcours PWA est décrit dans PWA.md ; son installation sur appareil reste
à vérifier. Le worker ne met aucune API privée en cache et ne propose pas de
consultation hors connexion des données métier.

## Limites restantes

Supabase a été examiné mais le quota gratuit de l'organisation visible est occupé.
Neon Free a été installé par le propriétaire sans toucher aux projets existants.
Le backend HTTPS et les connexions des trois rôles ont été vérifiés sur le service
réel le 27 octobre. Voir QA.md pour la recette du parcours et ses limites.
La restauration PostgreSQL distante, la charge et la recette mobile restent à
réaliser avant toute ouverture réelle. La PWA et les arbitrages D01–D13 restent
hors validation. Aucune ouverture commerciale ni paiement réel activés.
