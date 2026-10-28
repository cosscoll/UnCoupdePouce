# Budget facultatif des travaux

Le demandeur peut annoncer un minimum, un maximum, les deux ou aucun montant.
Les montants sont exprimés en euros entiers, de zéro à 2 147 483 647 (limite
technique du stockage). Un minimum supérieur au maximum est refusé. Zéro est
une valeur explicite ; une absence de budget reste inconnue et ne devient pas zéro.
Ces informations ne constituent ni un devis, ni un tarif UCP, ni un paiement.

Le budget est conservé dans le brouillon versionné et présenté au récapitulatif
avant publication. Les annonces existantes reçoivent deux valeurs nulles, sans
réécriture de leur contenu. Une publication répétée retourne le même projet.
Le détail et la liste suivent les droits de consultation existants. L'export
personnel inclut les montants de ses propres projets.

Un filtre professionnel sélectionne les intervalles qui recoupent le budget
recherché, bornes incluses. Une borne absente reste ouverte. Les projets sans
aucun budget sont exclus seulement lorsqu'un filtre de budget est actif. Ce
filtre intervient après les contrôles de droits, métiers et communes.

La modification garde la règle existante : projet ouvert, propriétaire seulement,
aucune candidature reçue. L'omission d'un champ conserve sa valeur ; une valeur
nulle l'efface. La cohérence des valeurs finales est contrôlée avant tout changement.
Les règles de modification après candidature restent un arbitrage métier distinct.
