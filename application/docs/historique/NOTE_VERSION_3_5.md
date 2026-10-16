# Un Coup de Pouce — laboratoire connecté v3.5

Date : 12 octobre 2026. **Usage local avec identités fictives uniquement. Aucun utilisateur réel, email commercial, paiement, Stripe ni publication.**

## Modifications réalisées

- Sessions : nouvel écran « Mes données fictives » affichant le nombre de sessions actives. Possibilité de déconnecter **toutes les autres sessions** sans couper la session actuelle. Les jetons de session ne sont jamais envoyés à l'interface.
- Audit personnel : `GET /api/account/activity` renvoie uniquement les actions de l'utilisateur connecté (maximum 50 entrées). La création d'un projet et une candidature sont maintenant tracées dans la même transaction SQLite que l'opération.
- Audit administratif : `GET /api/admin/audit` réservé au rôle administrateur, renvoyant 100 dernières actions de test sans email ni mot de passe.
- Export de données personnelles : inclut désormais les actions réalisées par l'utilisateur, en plus de ses propres projets, candidatures, notifications et messages.
- Tentatives de connexion : limitation **par adresse email fictive** à cinq échecs sur une fenêtre de quinze minutes, avec refus temporaire des nouvelles connexions. Une session déjà valide n'est pas suspendue par cette politique locale. Cette protection n'est ni un anti-DDoS ni une politique de production ; contrôle réseau/IP et gestion de la récupération d'accès restent à prévoir.
- Interface : onglet Mes données fictives et tableau d'audit admin enrichis. Chaque compte ne voit pas les événements des autres, sauf l'administrateur dans son journal interne.

## Test et limites de sécurité

Le serveur doit rester lié à `127.0.0.1`. Le cookie de session **n'a pas l'attribut Secure** car le laboratoire fonctionne sur HTTP local. Une préproduction hébergée nécessitera HTTPS, cookies Secure, configuration de sécurité dédiée et réexamen complet des permissions.

Les comptes doivent avoir une adresse réservée (`.example`, `.test`, `.invalid`) et des projets inventés. Les SIREN sont uniquement validés à leur clé, jamais par une recherche auprès d'un registre officiel. La facturation Entreprise reste la formule simulée et NON une règle définitivement arbitrée ; Stripe n'est pas connecté.

Le test API avec `TestClient` est distinct d'une recette navigateur HTTP. Chromium de cet environnement retourne `ERR_BLOCKED_BY_ADMINISTRATOR` sur localhost **et même sur file://** ; ce contrôle n'est pas validé ici.

## Commandes

Depuis la racine de l'archive : `bash scripts/run_all_tests.sh`. Sur Windows, consulter `scripts/run_all_tests_windows.ps1`. Les nouveaux tests vérifient les accès au journal et la révocation des autres sessions, et le verrouillage des connexions après tentatives échouées.

Ne jamais envoyer le lien d'un laboratoire local à de vrais volontaires. La beta vraie exige une application privée hébergée, autorisations validées, CGU/RGPD, sauvegardes, contrôle officiel des professionnels, Stripe testé, tests navigateurs et accord explicite des fondateurs.
