# Preuves de contrôle — Work 4.0.2

Mise à jour du 17 octobre 2026 : suite complète 123 tests Python réussis, 29 tests JavaScript/DOM réussis, 61 contrôles navigateur répartis sur trois scénarios. Voir [le chantier 03](CHANTIER_03_RESULTATS.md) pour les commandes et limites. Les résultats du 16 octobre ci-dessous restent une preuve historique, pas les compteurs actuels.

Exécution du 16 octobre 2026, heure de Paris, dans le fil Work existant. Données entièrement fictives et bases temporaires.

| Contrôle | Résultat observé | Portée |
|---|---|---|
| pytest backend | 110 réussis, 0 échec, 1 avertissement de dépréciation de dépendance | API FastAPI via TestClient, stockage SQLite temporaire, tests hérités et nouvelles protections |
| jsdom interface | 8 réussis, 0 échec | DOM et API simulée ; pas de preuve de rendu navigateur |
| Démonstration et ressources | PASS | Création fictive, login, 3 projets, 1 brouillon, fichiers statiques, refus de réensemencer une base non vide |
| Doubles envois parallèles | PASS | 16 appels simultanés portant une même clé, 1 message et 1 notification |
| Pannes de notification | PASS | Candidature individuelle/entreprise et message : rollback complet, pas de faux conflit de doublon |
| Sauvegarde/restauration | PASS dans pytest | Copie cohérente, photos, refus d'écrasement et révocation des sessions/codes |
| Audit approfondi | 22 scénarios réussis | Révocation avant lecture/écriture, course réelle de verrou SQL, connexion/reset/suspension, expiration et atomicité admin |
| Syntaxe JavaScript | PASS | app.js et analytics.js |
| Navigateur réel + API | NON EXÉCUTÉ | Capacité de contrôle navigateur adaptée indisponible pour cette application |
| Staging/production/RLS/paiement TEST externe | NON EXÉCUTÉ | Environnements applicatifs UCP non identifiés et intégrations non activées |

Les résultats de la revue avant/après sont dans `qa/audit-before.txt`, `qa/audit-intermediate.txt` et `qa/audit-after.txt`. Onze scénarios ont échoué avant correctif ; les vingt-deux scénarios finaux ont réussi. Voir `AUDIT_SECURITE.md`.

Les sorties brutes sont dans `qa/pytest-output.txt`, `qa/pytest-results.xml`, `qa/dom-output.txt` et `qa/release-smoke.txt`. Le test exploratoire initial des ressources utilisait deux noms de polices erronés ; il a été corrigé pour examiner les fichiers réellement livrés puis a réussi. Aucune ressource utilisateur n'a été renommée pour masquer cet échec.

La base Work 4.0.1 avait 88 tests serveur. Les 22 cas ajoutés portent la suite à 110.

Les 167 tests du lot classique 09 sont conservés comme résultat déclaré de ce prototype distinct. Ils ne s'ajoutent pas aux 110 tests Work. Les scénarios E01–E54 et DB01–DB32 du tracker restent distincts et non automatiquement validés.

## Couverture nouvelle depuis le laboratoire v3.6

Brouillons privés et verrou optimiste, publication idempotente, métiers multiples, gestion des catégories administrateur, photos/EXIF/autorisations/export, signalements et suspension, récupération de compte, nom public sans coordonnées, sauvegarde, restauration, atomicité notifications, réessais de messages, tests de concurrence SQLite et conservation de clé côté interface après perte de réponse.

## Réserves de livraison

Validation visuelle/accessibilité de l'application, concurrence multi-processus en environnement cible, migrations sur copie représentative, pagination/charge, politique de rétention/effacement, MFA et sécurité de production, vérifications pro réelles, email transactionnel, Stripe TEST idempotent, PWA et validation commerciale restent à traiter. Le PASS local ne constitue ni une certification ni un produit prêt à ouvrir au public.
