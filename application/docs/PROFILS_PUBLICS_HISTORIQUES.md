# Anciens profils : filtrage lors de la consultation — F15/F35/F39

## Écart reproduit

Le contrôle des nouvelles saisies ne corrigeait pas les données déjà stockées. Les
anciens noms, communes, zones, métiers secondaires et alias pouvaient contenir des
coordonnées Unicode puis être renvoyés tels quels dans une candidature. Une ancienne
présentation pouvait également diffuser ces coordonnées. Les titres et noms des
en-têtes de conversation restaient affichables lorsque la messagerie était verrouillée.
Les neuf premiers tests de régression échouaient sur la version précédente.

## Lecture filtrée, données du propriétaire conservées

- La liste des candidatures filtre nom, commune, métier, alias, métiers et communes
  d'intervention avant restitution. Un champ sensible reçoit un libellé générique ;
  une valeur sensible dans une liste est retirée. Les autres valeurs sûres restent.
- Un indicateur `public_details_restricted` est ajouté seulement lorsque des champs
  sont masqués. Les cartes et le comparatif expliquent cette restriction sans
  présenter le profil comme vérifié. Identifiant, état et droits de sélection ne
  sont pas remplacés par des valeurs inventées.
- La présentation consultée par un demandeur est revalidée et filtrée. Si son
  introduction ou une réalisation effectivement affichable contient des coordonnées,
  le serveur renvoie un 404 générique et aucun contenu de présentation. Un ancien
  nom sensible est remplacé par « Profil professionnel ».
- Le suivi des candidatures filtre les titres, communes et métiers des projets.
  Les en-têtes de conversation filtrent titre et nom du participant, y compris
  lorsque l'accès au chat nécessite encore une activation de test.

Les données en base ne sont ni modifiées ni effacées par ces lectures. Le propriétaire
retrouve son nom, son profil et sa présentation dans ses vues privées pour les corriger.
Une présentation corrigée avec sa version actuelle redevient consultable selon les
droits habituels. Aucun accès supplémentaire au chat ou aux photos n'est accordé.

## Preuves et limites

`tests/test_legacy_public_profiles.py` couvre les champs individuels et liés,
présentations, correction par le propriétaire, en-têtes verrouillés et refus d'un
compte tiers. Le parcours noms/en-têtes est aussi exécuté sur PostgreSQL. Les
simulations DOM vérifient l'explication dans les cartes/comparatifs et l'état de
présentation indisponible.

Ce filtrage réutilise les motifs actuels de coordonnées et la normalisation Unicode.
Il ne détecte pas toutes les obfuscations, numéros internationaux ou coordonnées en
images. Il ne constitue ni migration exhaustive des données historiques, ni OCR,
ni audit externe de sécurité. Les données de modération motivée, messages privés
déjà autorisés et exports propriétaires conservent leurs règles distinctes.
F15/F35/F39 demeurent partiels ; recette visuelle et appareils réels ouverts.
