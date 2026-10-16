# Un Coup de Pouce (UCP)

Dépôt principal du projet **Un Coup de Pouce**, une plateforme de mise en relation entre particuliers ayant un projet de travaux et professionnels du BTP.

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

- Application : 110 tests Python réussis.
- Interface de l'application : 8 tests DOM réussis.
- Vitrine : contrôles statiques et tests des scénarios de brief réussis.
- Les contrôles visuels complets dans un navigateur réel restent à effectuer avant une ouverture publique.

## Sécurité des sources

Les bases locales, environnements virtuels, caches, secrets et documents internes contenant des identifiants privés sont exclus du dépôt.
