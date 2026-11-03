# Avancement vérifié du cahier des charges — 2 novembre 2026

Les états ci-dessous concernent la **préproduction privée avec données fictives**.
Ils ne valent ni ouverture commerciale ni validation des décisions D01–D13.

Le 2 novembre, 21 exigences supplémentaires sont réévaluées avec leurs tests et
limites explicites. La lecture administrative des photos exige désormais le dossier
de projet ouvert et motivé du même administrateur ; chaque consultation est tracée
avant restitution. Voir [réévaluation](../../docs/REVALIDATION_P0_2026-11-02.md).

| Exigence | Développement de ce lot | Limite restante |
|---|---|---|
| F41/F43/F52–F56 — Entreprise | Audit du modèle actuel, confirmation des effets de profil lié, notifications internes atomiques et journal de création ; réactivation sans restauration des retraits. Voir [entreprise](ENTREPRISE_EFFETS.md). | Un seul login gestionnaire ; identité juridique distincte, SIRET, invitations, comptes nominatifs, rôles et paiement réel non livrés. Unité commerciale à arbitrer. |
| F20 — Assistant conversationnel | Chatbot guidé pour particulier/professionnel, préparation d’annonce avec choix des métiers, commune, délai et transfert explicite ; sauvegarde de la saisie existante, navigation guidée pour les professionnels. Voir [assistant](ASSISTANT_GUIDE.md). | Réponses préparées, sans modèle IA externe ni mémoire durable ; recette réelle ouverte. 30 exigences encore à réévaluer. |
| F15/F35/F39 — Profils historiques | Champs sensibles masqués en lecture des candidatures, présentation indisponible si elle contient des coordonnées, en-têtes filtrés ; vues privées conservées pour correction et explication du masquage dans le comparatif. Voir [profils historiques](PROFILS_PUBLICS_HISTORIQUES.md). | Motifs de coordonnées non exhaustifs, pas d’OCR ni audit complet des données anciennes ; appareils et recette visuelle ouverts. |
| F42 — Cadence des candidatures | Fenêtres glissantes par compte gestionnaire, communes aux profils individuel/liés ; refus 429 avec délai, sans candidature ni notification, transactions et concurrence vérifiées. Voir [limitation](LIMITATION_CANDIDATURES.md). | Seuils techniques de préproduction ; règles commerciales, abus multi-comptes, sanctions et charge réelle ouverts. |
| F39/F42 — Coordonnées avant sélection | Inspection Unicode normalisée, conservation de la prose valide, refus sans écrasement et anciennes annonces exclues de la découverte/favoris ; détail dans la même transaction de droits. Voir [contrôles](COORDONNEES_AVANT_SELECTION.md). | Pas de détection exhaustive ni audit complet des anciens profils ou OCR ; filtrage en lecture ajouté dans le lot profils historiques. Cadence technique livrée séparément ; abus multi-comptes et charge réelle ouverts. F42 reste partiel ; 30 exigences encore à réévaluer. |
| F09/F12/F25 — Budget facultatif | Bornes indépendantes en euros entiers, brouillon versionné, récapitulatif, publication idempotente, consultation selon droits et filtre par recoupement. Valeur absente distincte de zéro. | Montant indicatif déclaré, sans devis ni paiement. Modification bloquée après candidature selon la règle existante. |
| F10 — Brouillons | Sauvegarde après pause, sans remplacement des nouvelles saisies par une réponse tardive ; réessai de création dédupliqué, contrôle de version et copie de récupération en cas de conflit. Les actions explicites attendent les écritures en cours. | Aucune garantie de conservation avant confirmation en cas de fermeture forcée ou arrêt d'appareil ; pas de cache privé hors connexion. Recette mobile ouverte. |
| F88/F91 — Navigation et accessibilité | Menu repliable et section courante, orientation du focus, retour des dialogues, cibles agrandies et calcul de huit paires de couleurs ; interactions simulées en DOM. | Navigateur de capture bloqué par l'authentification ; rendu petit écran, zoom 200 %, clavier/lecteur d'écran réels et téléphones non validés. |
| F30/F33/F34 — Suivi des candidatures | Vue d’ensemble professionnelle avec missions autorisées, profil, accès de test, notifications et conversations ; compteurs personnels, filtres par état, distinction du projet clôturé et motif d’indisponibilité de la messagerie. Profil lié identifié sans coordonnées privées. | Aucun état « examinée » inventé. Les droits entreprise et abonnement restent simulés. |
| F36 — Notifications internes | Historique paginé, filtre non lues, lecture individuelle/idempotente ou globale, compteur complet et réessai conservant les résultats. | Notifications internes seulement : emails et push non livrés. |
| F79/F81 — Alertes de statut | Notification propriétaire lors des changements d'autorisation du profil, d'accès de test ou de suspension du compte. Réessais sans doublon et transaction commune avec le changement d'état. | Aucun abonnement réel ou canal externe. Un compte suspendu ne consulte l'historique qu'après levée de suspension et reconnexion. Référentiel historique des 17 événements non entièrement accepté. |
| F35 — Présentation et réalisations | Présentation courte, six réalisations textuelles, aperçu personnel, sauvegarde versionnée et séparation de chaque profil lié. Consultation depuis les seules candidatures reçues. | Déclarations non vérifiées ; photos, justificatifs, assurances, certifications et avis non livrés. |
| F16 — Comparaison | Jusqu’à trois profils actuels, métiers et communes déclarés, date de candidature, statut de test et disponibilité de sélection. Le comparatif distingue le profil lié de son gestionnaire et exclut coordonnées et facturation. | Réalisations textuelles déclarées consultables et comparables. Avis, photos, assurances et vérification réelle restent absents ; aucune note ou certification inventée. |
| F24–F25 — Recherche | Filtres combinés après autorisation : mots-clés/synonymes, métier, commune, catégorie, délai, ancienneté et date. Explication du profil et du métier correspondants ; pas de missions hors droits. | Géocodage, pertinence et pagination grand volume restent à traiter. Aucun rayon calculé à partir d’une commune. |
| F37 — Favoris | Cinquante références privées, ajout/retrait idempotent, détail sous droits actuels, projet indisponible sans contenu, quota atomique, audit et export propriétaire. Voir [FAVORIS.md](FAVORIS.md). | Aucune recommandation IA ni alerte automatique ; recette visuelle/appareils et grands volumes ouverts. |
| F37 — Recherches enregistrées | Dix jeux de critères privés par professionnel, application explicite, suppression confirmée, export propriétaire et contrôles de concurrence. Les résultats sont recalculés selon les droits actuels. | Aucune recommandation IA ou alerte automatique ; recette appareils ouverte. |
| Reprise PostgreSQL | Outil opérateur manuel avec snapshot cohérent, fichiers privés, checksum, refus d’une cible non vide ; vrai dump/restore en base fictive isolée, photos/séquences contrôlées et anciennes sessions exclues. | Sauvegarde/restauration du projet Neon réel, chiffrement, stockage externe et rétention non exécutés. |
| F50 — Reprise réseau | Saisie et clé de réessai conservées dans la page ; relecture explicite et envoi réactivé après contrôle ; réponse tardive d’un ancien chat ignorée. | La fermeture/recharge peut perdre une saisie non enregistrée. Tests de pannes sur téléphone à réaliser. |
| F89–F90 — Installation web | Manifeste authentifié, icônes officielles, aide d’installation et invitation conditionnelle du navigateur ; page hors connexion générique sans cache de données privées. | Installation/réouverture Android et iPhone non vérifiées sur appareils réels. Aucune application native ou publication store. |
| F49 — Signalement | Bouton sur chaque message, signalement ciblé, contrôle du participant et refus des doublons ouverts. Le signalement de conversation et de projet est conservé. | Politique complète de sanctions, blocage individuel, conservation et recours à formaliser. Aucune suppression automatique de message. |
| F82 — Back-office | Examen du contenu d'un dossier ouvert : projet signalé, message exact ou conversation signalée par fenêtres de 20 messages. Rôles et CSRF contrôlés. | Pas de lecteur général des conversations privées pour les administrateurs. Vérification professionnelle réelle toujours absente. |
| F83 — Audit | Chaque consultation privée exige un motif interne ; identité, date et dossier sont journalisés avant restitution. Si l'écriture de l'audit échoue, aucun contenu n'est rendu. Réponse et clôture sont tracées. | Politique de rétention et séparation de rôles admin/support à définir avant production. |
| F84 — Support | Rubrique Assistance : signalements personnels, état ouvert/traité, réponse de l'équipe et pagination. Notification interne lors de la réponse, dans la même transaction. | Demandes générales catégorisées, suivi privé et réponse administrative disponibles. Escalade, emails et délais contractuels non implémentés. Aucun délai de réponse promis. |

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

Lot recherche/reprise : 143 tests Python PostgreSQL/SQLite et 26 tests DOM/worker
réussis. Voir RECHERCHE.md et SAUVEGARDE_POSTGRESQL.md pour les périmètres exacts.

## Priorités suivantes

- F16/F35 : compléter les réalisations textuelles par des photos et justificatifs après définition de leur confidentialité et du parcours de vérification ; avis liés à D10.
- F88/F91 : recette visuelle mobile, clavier, zoom 200 % et lecteur d’écran.
- F89 : vérifier l’installation et la réouverture sur Android/iPhone avec les accès privés. Voir [PWA.md](PWA.md).
- Exécuter la sauvegarde/restauration du projet Neon réel sur une cible isolée avec les accès opérateur ; le test PostgreSQL fictif de CI est réussi.
- Arbitrer D01–D13 avant toute règle commerciale, invitation entreprise nominative ou paiement réel.
