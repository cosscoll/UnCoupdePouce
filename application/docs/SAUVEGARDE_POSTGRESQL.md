# Sauvegarde et restauration PostgreSQL — outil opérateur manuel

`backend/pg_backup.py` ne fournit aucune route HTTP. Il n'est jamais appelé par le
serveur web, un cron, un worker ou une automatisation récurrente. Il sert à préparer
une sauvegarde cohérente et une copie isolée, sans écraser une base existante.

## Fonctionnement

Le dump custom utilise les outils PostgreSQL natifs et un snapshot exporté partagé
avec les contrôles de volumes, dans une transaction REPEATABLE READ en lecture seule.
Le schéma UCP exact est sélectionné. Les structures des tables de sessions, resets
et échecs d'authentification sont présentes, mais leurs données sont exclues.
Comptes, projets, messages, photos, décisions et valeurs de séquences sont conservés.

Archive et manifeste sont créés en mode 600, sans écrasement. Le manifeste contient
le schéma, les volumes attendus, une empreinte de source et le SHA-256 de l'archive,
sans URL, hôte, identifiant ou mot de passe de connexion. Les fichiers restent
sensibles : les comptes et empreintes de mots de passe y figurent. Prévoir chiffrement,
stockage privé, rétention et contrôle opérateur avant une utilisation réelle.

La restauration exige une base distincte **totalement vide**, la confirmation de
l'opérateur, des fichiers réguliers privés et un checksum valide. Aucun `--clean`,
DROP ou remplacement d'objet n'est utilisé. `pg_restore` agit en une transaction ;
les volumes sont contrôlés, les sessions encore purgées et RLS activé sur les tables.
La base source reste intacte. Une copie qui échoue à la validation ne doit pas être
utilisée et nécessite un contrôle manuel.

Un checksum détecte une altération, pas l'origine d'un fichier. Restaurer uniquement
les archives de confiance créées sous contrôle de l'opérateur : un dump PostgreSQL
peut contenir du SQL exécutable. Ne jamais restaurer une archive tierce non inspectée.

## Utilisation préparée

Installer des clients PostgreSQL compatibles avec le serveur (les tests emploient 17),
et les dépendances Python du backend. Utiliser une machine opérateur de confiance,
un répertoire privé et une connexion directe/session. Renseigner les URL dans un
mécanisme d'environnement sécurisé, sans les écrire dans les commandes ou le dépôt.
Une connexion distante exige `sslmode=verify-full` et une chaîne de certificats valide.

```sh
# UCP_BACKUP_SOURCE_URL : secret de connexion source, fourni à l'opérateur.
python application/backend/pg_backup.py backup /chemin-prive/ucp.dump --schema ucp_private
# UCP_BACKUP_TARGET_URL : connexion à une NOUVELLE base vide distincte.
python application/backend/pg_backup.py restore /chemin-prive/ucp.dump --confirm-empty-target
```

Les mots de passe passent au client PostgreSQL via son environnement, jamais dans
ses arguments, le manifeste ou les journaux. Les URL ne sont ni demandées par le site
ni renvoyées au navigateur. Les sorties d'erreur des clients ne sont pas publiées. Les fichiers `.dump` et
leurs manifestes sont exclus de Git et du bundle Vercel ; conserver malgré tout
les archives opérateur dans un répertoire privé extérieur au dépôt. Les paramètres
PG implicites de routage doivent être retirés pour éviter une cible différente
entre les contrôles Python et les clients PostgreSQL.

## Recette et limites

La CI utilise exclusivement le service PostgreSQL 17 fictif du job. Elle crée une
base de copie jetable, utilise les vrais `pg_dump`/`pg_restore`, vérifie données,
photos, séquences, exclusion des anciennes sessions et refus d'une cible non vide,
puis détruit seulement cette base de test créée pour le scénario.

**Ce test ne constitue pas une sauvegarde ou restauration du projet Neon réel.**
Les identifiants de base chiffrés dans Vercel ne sont pas récupérés ni divulgués.
Le dump/restauration distant, le chiffrement, la rétention et le stockage externe
restent à réaliser avec l'accès opérateur approprié. Aucun abonnement, stockage
payant ou sauvegarde récurrente n'est créé.

Sources : [pg_dump 17](https://www.postgresql.org/docs/17/app-pgdump.html),
[pg_restore 17](https://www.postgresql.org/docs/17/app-pgrestore.html),
[variables libpq](https://www.postgresql.org/docs/17/libpq-envars.html).
