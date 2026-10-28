# Un Coup de Pouce (UCP)

Dépôt principal du projet **Un Coup de Pouce**, une plateforme de mise en relation entre particuliers ayant un projet de travaux et professionnels du BTP.

## Suivi du projet

- [Vitrine publique vérifiée](https://cosscoll.github.io/UnCoupdePouce/site-vitrine/dist/index.html)
- [Application — préproduction privée](https://ucp-preproduction.vercel.app) : FastAPI sur Vercel, PostgreSQL Neon persistant (offre Free). Accès Vercel puis identifiant de préproduction requis ; données fictives uniquement.
- [Préproduction : configuration et blocages](application/docs/PREPRODUCTION.md)
- [Centre de notifications et historique](application/docs/NOTIFICATIONS.md)
- [Vue d’ensemble professionnelle](application/docs/TABLEAU_DE_BORD_PRO.md)
- [Présentations et réalisations déclarées](application/docs/PROFILS_DECLARATIFS.md)
- [Budget facultatif des travaux](application/docs/BUDGET.md)
- [Suivi des candidatures et accès aux échanges](application/docs/SUIVI_CANDIDATURES.md)
- [Assistance générale privée](application/docs/ASSISTANCE.md)
- [Recette budget et suivi du 28 octobre](docs/RECETTE_BUDGET_SUIVI_2026-10-28.md)
- [Recherche de missions et explications](application/docs/RECHERCHE.md)
- [Sauvegarde PostgreSQL : outil manuel et limites](application/docs/SAUVEGARDE_POSTGRESQL.md)
- [Installation web et reprise réseau](application/docs/PWA.md)
- [Auto-audit technique et limites](docs/AUTO_AUDIT_2026-10-28.md)
- [Matrice des 92 exigences et acceptation](docs/MATRICE_ACCEPTATION_CDC.md)
- [Avancement vérifié du cahier des charges](application/docs/AVANCEMENT_CDC.md)
- [Audit de reprise du 27 octobre](application/docs/REPRISE_2026-10-27.md)
- [Sources de la vitrine](site-vitrine/dist/index.html)
- [Tableau d'avancement : fait / reste à faire / blocages](site-vitrine/dist/avancement.html)
- [Page d'accueil compatible GitHub Pages](index.html) — l'hébergement GitHub Pages doit être activé et vérifié séparément.

## Contenu

- [`site-vitrine/`](site-vitrine/) : site statique français/anglais présentant le projet. Les fichiers prêts à servir se trouvent dans `site-vitrine/dist/`.
- [`application/`](application/) : application UCP, avec interface, API FastAPI, SQLite en local et PostgreSQL en préproduction, tests et documentation technique.

## Lancer la vitrine

```bash
cd site-vitrine
python3 build.py
python3 scripts/check_site.py
```

Ouvrez ensuite `site-vitrine/dist/index.html`.

## Lancer l'application

```bash
cd application
./DEMARRER.sh
```

Sous Windows, utilisez `application/DEMARRER.bat`. Ces commandes lancent le développement local. La préproduction privée est accessible par le lien ci-dessus ; les paiements réels et l'ouverture commerciale ne sont pas activés.

## Vérifications de référence

- Application : 169 tests Python réussis sur GitHub Actions le 28/10/2026 (SQLite et PostgreSQL 17).
- Interface de l'application : 53 tests DOM et 3 tests de service worker réussis.
- Vitrine : contrôles statiques et tests des scénarios de brief réussis.
- Parcours HTTPS réel publication → candidature → sélection → messagerie et refus inter-comptes réussis sur la préproduction.
- Vitrine ouverte dans un navigateur réel ; rendu mobile sur appareils, installation/réouverture PWA et restauration PostgreSQL distante restent à vérifier.

## Sécurité des sources

Les bases locales, environnements virtuels, caches, secrets et documents internes contenant des identifiants privés sont exclus du dépôt.
