# Audit technique approfondi — Work 4.0.2

16 octobre 2026. Périmètre : véritable code Work partagé 4.0.1, puis correctifs et tests sur une copie isolée 4.0.2. Pas d'audit d'un service en ligne ni de données réelles.

Base contrôlée : `UCP_Work_v4.0.1_2026-10-16.zip`, SHA256 `63c77c185a18544680bfd7c0b1bb8ce3d3e7a661a5d90031053689a8c1ae7b53`. Les fichiers du manifeste ont été comparés avant la copie. La version 4.0.1 est conservée ; elle n'a pas été remplacée pendant la revue.

## Défauts reproduits et corrections

| Référence | Constat sur 4.0.1 | Correctif 4.0.2 | Preuve |
|---|---|---|---|
| SEC-01 | La liste d'échanges affichait encore titre et interlocuteur après masquage, suspension d'un participant ou retrait de validation pro, alors que les messages étaient refusés. | La liste applique les mêmes contrôles de modération, participation et état de conversation que l'accès au chat. | 4 scénarios initialement en échec, désormais réussis ; contrôles des photos et d'un tiers inclus. |
| SEC-02 | Une session pouvait être révoquée après la dépendance d'authentification, puis encore écrire un message, un projet, un brouillon ou un nom. | La session, l'expiration, le rôle et le CSRF sont revérifiés dans la transaction d'écriture, après acquisition du verrou SQL. Lectures privées et vérification des droits utilisent un instantané transactionnel. | 4 scénarios d'écriture initialement en échec ; 4 scénarios de lecture ; course réelle avec attente d'un verrou SQL ; rotation CSRF après authentification. |
| SEC-03 | Pendant le calcul du hash de connexion, un reset ou une suspension pouvait intervenir ; le snapshot initial permettait ensuite de créer une session. | Relire identité, hash/salt, suspension et verrouillage de connexion avant insertion de la session sous transaction d'écriture. | 2 scénarios initialement en échec ; aucune session créée après reset/suspension injecté pendant le calcul. |
| SEC-04 | Une session à la seconde exacte d'expiration était encore acceptée ; incohérence avec le comptage des sessions actives. | Expiration à `expires <= maintenant`, également appliquée aux codes de récupération. | 1 scénario session initialement en échec ; scénario limite de récupération ajouté. |
| SEC-05 | Certaines décisions admin mettaient à jour l'état puis inséraient l'audit en autocommit ; un échec d'audit pouvait donc laisser une décision sans trace. | Transaction commune pour chaque opération authentifiée ; retour arrière complet si une écriture échoue. | 3 pannes d'audit provoquées : validation, activation simulée et suspension restent dans leur état antérieur. |
| DATA-01 | Répéter la publication d'un brouillon lié à un projet clôturé renvoyait à tort `open`. | Retourner le statut réellement stocké du projet, sans le recréer ni le rouvrir. | Réessai après clôture : même ID, statut `closed`, un seul projet. |

Les onze premiers scénarios ont réellement échoué avant correctif (sortie `qa/audit-before.txt`), puis réussi. La suite approfondie comprend désormais vingt-deux scénarios, tous réussis (`qa/audit-after.txt`). Une sortie intermédiaire conserve la phase où sept des onze premiers scénarios passaient avant généralisation de la vérification transactionnelle.

## Limites exactes des garanties

Une révocation déjà enregistrée lorsque la transaction de l'opération commence est vérifiée. Pour une écriture qui attend le verrou SQL, une révocation enregistrée avant l'acquisition de ce verrou l'emporte. Une opération déjà autorisée et sérialisée avant la révocation peut finir avant elle. Une lecture commencée avant une révocation dispose de son instantané cohérent ; on ne prétend pas interrompre rétroactivement une réponse déjà en cours d'envoi.

La liste peut conserver un échange verrouillé uniquement par abonnement simulé ou inactivité d'un profil lié, conformément au contrat hérité. Ces indicateurs ne donnent accès ni aux messages ni aux photos. Les masquages, suspensions et retraits de validation professionnelle empêchent désormais l'affichage de cet échange.

La garde commune couvre les 57 opérations authentifiées des deux modules (40 dans app.py, 17 dans features_v4.py), vérifiées également par inventaire des routes. Login, inscription, catalogue public, healthcheck, bootstrap opérateur et reset par code suivent leurs règles dédiées. Aucun secret de session n'est ajouté aux réponses API ; la référence hachée utilisée pour la revérification reste interne. Le bootstrap reste désactivé sans configuration opérateur explicite et n'est pas une solution MFA de production.

Pas de changement de schéma nécessaire depuis 4.0.1. Pas de fournisseur Auth, base distante, service d'email, paiement ou collecte analytics ajouté. Les conditions commerciales et D01–D13 ne sont pas arbitrées par cet audit.

## Rejouer les contrôles

```sh
.venv/bin/python -m pytest -q backend/tests/test_access_audit.py
.venv/bin/python -m pytest -q backend/tests
```

Les tests utilisent FastAPI TestClient, des identités fictives et une base SQLite temporaire par cas. Les fenêtres de concurrence sont contrôlées par événements et transactions SQL ; aucun délai arbitraire n'est utilisé pour faire passer la course de révocation. Le test de concurrence ne remplace pas une recette de charge, réseau ou multi-processus.

Diff des sources : `PATCH_4_0_1_VERS_4_0_2.diff`. Les tests supplémentaires sont dans `backend/tests/test_access_audit.py`.

## Risques restant ouverts

Recette navigateur réel/API et accessibilité, staging privé avec droits de propriété vérifiés, moteur de production et migrations versionnées, protection anti-abus réseau, MFA admin, canaux transactionnels et vérifications professionnelles réelles, conservation/effacement, facturation TEST et supervision. Le filtrage des coordonnées et la modération des images ne sont pas des garanties absolues ; les pièces restent privées. Aucun GO commercial ni certification de sécurité n'est donné.
