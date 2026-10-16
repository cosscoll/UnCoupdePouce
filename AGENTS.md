# Instructions permanentes — Un Coup de Pouce (UCP)

## 1. Contexte et objectif

UCP est un projet français de mise en relation entre particuliers et professionnels du BTP. Le dépôt contient deux produits distincts :

- `application/` : laboratoire local UCP 4.x (FastAPI, SQLite, HTML/CSS/JavaScript), non public et non commercial ;
- `site-vitrine/` : vitrine statique de pré-lancement, distincte de l'application.

L'objectif est de faire évoluer progressivement cette base vers un produit fiable, sécurisé et vérifié, sans présenter comme opérationnelle une capacité qui ne l'est pas. Préserver l'architecture actuelle et les comportements existants est la règle par défaut.

## 2. Conventions de développement

- Lire d'abord les README et la documentation pertinente avant de modifier une zone fonctionnelle.
- Préférer des changements petits, cohérents, réversibles et accompagnés de tests adaptés.
- Conserver les technologies existantes : Python/FastAPI/SQLite et HTML/CSS/JavaScript natif pour l'application ; Python et site statique pour la vitrine.
- Ne pas introduire React, Three.js, GSAP, une base distante, un service externe ou une bibliothèque simplement parce qu'ils sont disponibles.
- Toute nouvelle dépendance exige une justification, une vérification de licence, de sécurité, de maintenance et de coût ; demander l'autorisation avant son installation.
- Respecter les styles, noms et langues déjà présents. Documenter les décisions d'architecture et les limites connues.
- Ne jamais écraser les changements non liés d'un autre intervenant.

## 3. Sécurité, confidentialité et données

- Le laboratoire doit rester local, sur loopback, tant qu'une procédure de mise en production explicitement approuvée n'existe pas.
- N'utiliser que des données fictives et des domaines de test. Ne jamais injecter de donnée personnelle réelle dans les tests, captures, journaux ou commits.
- Ne jamais exposer, journaliser ni committer de secret, session, mot de passe, base SQLite, export, photo privée, sauvegarde ou fichier d'environnement.
- Conserver les protections existantes : authentification, sessions, CSRF, autorisations par rôle, contrôles d'accès aux pièces privées, transactions et journal d'audit.
- Toute modification de schéma, migration, restauration, suppression ou écrasement de base demande une autorisation explicite préalable et une sauvegarde vérifiée sur une copie fictive.
- Ne pas déclarer une vérification professionnelle, une modération, un paiement, une conformité ou une sécurité comme acquis sans preuve documentée.

## 4. Compétences et outils

- Utiliser les compétences Frontend Design et React uniquement si le travail concerne réellement l'interface ; React reste facultatif et n'est pas une cible de migration implicite.
- Utiliser Three.js, GSAP, Spline ou Blender uniquement pour un besoin visuel approuvé et justifié. Aucun de ces outils ne doit remplacer une interface accessible, légère et testable.
- Utiliser les compétences Vercel seulement lors d'une préparation d'hébergement explicitement autorisée ; aucune publication, liaison de projet, ni dépense ne doit être engagée.
- Playwright et Chrome DevTools servent aux recettes navigateur, accessibilité, responsive, console et réseau ; leurs résultats doivent être consignés.
- `node_repl` est réservé aux vérifications locales ciblées. Ne pas y charger de secrets ou de données réelles.
- Blender peut être envisagé lorsqu'il sera disponible, sans achat de licence ni de crédit, et seulement après autorisation pour le besoin concerné.

## 5. Tests et qualité

- Avant de considérer un changement terminé : exécuter les contrôles pertinents sur données fictives, examiner le diff et vérifier l'absence de régression des flux concernés.
- Application : tests Python dans `application/backend/tests/` et tests DOM dans `application/qa/`.
- Vitrine : génération puis contrôles statiques dans `site-vitrine/scripts/check_site.py`, tests de scénarios dans `site-vitrine/tests/`, et recette navigateur lorsque l'interface change.
- Les tests qui créent une base doivent utiliser un chemin temporaire ou une copie explicitement prévue ; jamais une base locale existante sans autorisation.
- Les contrôles navigateur doivent couvrir au minimum : parcours clavier, tailles mobile et desktop, messages d'erreur, console, réseau et comportements d'autorisation concernés.
- Ne jamais publier une modification non testée. Un test ancien ou une note documentaire n'est pas une preuve d'exécution dans l'environnement courant.

## 6. Git et branches

- Travailler exclusivement sur `dev/ucp-codex` sauf instruction explicite contraire. Vérifier la branche avant toute écriture.
- Ne jamais modifier directement `main`, ne jamais la fusionner ni la réinitialiser.
- Ne pas pousser, ouvrir une pull request, publier une release ou déployer sans autorisation explicite.
- Utiliser des commits atomiques, descriptifs et limités au sujet traité lorsque l'utilisateur autorise un commit.
- Ne jamais utiliser de commande destructive (`reset --hard`, suppression récursive, écrasement) sans autorisation explicite et vérification préalable de la cible.

## 7. Sauvegarde, documentation et reprise

- Avant toute opération touchant aux données : appliquer la procédure documentée dans `application/scripts/database.py`, vers un nouveau fichier, et vérifier la restauration sur données fictives.
- Conserver les artefacts de recette utiles dans la documentation prévue, sans données personnelles ni secrets.
- Mettre à jour les documents d'architecture, de sécurité, de QA ou de déploiement lorsqu'une décision ou une limite change réellement.
- Pour une reprise, consulter dans cet ordre : README racine, README du sous-projet, `application/docs/SYNCHRONISATION.md`, `application/docs/ARCHITECTURE.md`, `application/docs/QA.md`, `application/docs/AUDIT_SECURITE.md` et les documents de rapprochement pertinents.

## 8. Coût, autorisations et périmètre

- Interdiction absolue d'achat, crédit, abonnement, service payant, API facturée à l'usage ou engagement financier sans autorisation explicite.
- Aucun déploiement public, collecte réelle, paiement réel, email transactionnel réel ou traitement de données personnelles sans autorisation explicite et préparation validée.
- Demander l'autorisation avant toute opération sensible : écriture ou migration de base, restauration, suppression, installation de dépendance, accès externe, publication, push, déploiement ou changement irréversible.
- Préserver toutes les fonctionnalités existantes. Toute suppression ou refonte fonctionnelle exige un accord explicite et un plan de migration validé.
