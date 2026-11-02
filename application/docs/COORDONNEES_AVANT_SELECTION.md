# Coordonnées avant sélection — contrôles et limites

## Écart reproduit le 2 novembre 2026

Le filtre reconnaissait les coordonnées courantes, mais certaines présentations
Unicode contournaient sa détection : `test＠ucp.test`, téléphone en chiffres pleine
largeur ou URL en caractères pleine largeur. Avant correction, cinq nouveaux tests
échouaient, dont la création d'annonce et la découverte d'une ancienne annonce.

## Correctif

`precontact_safe` retire les caractères de format invisibles (catégorie Unicode
`Cf`), puis inspecte une copie normalisée NFKC dont les espaces Unicode sont
harmonisés. Il recherche dans cette copie les motifs existants d'email, URL,
téléphone français et adresse de rue. Le texte valide conserve ses accents,
exposants, montants, dimensions et retours à la ligne ; il n'est pas remplacé par
la copie d'inspection. Les caractères de format sont retirés du texte conservé.

Le garde commun protège les entrées déjà raccordées : création/modification
d'annonce, publication de brouillon, nom du compte, communes/zones et présentations
professionnelles. Les refus n'écrasent pas les valeurs déjà enregistrées. Un brouillon
privé peut contenir du texte de travail mais ne peut pas être publié avec ces coordonnées.

Les anciennes annonces sont contrôlées à la découverte et à la candidature. Un
favori conserve sa référence privée mais ne restitue plus leur contenu. Le propriétaire
retrouve toujours sa propre annonce. Le détail professionnel réutilise désormais
le calcul de découverte dans **la même transaction**, sans ouvrir une seconde
transaction de recherche ; les droits après sélection gardent leur contrôle dédié.

## Vérifications

`tests/test_contact_normalization.py` couvre sept variantes de coordonnées,
la préservation de prose sûre, les refus création/modification/publication, les
anciennes annonces et les entrées compte/profil/présentation sans mutation.
Le parcours ancienne annonce → recherche/détail/candidature/favori est également
testé sur PostgreSQL dans `tests/test_postgres.py`.

## Limites explicites F39/F42

- Aucun filtre textuel ne garantit de reconnaître toutes les coordonnées : numéros
  étrangers, transcription en toutes lettres, réseaux sociaux, images ou autres
  obfuscations ne sont pas couverts exhaustivement.
- Le lot suivant ajoute un [filtrage en lecture des anciens profils](PROFILS_PUBLICS_HISTORIQUES.md).
  Il ne constitue pas une migration ou un audit exhaustif des contenus. Les photos
  ne font pas l’objet d’OCR.
- L'unicité serveur d'une candidature par projet/compte reste en place. Le lot suivant
  ajoute une [limitation technique de cadence](LIMITATION_CANDIDATURES.md), distincte
  du filtre de coordonnées et d'un éventuel forfait commercial.
- Les règles de sanctions, recours et lutte contre les abus multi-comptes restent à définir et tester.

Ce correctif renforce la confidentialité de la préproduction fictive. Il ne constitue
pas un audit de sécurité externe ni une acceptation complète de F39 ou F42.
