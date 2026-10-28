# Recherche de missions — préproduction du 28 octobre 2026

Les filtres s'appliquent **après** les contrôles d'accès : un mot-clé, une commune
ou un métier ne peut jamais élargir le périmètre du compte. Aucun décompte des
missions hors droits, nom de demandeur ou brouillon brut n'est renvoyé.

- Mots-clés sur titre, description, commune, métiers, catégories et synonymes.
  Recherche sans distinction de casse ou d'accents.
- Combinaison métier, commune exacte, catégorie, début souhaité, dernières
  24 heures/7 jours/30 jours et tri par date. Le demandeur peut filtrer le statut.
- Raison de correspondance : métier(s) commun(s), commune couverte et profil
  individuel ou profil lié effectivement utilisé pour candidater.
- Les filtres restent en mémoire pendant la navigation du même compte. Effacer
  les filtres est explicite. Aucun stockage navigateur ni recherche enregistrée.
- Profil absent/en attente : explication adaptée, sans aucune mission privée.
- Échec réseau : saisie et derniers résultats conservés avec état d'erreur.

Le matching d'autorisation garde la règle existante par métier et commune déclarée.
La normalisation des filtres n'élargit pas les autorisations. Aucun rayon, distance
réelle ou classement de pertinence n'est ajouté. Le budget facultatif déclaré
est désormais filtrable par recoupement ; voir BUDGET.md. Géocodage et recherche
sur un grand volume restent à développer et valider.

L'explication n'expose que les missions déjà autorisées. Une mission extérieure au
périmètre demeure invisible ; son existence n'est pas révélée pour expliquer un refus.
Les arbitrages D01–D13 et les règles d'abonnement restent inchangés.
