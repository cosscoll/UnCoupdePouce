# F35 / F16 — Photographies privées des réalisations d’artisans

## Périmètre du lot (6 novembre 2026)

UCP dispose déjà d’un portfolio textuel déclaré, séparé pour le professionnel individuel et les profils artisans liés à un compte entreprise, avec six réalisations maximum. Ce lot complète **les réalisations enregistrées** par **une photographie facultative par réalisation** (six par présentation).

**Où l’utiliser :** espace professionnel → Mon profil → Votre présentation et vos réalisations → Modifier (enregistrer les textes) → Photos du profil concerné. Remplacement et suppression sont possibles avec contrôles de version et confirmation avant suppression. Les demandeurs accèdent aux images depuis une **candidature réellement reçue**, via « Voir sa présentation » ou « Comparer les profils sélectionnés ». Aucun répertoire public ni catalogue externe n'est créé.

La gestion des photos est séparée de l'édition du texte pour éviter de perdre des champs saisis lors d'une transmission lourde : une nouvelle réalisation doit d'abord être sauvegardée avant l'envoi de son image.

## Autorisations et sécurité

- Image d'origine **JPEG, PNG ou WebP** de 4 Mo au maximum, 16 mégapixels maximum. Le serveur oriente l'image selon son EXIF, la convertit en RGB, la redimensionne à 1600×1600 maximum puis la réencode en **JPEG sans EXIF ni métadonnées** ; le résultat est limité à 2 Mo.
- Les images sont conservées en **base de données privée** dans `showcase_photos` ; chaque entrée est liée à l'ID du portfolio et non à une URL externe.
- Téléversement, remplacement, suppression, consultation et lecture sont exclusivement autorisés après vérification de la session et des droits ; les modifications exigent aussi le CSRF et le **numéro de version** du portfolio.
- Consultation par le demandeur uniquement pour une candidature associée à **son projet**, si l'artisan est toujours actif, autorisé pour les tests et que l'annonce n'est pas masquée. Les images sont recherchées dans le portfolio de **ce profil précis** et dans les réalisations dont le métier est encore déclaré et actif.
- La liste de recherche de chantiers, les favoris et les API publiques ne contiennent jamais les **octets** des images ni une URL non protégée. Les réponses d'image sont privées et définies `Cache-Control: no-store`.
- Supprimer une photo ou retirer une réalisation supprime les octets correspondants dans la même transaction que la mise à jour du portfolio. Journal d'audit enregistré.
- Une image d'un autre profil, d'une autre entreprise ou d'un autre compte ne peut pas être liée à une réalisation par simple identification de l'ID.
- Aucun appel à un service externe, aucun abonnement IA/API, aucune modification du paiement.

## Limites et règles de présentation

**Les images sont déclaratives et non vérifiées.** Un portfolio ne constitue pas une certification, un justificatif d'assurance, une garantie que les travaux ont été réalisés, ni un avis client. En préproduction, utiliser uniquement des images **fictives ou autorisées**, sans personnes reconnaissables, coordonnées, plaques, adresses, documents ou informations de client. Le serveur supprime les métadonnées mais ne peut pas détecter des informations personnelles visibles **dans les pixels** : pas d'OCR ni modération automatisée d'images dans ce lot.

Aucune publication générale des photos ni consultation par d'autres entreprises ou administrateurs. Les procédures de vérification des réalisations, suppression RGPD, réclamations, contrôle des photos par modérateur avec ouverture de dossier, et recette mobile réelle restent à cadrer avant l'ouverture commerciale. Le cahier des charges F35/F16 reste donc **partiel**.

## Recette

- API : traitement JPEG/PNG/WebP et EXIF, limites de taille, session et CSRF, accès strict du propriétaire, candidature du projet concerné, profil lié isolé, désactivation et masquage, retours 404/403, conflit de version, suppression et nettoyage, audit.
- Interface : photo du bon artisan dans le détail de sa candidature et son comparateur, upload lié à la bonne réalisation, conservation de `photo_id` pendant les éditions de texte, confirmation des suppressions, affichage mobile.
- Les tests CI vérifient l'intégrité, l'isolation et les droits. La recette visuelle et sur téléphones physiques est distincte.
