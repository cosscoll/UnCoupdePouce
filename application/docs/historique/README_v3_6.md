# UCP — MVP laboratoire connecté / v3.6 (13 octobre 2026)

**État : prototype local opérationnel, PAS prêt pour des utilisateurs réels.** Voir `NOTE_VERSION_3_6.md` pour les garde-fous avant-contact et le siège artisan du gestionnaire (simulation seulement). Ce dossier ajoute une base SQLite et une API FastAPI à l'ancien démonstrateur statique. Il ne remplace ni les cahiers des charges ni le futur produit Bubble éventuel ; aucun choix de stack de production n'est arrêté ici.

## Démarrage (Windows)

1. Installer Python 3.11 ou ultérieur.
2. Ouvrir un terminal dans `UCP_Pilote_MVP_Local/backend` et exécuter `py -3 -m pip install -r requirements.txt`.
3. Démarrer `start_local_windows.bat` ou `py -3 -m uvicorn app:app --host 127.0.0.1 --port 8765`.
4. Ouvrir **http://127.0.0.1:8765** dans un navigateur. Le serveur refuse les hôtes externes.
5. Créer uniquement des comptes **fictifs** de particulier et de professionnel, avec des emails en `@ucp-lab.example`, un mot de passe de test et un SIREN fictif à neuf chiffres **avec clé Luhn valide** (exemple `123456782`). Les emails réels et les SIREN mal formatés sont refusés par l’API. **Ne pas utiliser de vrais particuliers, de vrais artisans, de vraies coordonnées ou de vraies pièces d'identité.**
6. Pour simuler la validation des artisans, exécuter `py -3 create_local_admin.py` dans un *autre* terminal, créer un compte admin fictif puis se connecter à l'interface avec ces identifiants.
7. Après la démonstration, arrêter le serveur (`Ctrl+C`). Pour remettre les données à zéro, supprimer `ucp_local.sqlite3` et les éventuels fichiers `ucp_local.sqlite3-wal` et `ucp_local.sqlite3-shm` **uniquement si toutes les données sont fictives et que le serveur est arrêté**. Ne jamais supprimer une base de données réelle.

Sur macOS/Linux : `python3 -m pip install -r requirements.txt`, puis `./start_local_macos_linux.sh`.

## Scénario complet à réaliser avec des comptes fictifs

1. Sous le compte **Particulier 1**, publier une demande fictive de plomberie à **Toulouse**.
2. Sous le compte **Artisan 1**, remplir le profil avec métier `plomberie`, ville `Toulouse`, SIREN imaginaire. Il ne peut ni voir le projet ni candidater avant approbation.
3. Sous l'administrateur, approuver le profil. Il s'agit d'une simple approbation de scénario, **pas d'une vérification auprès du RNE**.
4. Sous l'artisan, voir le projet correspondant et candidater une fois. Une deuxième candidature doit être rejetée.
5. Sous le particulier propriétaire, voir sa candidature et le sélectionner ; un deuxième demandeur ne peut pas accepter cette candidature.
6. Avant activation de l'abonnement de test, le chat reste fermé. Sous l'administrateur, activer l'abonnement **fictif**. Aucune somme n'est encaissée.
7. Tester une conversation entre ce particulier et cet artisan. Un autre demandeur et un autre artisan ne doivent pas voir les messages.
8. Suspendre l'artisan depuis l'admin ; la conversation doit redevenir inaccessible.
9. Sous l'artisan, enregistrer l'intérêt pour la bêta avec consentement explicite **uniquement avec des coordonnées de test**.

## Ce qui est effectivement codé

- SQLite persistante localement ; mots de passe hachés PBKDF2-SHA256 et salés.
- Sessions opaque cookie `HttpOnly`, `SameSite=Strict`; protection CSRF pour opérations sensibles, cookie `Secure=False` **uniquement parce que le serveur reste sur HTTP localhost**.
- Trois rôles distincts (particulier, professionnel, administrateur), profil professionnel sans auto-approbation, remise à zéro de l'approbation après modification du profil.
- Matching **métier + communes d’intervention explicitement déclarées par le professionnel** (maximum 20 communes, sans rayon calculé ni géolocalisation réelle). Le professionnel qui change son métier ou sa zone doit être approuvé à nouveau.
- Une candidature par paire (projet, professionnel), statut sélectionné / rejeté ; **une acceptation par projet est une règle de démo seulement**.
- Messagerie avec droits contrôlés en base et abonnement de test actif ; réponse des tiers refusée côté serveur.
- Consentement horodaté et intérêt pour entretien enregistrés localement ; aucun email automatique.
- Journal minimum des approbations, sélections, activations et suspensions ; réinitialisation manuelle possible dans le contexte local.
- Protection des hôtes : refuse les Host externes ; headers anti-cadrage, CSP et Referrer-Policy.
- Front-end responsive sans dépendances externes ; contenu issu des utilisateurs rendu par `textContent` pour réduire les risques d'injection HTML.

## Tests vérifiés

