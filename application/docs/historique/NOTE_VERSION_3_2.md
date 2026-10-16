# UCP — MVP laboratoire v3.2 — 12 octobre 2026

**STATUT : LOCAL / DONNÉES FICTIVES / AUCUN ENVOI / AUCUNE PUBLICATION.**

## Corrections livrées

1. Compte test : rejet côté API des adresses ayant un domaine réel (`gmail.com`, société.fr, etc.). Seuls les domaines réservés `.example`, `.test`, `.invalid` sont autorisés pour les comptes professionnels, demandeurs et administrateurs fictifs. Cela réduit les risques de saisie accidentelle de contacts véritables. Les projets restent rédigés librement : cette protection n'est **pas** une garantie absolue contre la saisie de données personnelles dans le texte.
2. SIREN : test de format et clé de contrôle Luhn sur 9 chiffres ; **pas** d'interrogation RNE, pas de validation d'existence juridique. Le contrôle rejette les erreurs de frappe les plus simples. L'approbation par un admin est strictement une simulation.
3. Administration : route privée `/api/admin/metrics` avec comptes agrégés des projets, candidatures, conversations, inscriptions d'intérêt et abonnements tests. Indique systématiquement `LOCAL_TEST_ONLY`, zéro participant réel et zéro euro de recette. Refuse l'accès aux rôles non admin.
4. Interface : compteurs visibles dans l'espace administrateur ; meilleure lisibilité du titre sur mobile ; libellé clair pour les emails réservés et la clé SIREN.
5. Correspondance BTP : le professionnel peut renseigner jusqu’à cinq métiers au total (principal inclus), sous approbation fictive, et jusqu’à 20 communes. La liste des projets et les candidatures sont filtrées côté serveur sur la réunion des métiers autorisés ET les communes. La modification du profil révoque le badge et l’abonnement simulés.
6. Tests : 9 tests backend supplémentaires, portant le nombre de tests Python à **30**, contre 21 en v3.1 ; 27 tests JS du démonstrateur statique et du verrou Gmail restent présents. **Total : 57 tests automatisés répartis entre composants**, pas 54 tests de production.

## Contrôles et limites

- API démarrée sur `127.0.0.1`, `/api/health` HTTP 200 confirmé.
- Test de navigation de Chromium vers l'URL HTTP locale **bloqué** : `ERR_BLOCKED_BY_ADMINISTRATOR`. Ce n'est **pas** un succès de recette réseau/E2E navigateur.
- Contrôle visuel alternatif (sans réseau) : la page HTML, CSS et JS chargés directement dans Chromium ; bascule du formulaire de création de compte vérifiée ; prévisualisations ordinateur et smartphone enregistrées. Cela ne remplace pas une session réelle avec cookies, serveur et navigateur.
- Pas d'authentification entreprise réelle, MFA, double opt-in, anti-bot complet, vérification RNE, chiffrement DB, hébergement, sauvegarde/retour arrière productif, Stripe LIVE, CGU et RGPD validés, modération de contenu, conditions d'assurance ni recette de sécurité externe.
- Les règles fictives de sélection unique et d'activation de conversation ne constituent pas un arbitrage fondateur.

## Installation locale

Dans `backend/`, installer les dépendances `pip install -r requirements.txt`, puis lancer le serveur avec `python -m uvicorn app:app --host 127.0.0.1 --port 8765` ; ouvrir `http://127.0.0.1:8765`. Créer le compte admin via `python create_local_admin.py`, en choisissant **uniquement un email fictif** de domaine `.example`, `.test` ou `.invalid`. Se référer à `README.md` pour la procédure de recette détaillée et les limites.

## Préparation de la suite

Le point de passage à une bêta réelle n'est PAS le nombre de tests locaux. Il est conditionné au blocage INPI, à la revue juridique/confidentialité, à un backend hébergé avec authentification robuste, à une validation SIREN réelle, aux autorisations données à chaque utilisateur, à la recette navigateur des flux, aux sauvegardes et à l'accord des fondateurs pour toute communication/publication/encaissement. Le CRM et les vrais prospects ne sont pas connectés à ce laboratoire.
