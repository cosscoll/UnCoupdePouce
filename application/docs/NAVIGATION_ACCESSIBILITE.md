# Navigation et accessibilité — contrôles du code

Le menu de l'espace connecté devient repliable dans les styles destinés aux écrans
étroits. Son bouton indique la section courante, expose `aria-expanded` et contrôle
la navigation par `aria-controls`. Le menu se ferme après une navigation réussie.
Échap le referme et ramène le focus à son bouton. Si la sauvegarde du brouillon
échoue, le menu et la saisie restent disponibles dans l'étape courante.

Les styles conservent le menu latéral sur grand écran. Sur petit écran, les liens
ouverts sont répartis sur deux colonnes avec une hauteur bornée et un défilement
vertical. Les titres longs peuvent revenir à la ligne. Le bandeau supérieur n'a
plus une hauteur fixe lorsque ses actions passent sur plusieurs lignes.
Ces règles n'ont pas encore été vérifiées sur un écran réel ou dans une capture
du navigateur de contrôle ; leur validation visuelle reste ouverte.

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

## Limites de la recette

Les tests jsdom vérifient les attributs, transitions et mouvements de focus simulés.
Ils ne calculent pas le rendu responsive, le zoom, les positions ou le défilement
d'un navigateur réel. Le calcul de couleurs porte uniquement sur huit paires
déclarées ; il n'est pas un audit de contraste de tous les pixels ou états.

Le navigateur de contrôle rencontre `net::ERR_INVALID_AUTH_CREDENTIALS` avant
d'atteindre l'application protégée par HTTP Basic. Aucune capture de parcours n'est
acceptée et aucune protection n'est retirée. Les contrôles de code se poursuivent,
mais la recette visuelle, clavier réel, lecteur d'écran, zoom 200 %, Android/iPhone
et installation PWA restent à effectuer. Aucune conformité WCAG globale n'est annoncée.
