# Un Coup de Pouce (UCP)

Dépôt principal du projet **Un Coup de Pouce**, une plateforme de mise en relation entre particuliers ayant un projet de travaux et professionnels du BTP.

## Ouvrir l’application — deux espaces

**[Entrée principale : choisir Particulier ou Professionnel](https://cosscoll.github.io/UnCoupdePouce/)**

| Espace | Accès direct | Parcours |
|---|---|---|
| Particulier | [Ouvrir mon espace](https://ucp-preproduction.vercel.app/particulier) | Accueil personnel, brouillons, publication, candidatures reçues, messages |
| Professionnel | [Ouvrir mon espace](https://ucp-preproduction.vercel.app/professionnel) | Tableau d’activité, recherche de chantiers, candidatures, profil et messages |

L’application est en **préproduction privée**, avec accès autorisé puis connexion
au compte. Le choix d’entrée ne change jamais le rôle du compte connecté.
GitHub Pages héberge le point d’entrée et la présentation ; les données et actions
sont traitées dans l’application Vercel. La branche de livraison est **`main`**,
le code applicatif se trouve dans **[`application/`](application/)**.
La [vitrine](https://cosscoll.github.io/UnCoupdePouce/site-vitrine/dist/index.html)
reste une présentation séparée.

[Correction du lien principal et des deux espaces — 3 novembre](docs/CORRECTION_ACCES_APPLICATION_2026-11-03.md).

[Connexion par identifiant court des comptes de démonstration](application/docs/ACCES_DEMONSTRATION.md).

[Pause et réouverture des candidatures](application/docs/PAUSE_CANDIDATURES.md) — développées et testées, **mise en ligne en attente de la limite Vercel**.

## Suivi du projet

- [Vitrine publique vérifiée](https://cosscoll.github.io/UnCoupdePouce/site-vitrine/dist/index.html)
- [Application — préproduction privée](https://ucp-preproduction.vercel.app) : FastAPI sur Vercel, PostgreSQL Neon persistant (offre Free). Accès Vercel puis identifiant de préproduction requis ; données fictives uniquement.
- [Préproduction : configuration et blocages](application/docs/PREPRODUCTION.md)
- [Entreprise : effets des profils liés et limites](application/docs/ENTREPRISE_EFFETS.md)
- [Réévaluation entreprise du 3 novembre](docs/REVALIDATION_ENTREPRISE_2026-11-03.md)
- [Assistant UCP : chatbot guidé particuliers et professionnels](application/docs/ASSISTANT_GUIDE.md)
- [Centre de notifications et historique](application/docs/NOTIFICATIONS.md)
- [Recette des alertes de statut et confidentialité](docs/RECETTE_ALERTES_STATUT_2026-10-28.md)
- [Vue d’ensemble professionnelle](application/docs/TABLEAU_DE_BORD_PRO.md)
- [Présentations et réalisations déclarées](application/docs/PROFILS_DECLARATIFS.md)
- [Budget facultatif des travaux](application/docs/BUDGET.md)
- [Brouillons et sauvegarde automatique](application/docs/BROUILLONS.md)
- [Réévaluation des exigences critiques du 2 novembre](docs/REVALIDATION_P0_2026-11-02.md)
- [Navigation et accessibilité : preuves et recette restante](docs/RECETTE_NAVIGATION_2026-11-02.md)
- [Confidentialité des photos en modération](application/docs/MODERATION_PHOTOS.md)
- [Suivi des candidatures et accès aux échanges](application/docs/SUIVI_CANDIDATURES.md)
- [Assistance générale privée](application/docs/ASSISTANCE.md)
- [Recette budget et suivi du 28 octobre](docs/RECETTE_BUDGET_SUIVI_2026-10-28.md)
- [Recherche de missions et explications](application/docs/RECHERCHE.md)
- [Confidentialité des profils historiques](application/docs/PROFILS_PUBLICS_HISTORIQUES.md)
- [Limitation de cadence des candidatures](application/docs/LIMITATION_CANDIDATURES.md)
- [Coordonnées avant sélection : correctif Unicode et limites](application/docs/COORDONNEES_AVANT_SELECTION.md)
- [Favoris privés de projets](application/docs/FAVORIS.md)
- [Recherches professionnelles enregistrées](application/docs/RECHERCHES_ENREGISTREES.md)
- [Sauvegarde PostgreSQL : outil manuel et limites](application/docs/SAUVEGARDE_POSTGRESQL.md)
- [Installation web et reprise réseau](application/docs/PWA.md)
- [Auto-audit technique et limites](docs/AUTO_AUDIT_2026-10-28.md)
- [Matrice des 92 exigences et acceptation](docs/MATRICE_ACCEPTATION_CDC.md)
- [Avancement vérifié du cahier des charges](application/docs/AVANCEMENT_CDC.md)
- [Audit de reprise du 27 octobre](application/docs/REPRISE_2026-10-27.md)
- [Sources de la vitrine](site-vitrine/dist/index.html)
- [Tableau d'avancement : fait / reste à faire / blocages](site-vitrine/dist/avancement.html)
- [Accueil GitHub Pages : accès aux deux espaces](index.html).

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

- Application : 286 tests Python réussis sur GitHub Actions le 03/11/2026 (SQLite et PostgreSQL 17).
- Interface de l'application : 120 tests DOM, 3 tests de logique de l’assistant et 3 tests de service worker réussis (126 au total).
- Vitrine : contrôles statiques et tests des scénarios de brief réussis.
- Parcours HTTPS réel publication → candidature → sélection → messagerie et refus inter-comptes réussis sur la préproduction.
- Vitrine ouverte dans un navigateur réel ; rendu mobile sur appareils, installation/réouverture PWA et restauration PostgreSQL distante restent à vérifier.

## Sécurité des sources

Les bases locales, environnements virtuels, caches, secrets et documents internes contenant des identifiants privés sont exclus du dépôt.
