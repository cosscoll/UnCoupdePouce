# UCP — chatbot conversationnel IA (lot du 3 novembre 2026)

## Portée du lot

Le chatbot guidé `guided-help.js` de 2026-11-02 est conservé comme solution de repli technique si le module IA ne charge pas ; le module `assistant-ai.js` prend désormais la priorité lorsqu’il est présent. Il s’agit d'un **vrai modèle de langage**, pas d'un arbre de réponses. L’inférence se fait sur le serveur via **OpenAI Responses API** (`POST /v1/responses`), avec prompt français, contexte conversationnel et sortie JSON validée. Aucun texte fictif n’est envoyé au fournisseur avant l'action explicite de l'utilisateur.

### Parcours reliés

- Particulier : dialogue libre, clarification, suggestion d’une annonce structurée (titre, description, commune, métiers, délai), affichage de la proposition, clic `Utiliser dans mon annonce`. L’application enregistre d’abord un éventuel brouillon en cours, ouvre le formulaire normal et ne publie rien.
- Professionnel : dialogue libre, proposition de filtres (mots-clés, métier, commune, délai, période, budget, tri), clic `Appliquer ces filtres`, puis recherche UCP avec ses contrôles d’éligibilité. Aucune mission ni candidature n’est créée par l’IA.
- Tous : questions sur la navigation, profils, candidatures, messagerie, assistance. Le chatbot ne lit pas les données privées du compte : il répond à partir du prompt et des messages saisis seulement. Boutons d'accès aux rubriques existantes.
- Chaque clic d'action est volontaire ; suggestions et textes restent modifiables et soumis à la validation applicative.

### Activer sans exposer la clé

**Par défaut, désactivé**. L’application affiche clairement « IA non activée » et n’envoie aucun appel fournisseur.

Configurer les variables secrètes côté serveur (pour préproduction Vercel : *Project → Settings → Environment Variables*), puis effectuer un nouveau déploiement :

```env
UCP_AI_ENABLED=1
UCP_AI_API_KEY=<clé API serveur uniquement>
UCP_AI_MODEL=gpt-4.1-mini
UCP_AI_USER_DAILY_LIMIT=30
UCP_AI_GLOBAL_DAILY_LIMIT=200
```

Ne jamais placer `UCP_AI_API_KEY` dans GitHub, un `NEXT_PUBLIC_*`, JavaScript navigateur ou un document partagé. **La clé OpenAI API n’est pas fournie par ChatGPT Plus** ; l’utilisation de l’API peut générer des frais. L'activation n'est pas faite ici : elle requiert votre autorisation explicite du budget/fournisseur et une clé. Les plafonds ci-dessus sont des **quotas de requêtes**, et non un plafond monétaire réel ; mettre également un budget au niveau du fournisseur et un contrôle de facturation. Les quotas sont transactionnels dans la base UCP (table `ai_assistant_usage`), avec compteurs globaux et par utilisateur, pas de transcript.

### Sécurité et confidentialité

- Sécurité de session/CSRF héritée de `get_user` et revérification de session avant de rendre la réponse du modèle.
- Sortie JSON structurée et filtrée par les métiers actifs. Champs hors catalogue, budget incohérent, coordonnées évidentes et rôle inadapté ne deviennent jamais des suggestions applicables.
- Les messages sont limités (1200 caractères, maximum 12 tours précédents). Les sorties sont limitées (900 tokens modèle, 1600 caractères affichés). Délai réseau de 22 secondes. Quotas quotidiens en base.
- `store:false` pour la requête Responses. Aucune conversation n'est enregistrée par UCP ; cela n'est **pas** une garantie de rétention nulle chez le fournisseur. À documenter avant utilisateurs réels : traitement des données, base légale, durée de conservation, transfert hors UE éventuel.
- Les consignes indiquent données fictives uniquement en préproduction. Le filtre de coordonnées est une barrière indicative, pas une anonymisation infaillible.
- Modèle externe non autorisé pour publier, candidater, débloquer un compte, diagnostiquer techniquement, vérifier un document ou promettre la disponibilité d’un chantier.
- Pas de clé configurée ni d’appel réel au fournisseur lors de la livraison ; les tests fournisseur sont **mockés**. Recette manuelle avec la clé, tests navigateur réel et vérification du coût restant à faire avant activation.

### Points de contrôle

- `pytest -q backend/tests/test_ai_assistant.py`
- `node --test qa/guided-help.test.cjs`
- Connexion particulier : ouvrir assistant, accepter le transfert, décrire une annonce, vérifier la suggestion, ouvrir le brouillon et relire.
- Connexion pro : demander une recherche, confirmer les filtres, vérifier droits, communes et résultats.
- Déconnecter le compte pendant une réponse longue : aucune réponse d'une ancienne session ne doit se réafficher.
- Désactiver `UCP_AI_ENABLED` : l’interface doit afficher un blocage explicite sans générer de texte artificiel.

### Suites utiles

Conserver et reprendre l'historique de conversations avec consentement, assistance contextuelle à partir des projets privés avec permissions contrôlées, suggestion de réponses aux messages sans envoi automatique, aide au suivi des devis, notifications d'assistance humaine et contrôle qualité de la pertinence des métiers/recherches. Ces fonctionnalités ne sont **pas** incluses dans le lot.
