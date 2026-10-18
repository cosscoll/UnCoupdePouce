# Architecture et exploitation privées

## Découverte et atelier 3D — 17 octobre 2026

Le JSON existant des brouillons accepte `actions` (12 textes de 120 caractères maximum) et `photo_visibility` (`private` par défaut ou `matched` sur consentement explicite). Aucun schéma SQL modifié. Les anciennes données restent compatibles et privées. `/api/projects` enrichit uniquement les projets déjà autorisés avec délai, actions et identifiants des photos partagées. Les fichiers ne sont jamais publics ; leur route vérifie les autorisations. Retrait par `POST /api/v4/projects/{id}/hide-previews`, protégé CSRF et journalisé. Les copies déjà téléchargées ne peuvent pas être rappelées. Le tri compte les métiers correspondants puis la récence, sans IA ni calcul de distance.

`static/atelier.mjs` importe Three.js r180 localement sur activation. Scène procédurale illustrative sans modèle distant ; la demande préremplie reste à compléter. `clear(#view)` détruit renderer, géométries, matériaux, écouteurs et ResizeObserver. Formulaires et fil ne dépendent pas de WebGL. Provenance : `static/vendor/three-r180/README.md`. Preuves/limites : `CHANTIER_03_RESULTATS.md`.

Le navigateur sert HTML/CSS/JavaScript depuis FastAPI. Les appels `/api/` partagent l'origine et la session HttpOnly/SameSite. Les écritures authentifiées exigent un jeton CSRF. Le serveur écoute uniquement sur loopback. Un contrôle d'hôte complémentaire ne remplace jamais une protection réseau.

SQLite conserve utilisateurs, sessions, profils, projets, candidatures, messages, notifications, entreprises, audit, brouillons, photos, catalogue, signalements, décisions de modération et codes de récupération. Chaque opération ouvre sa propre connexion ; les écritures sensibles sont transactionnelles. Les clés étrangères, contraintes d'unicité et BEGIN IMMEDIATE protègent les opérations concernées. Il n'y a pas de RLS PostgreSQL ni de base Supabase connectée.

## Évolution de schéma

`app.init_db()` conserve les tables v3.6 et ses migrations additives. `features_v4.install()` ajoute les colonnes de suspension, métiers multiples et masquage, puis les tables v4 via CREATE TABLE IF NOT EXISTS. Le catalogue initial est ajouté sans écraser les modifications administrateur. Le redémarrage est idempotent pour ces objets, mais ce mécanisme ne constitue pas un gestionnaire de migrations production.

La version 4.0.1 ajoute `message_retries` : clé primaire conversation/émetteur/clé de réessai, référence au message, empreinte de son contenu normalisé. Contrôle d'accès, écriture du message, clé de déduplication et notification sont dans la même transaction. Une erreur annule l'ensemble. Le client conserve la clé après une perte de réponse dans le même écran ; quitter/recharger la page abandonne ce contexte. La garantie est donc limitée aux tentatives portant la même clé, pas à tous les messages de texte identique.

Avant changement d'une base : arrêter l'application, sauvegarder avec le script SQLite, travailler sur une copie fictive, vérifier intégrité et relations, lancer les tests, conserver ancien code et ancienne sauvegarde. Restaurer vers un nouveau chemin ; aucun rollback automatique sur une base modifiée n'est promis. Ne pas exécuter ces migrations sur données réelles.

## Récupération locale

Depuis `backend/`, `../.venv/bin/python recovery.py compte@ucp.test` émet un code à usage unique valable quinze minutes. Le code n'est pas envoyé par email et doit rester hors des journaux. La réinitialisation révoque les anciennes sessions. `create_local_admin.py` permet une création locale contrôlée sans admin existant. Le bootstrap HTTP exige un secret éphémère configuré explicitement ; ne pas activer cette voie dans une exposition publique.

## Limites techniques explicites

Les comptes sont fictifs, les SIREN et abonnements sont simulés. Le matching compare métiers et communes déclarées, sans géocodage ou distance. Photos : cinq au maximum par brouillon, fichiers limités et réencodés, métadonnées supprimées ; ce n'est pas un antivirus ni une modération du contenu visuel. Pas d'email/SMS/push, de facturation réelle, d'index moteur de recherche, de fournisseur Auth externe, de PWA installable ou de monitoring distant. La validation de production, de confidentialité et de rétention reste à réaliser.

## Contrôles 4.0.2

La garde `authenticated_db` revérifie session, expiration et rôle dans la transaction, ainsi que le CSRF pour les écritures. Les accès déjà autorisés avant une révocation suivent l’ordre des transactions ; aucune interruption rétroactive des réponses en cours n’est promise. Le login relit les identifiants et la suspension après le calcul de hash, sous verrou d’écriture. La liste des conversations exclut désormais les échanges bloqués par modération, suspension ou retrait de validation. Voir `AUDIT_SECURITE.md`.
