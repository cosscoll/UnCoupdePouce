# Livraison vérifiable des sprints — UnCoupdePouce

## Règle de vérité
Un sprint ne vaut pas déploiement. Chaque compte rendu doit fournir : projet, heure UTC, SHA du commit, branche, fichiers changés, tests exécutés et résultats, PR, statut de fusion, URL de production et résultat HTTP, ou indiquer explicitement « non livré » avec cause. Ne jamais annoncer « en ligne » sur la seule base d'une archive, d'un test local ou d'un commit.

## Procédure obligatoire
1. Lire la branche principale, les PR ouvertes et les décisions du projet avant modification.
2. Conserver les sources dans le dépôt approprié, sur une branche dédiée, sans secrets, données personnelles, ressources pédagogiques premium ou bases locales.
3. Si une écriture est refusée, enregistrer le message exact et arrêter cette opération : ne pas contourner le contrôle par un autre outil ou compte. Conserver l'archive dans l'emplacement privé autorisé et signaler le blocage.
4. Exécuter les tests pertinents, vérifier l'absence de régression, d'exposition de secrets et de conflit avec les travaux existants. Ne pas fusionner si l'un des contrôles échoue.
5. Ouvrir une PR vers main ; fusionner seulement si le changement est sûr, les contrôles passent et les permissions l'autorisent. Les développements expérimentaux restent sur branche.
6. Vérifier séparément la publication effective (GitHub Pages ou hébergeur configuré), réponse HTTPS et parcours fonctionnel. Un dépôt à jour n'implique pas un site à jour.
7. Enregistrer dans le suivi central un statut parmi : livré et vérifié / commité non fusionné / fusionné non déployé / sauvegardé hors GitHub / bloqué, avec preuves et action suivante.

## Cas particuliers
- CONTROL IA : préserver les tests et la PWA ; recette mobile réelle avant affirmation de compatibilité.
- IAgile : la vitrine peut être publique ; les cours, assets et ressources premium doivent rester dans un stockage privé avec autorisation côté serveur.
- UCP : ne pas écraser la branche Codex ni le travail local ; l'application FastAPI/SQLite ne devient pas hébergée par la simple publication GitHub Pages.
- Business 01 et 02 : prototypes et commandes uniquement démonstratifs tant que validation juridique, métier, RGPD et paiements manquent.

## Conditions permanentes
Aucune dépense ; aucun recours Work/Codex/agents ou aux quotas limités dans les automatisations ; aucune désactivation des tâches sans ordre de l'utilisateur. Les refus de sécurité prévalent sur cet objectif de livraison.
