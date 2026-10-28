# Recherche et reprise PostgreSQL — 28 octobre 2026

Source fonctionnelle : `dd0e47e05e2daeebc02256e73e52d00d067d3fdd`.
[Exécution GitHub Actions](https://github.com/cosscoll/UnCoupdePouce/actions/runs/40670902567) :
**143 tests Python réussis**, **23 tests DOM + 3 tests worker réussis**.

Recherche : combinaison des filtres, mots-clés/synonymes sans accents, tri, délais
et ancienneté ; aucun élargissement des droits ; profil lié exact ; exclusion des
projets cachés et des demandeurs suspendus ; conservation des résultats après panne.
L’API conserve le contrat des appels internes de contrôle des photos/projets.

**Vrai dump/restore PostgreSQL 17 réussi sur base fictive isolée** : snapshot exporté,
archive privée, contrôle des volumes, données/messages/photos/séquences restaurés,
anciennes sessions absentes de la copie, sessions source toujours valides et
refus de restaurer sur la source ou sur une base non vide. Le job détruit seulement
la base de copie qu’il a créée. Les erreurs et arguments n’exposent pas les mots
de passe ; les variables de routage PG implicites sont refusées.

**Recette HTTPS recherche réussie** : publication fictive de deux missions, filtres
combinés et accents, motif individuel/profil lié actif, absence de mission hors
périmètre malgré un identifiant connu, tri dans les deux sens, validation des
paramètres et interface JavaScript effectivement servie. Voir
`qa/recherche-reprise-2026-10-28.json`.

Aucun dump de Neon réel ni secret de connexion Vercel n’a été récupéré. Ce test
isolé ne valide ni un stockage de sauvegarde externe, ni la rétention/chiffrement,
ni un exercice de reprise du projet distant. Voir SAUVEGARDE_POSTGRESQL.md.

---

# Installation web et reprise réseau — 28 octobre 2026

Source fonctionnelle : `f38c19c6e3d51b373bca6eb735bc617aa431fa44`.
[GitHub Actions](https://github.com/cosscoll/UnCoupdePouce/actions/runs/40664953890) :
**133 tests Python réussis** (SQLite/PostgreSQL 17), **20 tests DOM + 3 tests worker réussis**.
Exécution locale : 127 réussis et six tests PostgreSQL ignorés faute de base locale.

- Ressources PWA privées : manifeste, icônes officielles PNG 192/512, maskable,
  icône Apple, worker de portée `/` et CSP explicite. Accès refusé sans protection.
- Installation déclenchée uniquement par clic lorsque le navigateur le permet ;
  aide manuelle sinon. Aucune confirmation inventée à l'acceptation de la demande.
- Worker sans cache de données : API non interceptées, réponses d'authentification
  conservées, page générique uniquement lors d'un échec de navigation réseau.
- Chat : historique/saisie conservés après panne ; refus 403/404 masque l'historique ;
  relecture explicite, pas de renvoi automatique ; ancien chat sans effet sur le courant.

**Recette HTTPS réussie** : manifeste et icônes valides, empreintes SHA-256 des
icônes/scripts identiques aux sources testées, worker servi avec sa portée/CSP et
no-store, manifeste refusé sans protection, nouvelle interface effectivement servie
et conversation existante toujours accessible après publication.

Les tests de worker/installation sont des simulations. Aucun téléphone réel ni
installation Android/iPhone n'est déclaré testé. La navigation visuelle à 320–430 px,
le zoom 200 %, le lecteur d'écran et la réouverture avec les accès privés restent
à vérifier. Voir [PWA.md](PWA.md) et `qa/pwa-2026-10-28.json`.

---

# Compléments fonctionnels — signalements, assistance et comparaison

Source : `644c7380c7cc75c8c8794e66f1483d4296960fcd`, publiée depuis `main`.
[Tests de la version](https://github.com/cosscoll/UnCoupdePouce/actions/runs/40537513877) :
**131 tests Python réussis sur SQLite et PostgreSQL 17**, **13 tests DOM réussis**.
Localement : 125 réussis, six tests PostgreSQL ignorés faute de base locale.

- Signalement ciblé d'un message et conservation des signalements projet/conversation.
- Consultation administrative limitée à un dossier ouvert, avec motif, CSRF et
  audit obligatoire avant restitution du contenu. Aucun lecteur général de chat.
- Assistance : historique personnel paginé, statut, réponse de clôture et notification
  interne atomique ; aucun email ni engagement contractuel de réponse.
- Comparatif de deux ou trois candidatures : métiers et communes du profil candidat,
  distinction artisan individuel/profil lié, date et disponibilité de sélection.
  Aucun email, SIREN, montant d'abonnement, avis ou certificat fictif exposé.

**Recette HTTPS support réussie** : envoi d'un message signalé, refus d'un tiers et
  d'un doublon, examen du seul message concerné, refus des rôles et CSRF invalides,
  trace dans le journal distant, réponse visible seulement par le déclarant,
  notification interne et refus de consultation après clôture.

**Recette HTTPS comparaison réussie** : publication multi-métiers, candidature
individuelle et candidature d'un profil lié, métiers/zones exacts dans le comparatif,
refus d'accès du tiers et du professionnel, sélection avec refus de l'autre
candidature, échange privé avec le profil lié puis vérification des fichiers
HTML/JavaScript effectivement servis. Une interruption du proxy de l'environnement
s'est produite ; la recette a repris les candidatures déjà créées sans doublon.

Les profils d'entreprise restent une simulation sous gestionnaire unique ; les
arbitrages D01–D13 n'ont pas été modifiés. La recette visuelle mobile reste ouverte.
Voir [l'avancement du cahier des charges](AVANCEMENT_CDC.md).

---

# Recette du 27 octobre 2026

Application réelle : https://ucp-preproduction.vercel.app (préproduction privée).
FastAPI et interface existants conservés ; PostgreSQL Neon persistant, TLS vérifié.

## Vérifications effectuées

- GitHub Actions : **124 tests Python réussis** (SQLite et PostgreSQL 17), **8 tests DOM réussis**.
  [Exécution](https://github.com/cosscoll/UnCoupdePouce/actions/runs/40533099129),
  source `98cab2f145c0edb7d58e08d3efc4a90210b86d1c`.
- **Recette HTTPS réelle réussie** sur l'alias public protégé, par clients HTTP
  indépendants : inscriptions/connexions demandeur et professionnel ; validation
  admin fictive ; brouillon, photo, publication et réessai sans doublon ; recherche,
  candidature et rejet d'un doublon ; sélection ; refus du chat avant activation
  d'un abonnement de test ; échanges dans les deux sens ; idempotence du message.
- Un troisième compte ne peut lire ni messages, ni photos, ni candidatures d'autrui.
  Le professionnel ne peut lire la photo avant sélection ; accès autorisé ensuite.
- Compte entreprise de laboratoire, ajout et désactivation d'un profil lié : réussis.
  Aucun accès nominatif de collaborateur ni abonnement réel n'est prétendu.
- Après redéploiement depuis GitHub, une nouvelle connexion retrouve les deux messages et la photo privée : persistance vérifiée.
- Connexions des trois comptes de démonstration : réussies ; données en base distante.
- Sans mot de passe de préproduction, l'API renvoie 401. Cookies Secure/HttpOnly,
  no-store, noindex et CSP contrôlés sur le service réel.
- Vitrine : ouverte dans un navigateur réel ; 55 tests JavaScript et contrôles
  statiques réussis. Lien vers la préproduction ajouté dans les pieds de page.

## Limites explicites

Les tests HTTP distants vérifient réellement serveur et base ; les huit tests DOM
utilisent des API simulées et ne prouvent pas le rendu mobile. Le navigateur de
contrôle n'a pas pu franchir la protection HTTP Basic ; aucune recette visuelle
mobile de l'application n'est revendiquée. Les protections sont restées actives.
Les sauvegardes/restaurations SQLite sont testées ; le dump/restore PostgreSQL
**distant** reste à réaliser. Charge, PWA, accès nominatifs entreprise et décisions
D01–D13 restent à traiter avant toute ouverture réelle. Aucun paiement activé.
Un avertissement de dépréciation anyio/Starlette persiste, sans test en échec.
Voir [PREPRODUCTION.md](PREPRODUCTION.md).

---

# Preuves de contrôle — Work 4.0.2

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
