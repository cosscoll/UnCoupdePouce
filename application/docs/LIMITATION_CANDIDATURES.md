# Limitation de cadence des candidatures — F42

Protection technique de la préproduction fictive, indépendante de la tarification.
Les deux routes de candidature (individuelle et profil lié) partagent le même
compteur par **compte professionnel gestionnaire**, calculé dans la base serveur.

## Comportement

- Par défaut : au plus **10 nouveaux envois sur 60 secondes glissantes** et
  **50 sur 3 600 secondes glissantes**. Ces seuils ne sont pas un forfait commercial.
- Les candidatures enregistrées comptent dans tous leurs états, y compris après
  retrait ou refus. Changer de profil lié, de navigateur, de session ou d'IP déclarée
  ne crée pas de compteur supplémentaire pour le même compte.
- Les droits et l'éligibilité sont contrôlés avant le compteur. Un doublon sur le
  même projet reste un `409`, même à la limite ; il ne consomme pas un nouvel envoi.
- Un dépassement renvoie `429` et un en-tête `Retry-After` en secondes, avec un
  message français donnant le délai. Aucune candidature, notification ou trace de
  candidature réussie n'est alors créée. Aucun réessai automatique n'est effectué.
- L'accès reprend lorsque suffisamment d'envois sortent des deux fenêtres. Un
  envoi exactement à la borne de la fenêtre ne compte plus.

L'historique `applications.created_at` est la source de vérité, sans compteur en
mémoire. Le contrôle et l'insertion partagent la transaction d'écriture existante
et son verrou, également sur PostgreSQL. Deux demandes concurrentes ne peuvent
pas prendre la même dernière place. Un échec de transaction ne consomme aucune
place. L'index propriétaire/date est ajouté sans supprimer ni modifier les données.

## Configuration opérateur

| Variable | Défaut | Valeurs |
| --- | --- | --- |
| `UCP_APPLICATIONS_PER_MINUTE` | `10` | Entier ASCII de 1 à 10 000 |
| `UCP_APPLICATIONS_PER_HOUR` | `50` | Entier ASCII de 1 à 10 000, au moins le seuil minute |

Une configuration invalide empêche le démarrage ; aucun repli vers une protection
désactivée. Un changement prend effet au démarrage du serveur et s'applique aussi
aux envois déjà enregistrés. Si le seuil est abaissé sous le nombre courant, le
délai attend la sortie d'un nombre suffisant d'envois. Horloge serveur UTC requise.

## Preuves et limites

Les tests vérifient fenêtres glissantes, bornes exactes, compteur partagé avec le
profil lié, persistance après réinitialisation et nouvelle session, retrait sans
remise à zéro, absence d'effet d'un refus, isolation des comptes, IP non utilisée,
concurrence, rollback et configuration invalide. Les parcours séquentiel et concurrent
sont exécutés sur SQLite **et PostgreSQL**. Le DOM vérifie qu'un `429` conserve le
projet affiché et ne relance pas la candidature sans action de l'utilisateur.

Cette protection limite les **envois réussis d'un compte**. Elle ne protège pas à elle
seule contre la création de nombreux comptes, les requêtes invalides en masse ou le
spam de messages. Aucun suivi d'IP, d'appareil ou sanction automatique n'est ajouté.
Les seuils commerciaux, politiques de sanctions/recours, charge réelle et recette
sur appareils restent à valider. F42 demeure partiel.
