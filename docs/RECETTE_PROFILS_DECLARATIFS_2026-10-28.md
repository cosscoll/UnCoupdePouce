# Présentations et réalisations — recette du 28 octobre 2026

Périmètre : préproduction privée UCP, données fictives uniquement. Les réalisations
sont textuelles et déclaratives ; aucune preuve de chantier, certification, photo
ou note client n'est inventée. F35 et F16 demeurent partiellement réalisés.

Le lot conserve FastAPI, les profils et les droits existants. Chaque individu et
profil lié a sa présentation propre, jusqu'à six exemples, un aperçu et une
sauvegarde versionnée. Un demandeur ne consulte ou compare ces informations que
pour une candidature reçue sur son propre projet. Aucun annuaire public ajouté.

## Vérification automatisée

[Application CI 40700379477](https://github.com/cosscoll/UnCoupdePouce/actions/runs/40700379477) :
**165 tests Python et 47 tests DOM/worker réussis** sur le code intégré par la
[pull request 36](https://github.com/cosscoll/UnCoupdePouce/pull/36).

Les nouveaux contrôles couvrent les profils liés, les accès inter-comptes,
les coordonnées directes, conflits de version, première sauvegarde concurrente,
retour arrière en cas d'échec d'audit, changement de métier, masquage et suspension.
Les scénarios PostgreSQL incluent consultation propriétaire et restauration du
contenu, avec exclusion des anciennes sessions. Il s'agit d'une base de test
isolée, pas d'une restauration du projet Neon réel.

Les contrôles DOM couvrent les conflits conservant la saisie, les deux profils
du comparatif, le rendu de texte ressemblant à du HTML, le maximum de six exemples,
l'effacement explicite et le refus d'un résultat devenu obsolète. La recette
visuelle sur téléphone et l'accessibilité complète ne sont pas validées.

## Reprise réseau des profils liés

Une panne du chargement des profils liés n’empêche plus l’édition du profil
individuel. Le réessai recharge uniquement la liste liée et conserve la commune
en cours de saisie. Le scénario DOM correspondant est réussi, portant la suite
locale à 48 tests DOM/worker, en attente de la validation CI du correctif.
