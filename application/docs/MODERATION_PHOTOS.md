# Consultation des photos en modération

Un rôle administrateur ne suffit plus à lire une photo privée par son identifiant.
L'administrateur doit ouvrir un **signalement de projet encore ouvert**, fournir
un motif d'examen via le parcours existant puis utiliser le lien de photo de ce dossier.
Un signalement de conversation, un autre projet, un dossier traité ou un examen
effectué seulement par un autre administrateur ne donne pas cette autorisation.

L'examen du projet renvoie uniquement les identifiants de ses photos déjà publiées.
L'interface propose des liens explicites, sans chargement automatique des images.
Chaque lien précise son dossier (`report_id`) ; le serveur recontrôle le dossier,
le projet de la photo, l'identité de l'administrateur et son examen motivé à chaque
lecture. Un lien d'un dossier traité devient inutilisable même si un autre dossier
existe pour le même projet. Il ne donne aucun accès aux photos des brouillons privés.

Avant de rendre l'image, la transaction inscrit la photo consultée dans l'audit et
la consultation correspondante dans les décisions du dossier, avec acteur et date.
Cette dernière mention est générée par le serveur et n'est pas présentée comme un
nouveau motif humain ; le motif d'examen initial reste conservé dans le dossier.
Si une trace ne peut pas être écrite, aucun octet de photo n'est retourné.
Les images restent servies avec `Cache-Control: no-store`.

| Lecteur | Condition |
| --- | --- |
| Propriétaire | Session valide du propriétaire de la photo |
| Professionnel | Sélection et conditions de conversation toujours valides |
| Administrateur | Dossier de projet ouvert, examen motivé propre à cet administrateur et photo du seul projet du dossier |
| Autre compte | Refus |

Le propriétaire et le professionnel sélectionné gardent leur parcours existant.
Aucun accès général aux conversations ou aux pièces privées n'est ajouté.
Les politiques de rétention, les fonctions distinctes support/modération et la
recette sur appareils réels restent à formaliser. Cette correction ne constitue
pas un audit de sécurité externe exhaustif.
