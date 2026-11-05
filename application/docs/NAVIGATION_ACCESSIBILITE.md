# Navigation et accessibilité — contrôles du code

Le menu de l'espace connecté devient repliable dans les styles destinés aux écrans
étroits. Son bouton indique la section courante, expose `aria-expanded` et contrôle
la navigation par `aria-controls`. Son nom accessible reprend « Menu » et sa
description indique la section courante. Le menu se ferme après une navigation réussie.
Échap le referme et ramène le focus à son bouton. Si la sauvegarde du brouillon
échoue, le menu et la saisie restent disponibles dans l'étape courante.

Les styles conservent le menu latéral sur grand écran. Sur petit écran, les liens
ouverts sont répartis sur deux colonnes avec une hauteur bornée et un défilement
vertical. Les titres longs peuvent revenir à la ligne. Le bandeau supérieur n'a
plus une hauteur fixe lorsque ses actions passent sur plusieurs lignes.
Le bouton flottant de l’assistant laisse une marge de défilement en bas de page
pour que les actions, y compris celles du pied de page, restent accessibles.

Après une navigation explicite, l'ouverture d'un projet ou un changement d'étape,
le titre de la page reçoit le focus sans être ajouté à l'ordre normal de tabulation.
Les réponses tardives d'une ancienne navigation ne reprennent pas le focus.
Le titre de l'onglet indique la section générique, sans recopier le titre privé d'un
projet ; la déconnexion rétablit le titre d'accueil.

Un dialogue place le focus dans son premier contrôle disponible. Lorsqu'il affiche
un nouveau contenu sans se fermer, son titre reçoit le focus pour réorienter la
lecture. À la fermeture, le focus retourne au bouton d'origine s'il existe encore ;
sinon il rejoint le titre de la page. Une confirmation suivie d'un rechargement
de page réoriente aussi le focus vers le contenu actualisé.

Le conteneur de toute la page n'est plus une région `aria-live`. Les compteurs,
alertes et statuts dédiés conservent leurs annonces ; la sauvegarde automatique
ne déplace pas le focus de saisie. Les bordures des contrôles et les textes
indicatifs sont assombris, et plusieurs cibles passent à une hauteur minimale de
44 pixels CSS. Le calcul des huit paires choisies est conservé dans
[la preuve de couleurs](../../docs/qa/navigation-couleurs-2026-11-02.json).

## Recette Chromium du 5 novembre 2026

Vérification avec des comptes fictifs, sur le serveur UCP local et sa base SQLite.
La recette a parcouru six écrans du particulier et dix du professionnel à
320, 390 et 1 440 pixels CSS, ainsi que la connexion, le formulaire de
modification d’une annonce et l’entrée de création d’un brouillon.

| Contrôle | Résultat |
| --- | --- |
| Écrans principaux et formulaires | Aucun défilement horizontal de la page sur les écrans parcourus. |
| Menu mobile au clavier | Entrée ouvre le menu, Tab atteint les rubriques, Échap ferme le menu et rend le focus au bouton. Une rubrique activée rend le focus au titre de la page. |
| Modification d’une annonce | Échap ferme le dialogue et le focus revient à « Modifier la demande ». |
| Bulle de l’assistant | Avant correction, elle recouvrait le centre de commandes ciblées au clavier dans les projets, le profil pro et le pied de page. Après correction, aucune commande parcourue dans les écrans testés n’a son centre masqué par la bulle. |

## Vérifications restantes

Le calcul de contraste porte sur les huit paires répertoriées. Le zoom natif
à 200 %, le lecteur d’écran et les téléphones physiques Android et iPhone
restent à tester. L’installation de la PWA relève d’une recette distincte.
Les largeurs Chromium caractérisent le rendu à la taille indiquée. Voir les
[critères de redistribution](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
et d’[agrandissement du texte](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).
