# Un Coup de Pouce (UCP)

Dépôt principal du projet **Un Coup de Pouce**, une plateforme de mise en relation entre particuliers ayant un projet de travaux et professionnels du BTP.

## Suivi du projet

- [Vitrine publique vérifiée](https://cosscoll.github.io/UnCoupdePouce/site-vitrine/dist/index.html)
- [Application — préproduction privée](https://ucp-preproduction.vercel.app) : FastAPI sur Vercel, PostgreSQL Neon persistant (offre Free). Accès Vercel puis identifiant de préproduction requis ; données fictives uniquement.
- [Préproduction : configuration et blocages](application/docs/PREPRODUCTION.md)
- [Audit de reprise du 27 octobre](application/docs/REPRISE_2026-10-27.md)
- [Sources de la vitrine](site-vitrine/dist/index.html)
- [Tableau d'avancement : fait / reste à faire / blocages](site-vitrine/dist/avancement.html)
- [Page d'accueil compatible GitHub Pages](index.html) — l'hébergement GitHub Pages doit être activé et vérifié séparément.

## Contenu

- [`site-vitrine/`](site-vitrine/) : site statique français/anglais présentant le projet. Les fichiers prêts à servir se trouvent dans `site-vitrine/dist/`.
- [`application/`](application/) : application UCP 4.0.2, avec interface, API FastAPI, base SQLite locale, tests et documentation technique.

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

Sous Windows, utilisez `application/DEMARRER.bat`. L'application est destinée à un usage local de développement ; les paiements réels et l'ouverture commerciale ne sont pas activés.

## Vérifications de référence

- Application : 124 tests Python réussis sur GitHub Actions le 27/10/2026 (SQLite et PostgreSQL 17).
- Interface de l'application : 8 tests DOM réussis.
- Vitrine : contrôles statiques et tests des scénarios de brief réussis.
- Parcours HTTPS réel publication → candidature → sélection → messagerie et refus inter-comptes réussis sur la préproduction.
- Vitrine ouverte dans un navigateur réel ; rendu mobile de l’application, restauration PostgreSQL distante et PWA restent à vérifier.

## Sécurité des sources

Les bases locales, environnements virtuels, caches, secrets et documents internes contenant des identifiants privés sont exclus du dépôt.
