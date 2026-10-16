# UCP LAB v3.4 — Notifications internes et compte Entreprise simulé
Date : 12 octobre 2026 — environnement LOCAL / comptes FICTIFS seulement

## Fonctionnalités ajoutées et vérifiées

1. **Notifications persistantes** dans SQLite, avec accès strictement limité au destinataire, date de lecture, lecture individuelle et globale, et export personnel. Déclencheurs : nouvelle candidature, acceptation, refus, retrait, clôture de projet, nouveau message. **AUCUN email ni push**, pas de fournisseur externe ni de campagne déclenchée.
2. **Compte Entreprise de laboratoire — variante A** : un gestionnaire (compte professionnel déjà approuvé fictivement) crée plusieurs profils artisans gérés depuis son compte. Chaque profil déclare entre 1 et 5 métiers et 1 à 20 communes. Aucun artisan lié n'a de login propre dans cette variante.
3. **Simulation tarifaire, sans Stripe** : 20 € HT/mois + 15 € HT/mois par profil artisan actif. Le gestionnaire **n'est pas compté** parmi les artisans liés dans cette hypothèse DE LABORATOIRE ; cela demeure une décision fondatrice non arrêtée.
4. **Matching entreprise métier ET zone** : un projet est affiché lorsqu'il correspond au gestionnaire ou à un profil lié actif. Une nouvelle route de candidature explicite le profil lié sélectionné ; une entreprise ne peut déposer qu'une candidature par projet dans cette simulation, grâce à la contrainte `(project_id, professional_id)` conservée. Le profil lié est visible au demandeur une fois la candidature déposée.
5. **Arrêt des droits si profil lié inactif** : désactiver un artisan fictif le sort du matching, annule ses candidatures encore en attente et bloque le chat d'une candidature acceptée. Réactiver le profil peut rétablir l'accès au chat d'un projet encore ouvert et sélectionné ; ce comportement est **une hypothèse à faire arbitrer**.
6. **Interface connectée** : nouvel onglet « Entreprise (test) » pour créer l'entreprise, ajouter/désactiver/réactiver des profils et visualiser le calcul HT ; nouvel onglet « Notifications internes » pour lire/marquer les alertes, y compris les erreurs de droits. Le contenu dynamique est écrit via `textContent`, pas `innerHTML` non filtré.
7. **Export utilisateur** : ajoute les notifications personnelles et les profils de son entreprise seulement, jamais ceux des autres utilisateurs.

## Tests

- **50 tests backend** exécutés avec pytest dans un répertoire SQLite isolé, dont 11 scénarios nouveaux (notifications, sécurité multi-entreprises, tarif, matching, lifecycle et confidentialité).
- **11 tests** métier JS historique, **7 tests** validation SIRET statiques, **9 tests** de verrou Gmail v1.2 **non installé**, **4 tests** complémentaires Gmail v1.3 **non installé**.
- Soit **81 tests distincts réussis** sur plusieurs sous-systèmes, et non 81 tests « E2E en production ».
- Tests syntaxiques JS et Python réussis. Chromium interdit l'ouverture de `http://127.0.0.1:*` avec `ERR_BLOCKED_BY_ADMINISTRATOR`, donc **recette navigateur complète NON VALIDÉE**.
- Vérification HTTP local du serveur à exécuter dans l'environnement de la recette avant transfert à des testeurs.

## Ce que cette version ne fait PAS

Aucun SIREN/RNE réel interrogé, pas de compte entreprise de production ni de délégation multi-login, pas de Stripe ni de webhook, pas de facturation, pas de délivrance d'emails/SMS/push, pas de vrai recrutement, pas de KYC, pas de stockage de fichiers d'identité, pas de RGPD production complet, pas de serveur accessible sur Internet. L'application est volontairement limitée à localhost et aux domaines d'email réservés `.example`, `.test` et `.invalid`.

## Procédure minimale de recette

1. Créer 1 particulier fictif, 2 professionnels fictifs (gestionnaires séparés), et 1 administrateur local ; utiliser **uniquement des emails en `.example`**.
2. Approuver les profils professionnels fictifs dans l'interface administrateur.
3. Créer une Entreprise A avec 3 profils actifs ; vérifier 65 € HT/mois, puis désactiver 1 profil et vérifier 50 € HT/mois. Aucun paiement Stripe.
4. Créer un projet fictif « menuiserie à Blagnac » ; vérifier qu'il n'apparaît qu'au gestionnaire dont au moins un profil actif couvre **menuiserie ET Blagnac**.
5. Faire candidater l'Entreprise A à travers un profil lié ; vérifier que l'entreprise B ne peut ni choisir ce profil ni modifier son état.
6. Sélectionner le professionnel depuis le compte demandeur. Vérifier le badge/compteur de notification du candidat, puis le chat après activation de l'abonnement *fictif* par l'admin.
7. Désactiver le profil artisan lié et vérifier que les deux parties reçoivent un refus 403 à la lecture du chat. Vérifier que seul le destinataire de chaque notification peut la lire ou marquer comme lue.
8. Exporter les données du gestionnaire ; vérifier la présence des seuls profils liés à son entreprise.

## Décisions humaines qui restent nécessaires

- Une ou plusieurs candidatures acceptables sur le même projet ?
- Un gestionnaire qui exerce lui-même compte-t-il comme artisan facturé ?
- Facturation au moment de la candidature, de la sélection ou de l'accès au chat ?
- En cas de désactivation temporaire d'un artisan après acceptation : conservation du chat, révocation définitive ou réouverture possible ?
- Preuves minimales d'identité, d'assurance et badges à afficher ; durée de conservation et réponse à un signalement.

Ces choix restent ouverts : ne pas déduire une politique commerciale définitive d'une simulation interne.
