# Avancement vérifié du cahier des charges — 27 octobre 2026

Les états ci-dessous concernent la **préproduction privée avec données fictives**.
Ils ne valent ni ouverture commerciale ni validation des décisions D01–D13.

| Exigence | Développement de ce lot | Limite restante |
|---|---|---|
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
Les résultats CI et HTTPS effectifs sont consignés dans QA.md après exécution.

## Priorités suivantes

- F16 : comparer les métiers, zones et statut réel des candidatures ; aucun avis ou badge inventé.
- F87–F92 : recette mobile visuelle, installation PWA et reprise réseau.
- Restaurer une sauvegarde PostgreSQL dans un environnement isolé.
- Arbitrer D01–D13 avant toute règle commerciale, invitation entreprise nominative ou paiement réel.
