# Rapprochement Work et automatisation classique

Contrôle du 16 octobre 2026. Le code Work est conservé comme base de développement, conformément à la directive utilisateur et au journal commun. La version v3.6 trouvée sur Drive a été étendue ; aucun nouveau backend concurrent n'a été reconstruit.

| Source | Contribution observée | Traitement dans Work 4.0.1 |
|---|---|---|
| Lot 05 | Notifications atomiques, isolation par destinataire, erreur de doublon trop large corrigée | Notifications déjà présentes en v3.6. Erreur de doublon corrigée dans les routes individuelle et entreprise, avec tests d'échec SQL et rollback. |
| Lot 06 | Blocage de coordonnées avant mise en relation, code postal strict | Filtre déjà présent dans Work. Work utilise des communes, pas des codes postaux ; aucune substitution de schéma. Photos restent privées. |
| Lot 07 | Sélection authentifiée, contrôles avant chat | Déjà présent dans Work. Divergence documentée : lot classique multi-sélection, Work sélection unique de laboratoire ; D01 non approuvée. |
| Lot 08 | Messages idempotents, même clé conservée après panne réseau | Adaptation intégrée : header Idempotency-Key, clé par conversation/émetteur, conflit 409 si texte différent, droits revérifiés avant réessai. |
| Lot 09 | RLock autour d'une connexion SQLite partagée, tests concurrents | RLock non repris : Work ouvre une connexion par opération et utilise BEGIN IMMEDIATE. Test de 16 réessais parallèles sur la base persistante temporaire ajouté. |

Archive classique 09 examinée : `UCP_Lot_Technique_09_2026-10-16.zip`, Library `libfile_38aae2be2ce081919b4c1d7507cf6e25`, SHA256 `542a2a10f1cd2a97f25d48f75fb66f604b8a25139e6237f5325c71bc29e3a9a9`. Empreinte vérifiée contre le manifeste téléchargé. Rapports de sessions 06–09 lus. Les 167 tests du lot 09 sont des résultats déclarés dans son rapport ; ils ne sont pas ajoutés aux tests Work et n'ont pas été rejoués pour cette intégration.

Archive classique 05 examinée : `UCP_Lot_Technique_05_2026-10-15.zip`, Library `libfile_856074495a40819199dd9fc1a4b9f567`, SHA256 `dc28b3538df7761a26f9b50b843e44486de77b56771194f157739f59c7c55007`. L'inspection a porté sur le contenu, les contrats et les rapports ; le serveur isolé n'a pas été déployé.

Les lots classiques restent conservés dans leurs archives d'origine. Les changements Work sont testés sur l'API Work, et non validés par simple copie de résultats.
