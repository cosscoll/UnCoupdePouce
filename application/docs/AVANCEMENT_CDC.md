# Avancement vérifié du cahier des charges — 28 octobre 2026

Les états ci-dessous concernent la **préproduction privée avec données fictives**.
Ils ne valent ni ouverture commerciale ni validation des décisions D01–D13.

| Exigence | Développement de ce lot | Limite restante |
|---|---|---|
| F16 — Comparaison | Jusqu’à trois profils actuels, métiers et communes déclarés, date de candidature, statut de test et disponibilité de sélection. Le comparatif distingue le profil lié de son gestionnaire et exclut coordonnées et facturation. | Avis, réalisations, assurances et vérification réelle restent absents ; aucune note ou certification inventée. |
| F50 — Reprise réseau | Saisie et clé de réessai conservées dans la page ; relecture explicite et envoi réactivé après contrôle ; réponse tardive d’un ancien chat ignorée. | La fermeture/recharge peut perdre une saisie non enregistrée. Tests de pannes sur téléphone à réaliser. |
| F89–F90 — Installation web | Manifeste authentifié, icônes officielles, aide d’installation et invitation conditionnelle du navigateur ; page hors connexion générique sans cache de données privées. | Installation/réouverture Android et iPhone non vérifiées sur appareils réels. Aucune application native ou publication store. |
| F49 — Signalement | Bouton sur chaque message, signalement ciblé, contrôle du participant et refus des doublons ouverts. Le signalement de conversation et de projet est conservé. | Politique complète de sanctions, blocage individuel, conservation et recours à formaliser. Aucune suppression automatique de message. |
| F82 — Back-office | Examen du contenu d'un dossier ouvert : projet signalé, message exact ou conversation signalée par fenêtres de 20 messages. Rôles et CSRF contrôlés. | Pas de lecteur général des conversations privées pour les administrateurs. Vérification professionnelle réelle toujours absente. |
| F83 — Audit | Chaque consultation privée exige un motif interne ; identité, date et dossier sont journalisés avant restitution. Si l'écriture de l'audit échoue, aucun contenu n'est rendu. Réponse et clôture sont tracées. | Politique de rétention et séparation de rôles admin/support à définir avant production. |
| F84 — Support | Rubrique Assistance : signalements personnels, état ouvert/traité, réponse de l'équipe et pagination. Notification interne lors de la réponse, dans la même transaction. | Réclamations générales hors signalement, escalade, emails et délais contractuels non implémentés. Aucun délai de réponse promis. |

Les motifs de consultation sont internes et ne sont pas exposés au déclarant.
La réponse de clôture lui est visible ; l'interface le précise à l'administrateur.
Aucun autre compte ne reçoit la réponse, le nom du déclarant ou son historique.
Les données sont rendues comme texte et jamais comme HTML actif.

## Vérifications

Tests dédiés dans `backend/tests/test_reports.py` : périmètre exact du message,
refus inter-comptes, CSRF, motifs vides, accès après clôture, audit obligatoire,
pagination, réponse et notification atomiques. Le parcours de signalement est
également exécuté par le test d'intégration PostgreSQL et par les tests DOM.
Lot du 27 octobre : 131 tests Python (SQLite/PostgreSQL) et 13 tests DOM réussis. Le parcours
signalement → examen tracé → réponse privée a aussi été réussi sur le service HTTPS
déployé. La comparaison et la sélection de deux candidatures, dont un profil lié,
puis sa messagerie ont également été réussies en HTTPS. Voir QA.md pour les preuves
et limites de recette.

Lot du 28 octobre : 133 tests Python (SQLite/PostgreSQL), 20 tests DOM et trois
tests worker réussis ; ressources PWA, protections et conversation existante
contrôlées en HTTPS après publication. L’installation sur appareil reste non vérifiée.

## Priorités suivantes

- F16 : enrichir les profils avec des réalisations et justificatifs réels après définition du parcours de vérification ; avis liés à D10.
- F88/F91 : recette visuelle mobile, clavier, zoom 200 % et lecteur d’écran.
- F89 : vérifier l’installation et la réouverture sur Android/iPhone avec les accès privés. Voir [PWA.md](PWA.md).
- Restaurer une sauvegarde PostgreSQL dans un environnement isolé.
- Arbitrer D01–D13 avant toute règle commerciale, invitation entreprise nominative ou paiement réel.