`python3 -m pytest -q tests/test_lab_api.py`

**30 tests API / intégration réussis** (connexions, rôles, CSRF, profils, matching, doublons, permissions, suspension, conversation, admin, consentement et refus d'un hôte extérieur).

Les **27 tests précédents** du paquet v2 restent présents : `node tests/core.spec.cjs` (11), `node tests/gmail_gate.spec.cjs` (9), `node tests/signup_static.spec.cjs` (7). Cela totalise **57 tests automatisés réussis**, de deux codes de démonstration différents et non 45 tests du même serveur.

Lancement local par HTTP : `/`, `/assets/app.js`, `/assets/style.css` et `/api/health` ont répondu **HTTP 200**. Les essais de rendu Chromium/Playwright n'ont pas pu atteindre localhost : `ERR_BLOCKED_BY_ADMINISTRATOR`. Le rendu et l'accessibilité dans de vrais navigateurs restent **non validés**.

## IMPORTANT — Ne pas publier tel quel

Le prototype **n'a ni** : authentification entreprise réelle / vérification d'email ; contrôle officiel SIREN/SIRET ; protection mature anti-bot/rate limiting ; MFA administrateur ; chiffrement de la base au repos ; politiques et procédures GDPR validées ; suppression/export de données de tous les objets liés ; règles d'assurance ; stockage privé sécurisé des pièces ; backup/restore de production ; journal et observabilité opérationnels ; notifications ; Stripe LIVE et webhooks ; antifraude ; contrats finalisés ; tests navigateur multi-appareils ; pentest. Aucun candidat à la bêta ne doit être envoyé sur cette adresse locale.

L'API `/api/admin/bootstrap` ne fonctionne pas sans secret d'opérateur `UCP_LOCAL_ADMIN_BOOTSTRAP` (24 caractères minimum), absent par défaut ; préférez le script CLI. Ne pas publier ce secret.

La validation de SIREN dans ce prototype n'est qu'un contrôle de **format et checksum Luhn à neuf chiffres**, sans vérification d’existence de société. Un compte administrateur peut l'approuver à des fins de démo uniquement.

**Décisions fondateurs non prises dans ce code** : sélection multiple par demande ou non ; moment d'exigibilité de l'abonnement, effet des impayés, contrôles d'assurance et statut des artisans rattachés à l'entreprise. Aucun paiement, envoi de prospection ni inscription dans le CRM réel n'est effectué.

## Changements de sécurité et de pilotage v3.2

Domaine email réservé obligatoire (`.example`, `.test`, `.invalid`) pour les nouveaux comptes, SIREN soumis à checksum, route `/api/admin/metrics` limitée au rôle admin et interface mobile corrigée. Lire `NOTE_VERSION_3_2.md`. Cette protection ne rend **pas** l’application prête à recevoir des personnes réelles.

**Ajout v3.2 :** plusieurs métiers autorisés par professionnel, après nouvelle approbation locale obligatoire ; les métriques de recrutement dans `/api/admin/metrics` n’ont aucune signification commerciale réelle.

## Améliorations v3.3 (12 octobre 2026)
Consulter `NOTE_VERSION_3_3.md`. Nouveaux parcours locaux : modification et clôture du projet, refus/retrait de candidature, retrait d’intérêt bêta et export individuel des données fictives. La clôture d’une demande rend les anciens chats inaccessibles. **Les bases SQLite v3.2 ne sont pas automatiquement migrées** ; repartir d’une base vide de démonstration en v3.3. Toute règle de clôture/multi-sélection est une hypothèse de laboratoire, pas une décision produit.

Tests récents : `python -m pytest -q tests/test_lab_api.py` (39 scénarios), puis `../scripts/run_all_tests.sh` ou `../scripts/run_all_tests_windows.ps1` depuis une machine équipée de Python + Node.


## Mise à jour v3.4 (2026-10-12) — règles centrales

Voir [NOTE_VERSION_3_4.md](NOTE_VERSION_3_4.md) : système de notifications internes (aucun SMTP/push), compte Entreprise fictif mono-gestionnaire, profils d’artisans liés par métier et communes, facturation purement simulée 20 + 15 × profils actifs, matching et vérification des droits par serveur. L’hypothèse sur le gestionnaire et les sélections n’est PAS une décision définitive. **50 tests backend**, 81 tests distincts tous composants compris. Les chiffres v3.2/v3.3 ci-dessus restent des résultats historiques. Aucun accès public ni traitement de vraies données.


## Session du 12 octobre — v3.5 (LAB SEULEMENT)

Ajout de gestion et révocation des autres sessions fictives, journal d'actions individuel et administrateur, traçabilité atomique de création de projet/candidature et limitation des tentatives de login en local. Lire `backend/NOTE_VERSION_3_5.md` et `docs/RECETTE_PREPRODUCTION_V35.md`. Le code n'est pas ouvert aux vrais utilisateurs. Le navigateur Chromium dans cet environnement bloque localhost et les fichiers locaux ; seule l'API a pu être testée ici.
