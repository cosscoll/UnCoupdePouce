# Brouillons et sauvegarde automatique — F10

L'assistant enregistre les textes et critères du projet après **1,2 seconde sans
modification**. La première saisie crée un brouillon privé, les suivantes utilisent
sa version. Rechercher un terme dans le sélecteur de métiers ne crée pas un brouillon
vide. Choisir ou retirer un métier, modifier le texte, le lieu, le délai ou le budget
déclenche l'enregistrement. La publication reste une action explicite avec relecture.

Le statut indique les modifications en attente, l'enregistrement en cours, sa
confirmation ou son absence de confirmation. Une réponse ancienne ne remplace
jamais les champs saisis depuis son départ. Si des modifications surviennent
pendant un enregistrement, elles sont enregistrées ensuite. Les actions explicites
de navigation, de changement d'étape, de photo ou de publication attendent les
écritures en cours et les dernières modifications avant de continuer.

## Pannes et conflits

Après une panne, l'application suspend les enregistrements automatiques. Elle
conserve la saisie dans la page et propose **Réessayer l'enregistrement**. Elle
ne répète pas une écriture incertaine en boucle. Un budget invalide n'est pas envoyé ;
une correction de données invalides permet de reprendre la sauvegarde.

Une première création dont la réponse s'est perdue est réessayée avec la même clé
et exactement le même contenu initial. Après récupération de son identifiant,
les nouveaux textes sont enregistrés avec contrôle de version. Il n'y a pas de
deuxième brouillon créé pour la même tentative. Si une autre fenêtre a modifié ou
publié le brouillon entretemps, le client affiche un conflit et ne confirme pas
à tort sa copie locale comme version actuelle. Une suppression ne peut pas être
annulée par un ancien réessai de création.

Lors d'un conflit, aucun écrasement forcé n'est proposé. **Récupérer ma saisie**
présente une copie lisible des textes et critères, avec sélection du texte. L'utilisateur
peut ensuite charger explicitement le brouillon du compte ou revenir aux projets
sans enregistrer cette copie de travail. L'interface précise l'effet de ces actions.
Les photos déjà envoyées restent attachées au brouillon du compte ; elles ne sont
pas dupliquées dans la copie textuelle.

La fermeture de page déclenche un avertissement si une saisie ou une opération
est encore en attente. L'avertissement et la saisie en mémoire ne remplacent pas
la confirmation d'enregistrement. Une fermeture forcée ou un arrêt de l'appareil
avant confirmation peut perdre le texte non reçu par le serveur, particulièrement
sur mobile. Aucun cache de données privées ou stockage navigateur n'est ajouté.
La déconnexion et les changements de session annulent les actions différées côté
interface ; les réponses de l'ancienne session ne réaffichent pas son contenu.

## Contrat technique

`POST /api/v4/drafts` accepte une clé optionnelle `Idempotency-Key`, de 16 à 100
caractères parmi lettres ASCII, chiffres, point, tiret, deux-points et soulignement.
La clé générée par le navigateur est propre à une tentative et ne donne aucun accès
sans session et CSRF. Le contrôle est limité au compte propriétaire. Un contenu
différent avec la même clé renvoie 409. La création, son marqueur et l'audit sont
enregistrés dans la même transaction. Un réessai ne consomme pas le quota de trente
brouillons une seconde fois.

Le réessai renvoie la version initiale `1`, jamais une version plus récente qui
permettrait de contourner la protection d'une autre fenêtre. Si le brouillon a
changé ou a été publié depuis, `changed_since_creation=true` demande au client de
suspendre la reprise et de proposer une récupération explicite. Les mises à jour
continuent d'exiger la version exacte dans `PUT /api/v4/drafts/{id}`.
Les anciens clients sans clé restent compatibles ; ils ne bénéficient pas de la
déduplication des créations.

La table privée `draft_creation_retries` conserve la clé, le propriétaire, une
empreinte du contenu initial et l'identifiant du brouillon. Après suppression du
brouillon, l'identifiant est mis à NULL pour empêcher sa recréation par un ancien
réessai. Les marqueurs ne contiennent pas les textes supprimés ; ils disparaissent
avec le compte propriétaire. Leur conservation définitive reste à formaliser
avant production. Ils sont couverts par RLS et par le dump/restore PostgreSQL isolé
de CI, sans restauration des anciennes sessions.

Cette sauvegarde est un délai de saisie dans la page ouverte, sans tâche planifiée,
polling, service payant ou publication automatique. Les simulations DOM et la recette
API ne constituent pas une validation complète sur téléphone ou lecteur d'écran.
