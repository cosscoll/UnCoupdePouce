# UCP — laboratoire API local v3.3 (12 octobre 2026)

STATUT : DRAFT interne exclusivement, aucune vraie inscription et aucune mise en production.

## Développement effectué
- Le propriétaire d’un projet ouvert peut en corriger le métier, la commune, le titre et la description **jusqu’à la première candidature**. Après une candidature, il ne peut plus modifier les termes déjà présentés aux professionnels.
- Le propriétaire peut **clôturer** un projet : les candidatures en attente passent à rejetées et même les chats précédemment ouverts deviennent inaccessibles (règle de sécurité conservatrice de démonstration, à arbitrer pour le produit final).
- Le particulier peut **refuser** une candidature en attente et le professionnel peut **retirer** sa propre candidature en attente ; les tentatives d’autrui échouent côté API. Une candidature retirée ne peut pas être redéposée automatiquement sur le même projet, pour éviter les contournements.
- Quand un professionnel modifie métier/zone/SIREN, son approbation et son abonnement simulé sont révoqués et **ses candidatures en attente passent à rejetées**.
- Export JSON limité aux propres données de l’utilisateur fictif ; retrait de l’intérêt bêta en local sans effacer les autres données du profil.
- Interface raccordée aux nouveaux parcours et nouveaux contrôles serveur.
- Patch Gmail **v1.3 non installé** : ajoute une recherche croisée des interdictions sur d’autres emails du même SIREN et un contrôle du registre MASTER avant tout envoi. Toute erreur de lecture MASTER provoque l’absence d’envoi ; le moteur installé reste en PAUSE et aucun script n’a été activé.

## Contrôles de régression
`39 tests API/intégration` + `11 tests métier Javascript` + `7 tests SIRET/statique` + `13 tests du verrou Gmail v1.3` = **70 scénarios automatisés distincts** réussis. Les 9 tests historiques v1.2 sont aussi disponibles, mais partiellement redondants avec ceux de v1.3 et exclus du total non doublonné.

L’API health, la page, JS et CSS ont répondu HTTP 200 sur `127.0.0.1`. Une vérification avec navigateur automatisé à travers HTTP n’est pas validée dans ce contexte. Aucun vrai test de charge, sauvegarde, réinstallation en environnement professionnel ni audit externe de sécurité effectué.

## Risques et prérequis production
- Le modèle de statut « withdrawn » est ajouté dans le schéma des **nouvelles** bases de laboratoire. Les bases SQLite de v3.2 existantes ne sont **pas migrées automatiquement** : créer une nouvelle base de test en v3.3 ou migrer explicitement après sauvegarde. Ne jamais copier une base avec des données réelles.
- La logique finale de multi-acceptation, le traitement des impayés, la clôture du chat et la gestion d’un compte Entreprise restent soumis à décision fondatrice.
- La création publique d’utilisateur exige un email et une authentification réels, protection anti-robot, invitations contrôlées, double opt-in si applicable, confidentialité et suppression/export effectifs ; la version actuelle refuse volontairement les emails réels.
- Les webhooks Stripe Billing doivent être vérifiés par signature, journal idempotent, rapprochement d’abonnement et tests d’échec de paiement ; **aucun Stripe LIVE ici**.
- Aucun mailing B2B sans revue des oppositions, historique des entités et validation d’envoi. Référence CNIL 10 juin 2026 : https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique ; liste repoussoir : https://www.cnil.fr/comment-utiliser-une-liste-repoussoir-pour-respecter-lopposition-la-prospection-commerciale
