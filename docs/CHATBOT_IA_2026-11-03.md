## Correctif qualité des réponses — 5 novembre 2026

Un test utilisateur a montré que le petit Qwen 2.5 0,5B répétait des réponses génériques à une question « Tu peux m'aider à faire quoi ? » puis à une description de salle de bains, avec une commande inutile « Ignorer la proposition ».

- Modèle conversationnel **Qwen2.5-3B-Instruct** par défaut : q4f16 (~2,50 Go de VRAM) ou q4f32 (~2,89 Go) selon la compatibilité `shader-f16`.
- Un modèle **Qwen2.5-1.5B-Instruct** (q4f16 ~1,63 Go ou q4f32 ~1,89 Go de VRAM) est disponible dans « À propos de cette IA » pour appareils plus limités. Ce choix est mémorisé dans le navigateur et exige un autre téléchargement la première fois.
- Le prompt est **spécifique au rôle** et centré sur la question : les simples échanges n'injectent plus toute la liste de métiers ; la liste n'est fournie que pour la génération structurée d'annonces et de filtres. Aide à la rédaction, questions précises sur les travaux, recherches et candidatures. Le chatbot ne consulte aucune donnée réelle du compte.
- La détection de répétitions est testée contre la conversation signalée et déclenche **une seule nouvelle génération locale**, non une réponse préenregistrée. Toutes les réponses continuent à être produites par le modèle, sans API payante.
- L'interface n'affiche plus « Ignorer la proposition » lorsqu'aucune proposition d'annonce ou de recherche n'a effectivement été produite.

**Limite importante :** la qualité d'un modèle local 3B reste inférieure à celle d'un grand modèle hébergé sur de nombreux cas. Le chargement est beaucoup plus lourd que l'ancienne version (plusieurs Go de poids/mémoire nécessaires) et peut échouer sur des appareils insuffisants. Le modèle léger améliore la compatibilité mais ne garantit pas la même qualité. Les tests automatisés vérifient l'intégration et des propriétés des prompts ; ils ne remplacent pas une campagne de tests des sorties **réelles** sur ordinateur et mobile WebGPU. Pour le moment, la compatibilité universelle et la qualité conversationnelle ne sont pas garanties.


# UCP — assistant IA gratuit directement dans le navigateur (03/11/2026)

## Choix technique

Le projet UCP **n'utilise plus l'API OpenAI payante** : le backend d'inférence, ses routes `/api/assistant/chat` et `/api/assistant/status` et les instructions de configuration d'une clé facturée ont été supprimés. Aucun abonnement, clé API, token fournisseur ou service de paiement n'est nécessaire pour le chatbot.

Le moteur est [WebLLM](https://github.com/mlc-ai/web-llm) exécuté dans un **Web Worker** du navigateur, avec le modèle open source [Qwen2.5-0.5B-Instruct](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC), quantifié en 4 bits. L'ensemble des calculs s'exécute **sur le GPU du visiteur** via WebGPU ; les messages et réponses ne sont pas envoyés à une API de génération. Le modèle et son moteur sont téléchargés depuis les hébergements publics (Hugging Face/MLC/CDN jsDelivr) lors de la première utilisation, puis mis en cache par le navigateur, dans la mesure de ses capacités.

**Limitation importante :** ce moteur demande WebGPU et de la mémoire vidéo disponible (ordre de grandeur d'environ 1 Go pour la variante choisie), ainsi qu'un téléchargement initial de plusieurs centaines de mégaoctets. Il ne fonctionne donc **pas sur tous les téléphones**, anciens navigateurs ou ordinateurs. La qualité et la vitesse d'un modèle de 0,5 milliard de paramètres restent nettement inférieures à celles d'un grand modèle hébergé. Une solution universelle pour tous les appareils devra être envisagée séparément (serveur d'inférence auto-hébergé ou fournisseur externe) et pourrait nécessiter une infrastructure payante. Ce lot ne l'active pas.

## Fonctionnalités effectivement câblées

1. Fenêtre Assistant UCP après connexion côté particulier et côté professionnel, échanges naturels, maintien du contexte de la conversation en mémoire de page, génération à partir du prompt du système et de l'historique fourni par l'utilisateur.
2. Bouton particulier **« Préparer mon annonce avec l’IA »** qui demande au modèle une proposition structurée (titre, description, commune, métiers, délai), la valide contre le catalogue actif côté navigateur et n'affiche le bouton **« Utiliser dans mon annonce »** que si la proposition est exploitable. Le transfert vers le brouillon suit l'ancien mécanisme : sauvegarde préalable des éventuelles saisies en cours, pas de publication automatique.
3. Bouton professionnel **« Configurer ma recherche avec l’IA »** qui propose mots-clés, métier, commune, délai et budget. Après validation explicite, les filtres ouvrent le formulaire de recherche normal ; les droits et le catalogue serveur restent prioritaires. Pas d'envoi de candidature.
4. Indication d'incompatibilité explicite lorsque WebGPU est absent : **aucune fausse réponse d'IA** ni bascule cachée vers un service payant.
5. Téléchargement déclenché uniquement par l'utilisateur après acceptation ; progression de téléchargement / chargement indiquée. Aucun téléchargement automatique à l'ouverture de l'application.
6. Réinitialisation du worker IA et de la conversation lors du changement de compte/session pour éviter des fuites de contenu entre comptes. Le navigateur peut conserver les **poids publics du modèle** en cache, pas les messages.
7. La saisie est bornée (1 200 caractères par message) ; historique limité en mémoire. Les sorties applicables sont validées (champs, budget, métier du catalogue, coordonnées manifestes) mais restent toujours à relire. Les filtres de coordonnées ne constituent **pas** une garantie d'anonymisation.

## Où se trouve le code

- `application/backend/static/local-ai-worker.js` : import WebLLM CDN version épinglée, modèle, prompts, génération texte et génération JSON encadrée.
- `application/backend/static/local-ai.js` : compatibilité, worker, messages, prévalidation des annonces et filtres.
- `application/backend/static/assistant-ai.js` : interface de chat et boutons de confirmation.
- `application/backend/static/app.js` : connexion aux brouillons/recherches existants sans publication automatique.
- `application/backend/app.py` : politique CSP restreinte aux domaines nécessaires pour charger scripts, poids modèles et WebAssembly.

## Tests et vérifications

Exécuter `node --test application/qa/assistant-ai.test.cjs application/qa/local-ai.test.cjs` et `pytest -q application/backend/tests/test_local_ai_assets.py`.

Les tests automatisés simulent la génération et vérifient les droits/confirmations, mais **ne prouvent pas encore le téléchargement WebGPU complet ni la qualité des réponses**. Avant d'ouvrir l'outil aux utilisateurs, faire la recette sur un PC Chrome/Edge avec WebGPU et sur plusieurs appareils Android/iPhone représentatifs. Vérifier les erreurs réseau/CORS/CSP, téléchargement complet, réponse à trois messages successifs, extraction d'annonce et de filtres, performances, consommation mémoire, puis session expirée.

En préproduction UCP, saisissez uniquement des données fictives. Les hébergeurs publics voient les requêtes de téléchargement d'assets (par exemple IP/agent utilisateur), même si les messages de discussion n'y sont pas envoyés.

## Correctif du 5 novembre 2026 — chargement du modèle

Un utilisateur a constaté que la fenêtre s'ouvrait mais qu'une erreur générique « Échec du chargement du moteur IA local » apparaissait à l'envoi du premier message. Cette erreur provenait de `Worker.onerror` : un chargement du script Worker avait échoué avant le traitement. Le message ne donnait pas la cause réseau/CSP exacte.

Pour éviter une dépendance bloquante au démarrage du Worker :
- Le Worker charge désormais **uniquement du JavaScript UCP local** au démarrage, puis le moteur WebLLM par `import()` dynamique, avec deux CDN distincts et des erreurs explicites.
- En cas d'échec d'ouverture du Worker ou d'import de la bibliothèque dans celui-ci, UCP **réessaie automatiquement la même IA locale dans la page**. Il ne bascule sur aucune API de génération hébergée et n'envoie aucun message de conversation à un fournisseur.
- L'interface affiche la progression réelle, ou la cause diagnostiquée, et propose **« Réessayer de générer la réponse »** sans ressaisir le message.
- Les longs avertissements techniques sont dans une section repliée afin que la zone de conversation reste visible.
- Le fichier partagé `application/backend/static/local-ai-engine.js` centralise modèle, instructions, validation de génération et rechargement des bibliothèques.
- Le modèle Qwen quantifié **q4f16** est utilisé lorsque le GPU prend en charge `shader-f16`; sinon le moteur sélectionne la variante **q4f32**, un peu plus gourmande en mémoire (environ 1,06 Go de VRAM recommandés au lieu de 0,94 Go). Les deux variantes sont dans le catalogue officiel WebLLM.
- Tests à répéter après publication : Chromium + WebGPU, connexion requise et 1er téléchargement, réponse textuelle réelle, génération d'annonce, filtres de recherche, scénario CDN inaccessible et navigateur incompatible.

Ce correctif **n'établit pas encore** la réussite d'une génération réelle sur le matériel utilisateur. Un environnement de test sans WebGPU GPU exploitable ne peut pas remplacer ce test.

## Contrainte budgétaire

**Aucun coût de génération par message, aucune consommation d'API IA payante.** Cela n'affirme pas que l'hébergement web, la bande passante CDN, les limites gratuites de Vercel, les appareils ou l'accès Internet resteront toujours gratuits et illimités. Aucun nouveau service payant, abonnement, quota limité d'agent/Work/Codex ou automatisation ChatGPT n'a été activé.

## Lot du 5 novembre — continuité entre les formulaires et l’assistant

À la suite des tests utilisateurs, l'assistant local reste **non validé sur une matrice réelle de navigateurs/GPU** : les tests automatisés isolent le code et les échanges simulés. Ce lot renforce les parcours de bout en bout sans déployer de fournisseur d'IA payant.

- **Particulier / F20** : quand l'utilisateur ouvre l'assistant depuis un brouillon en cours, le titre, la description, la commune, les métiers, le délai et le budget déjà saisis peuvent être utilisés pour répondre à sa question ou produire une proposition. Le bouton « Améliorer mon brouillon » préremplit une demande (sans l'envoyer à sa place). Les photos, identifiants et informations de compte ne sont jamais inclus dans ce contexte.
- **Professionnel / F25** : les derniers filtres de recherche validés peuvent servir de point de départ à la discussion et à la préparation d'une nouvelle recherche. Les critères restent soumis à confirmation explicite avant application ; le chatbot ne lit pas de chantiers privés et ne candidate pas.
- **Compatibilité** : en cas d'erreur **de mémoire GPU** lors du chargement de Qwen 3B, le moteur essaie automatiquement le Qwen 1,5B sur le **même appareil**, sans API facturée. L'utilisateur est informé et son mode léger est conservé pour les prochains messages. Ce repli n'est **pas** tenté lors d'une erreur réseau ou d'un accès CDN bloqué.
- **Conversations longues** : nombre de tours et longueur cumulée de contexte bornés avant génération pour limiter les dépassements de la fenêtre de contexte WebLLM. Les plus anciens messages peuvent être omis : l'IA ne dispose donc pas d'une mémoire complète de la conversation, ni des anciennes sessions.
- **Séparation des rôles** : les valeurs du brouillon d'un particulier ne peuvent pas être transmises comme contexte à l'espace professionnel, et réciproquement pour les filtres. Les champs inconnus, photos et identifiants sont exclus par liste blanche côté navigateur. Les messages ne sont jamais sauvegardés dans l'autorisation locale.

### Tests et preuves

Tests QA JS spécifiques : reconnaissance des erreurs GPU pertinentes, absence de repli lors de pannes réseau, sélection des variantes Qwen, limites de contexte, isolation des données brouillon/recherche et affichage du passage automatique au mode léger. Tests existants Python/JS doivent rester verts. Un navigateur avec GPU réel reste nécessaire pour valider taille de téléchargement, temps de réponse, qualité des messages générés et limites mémoire sur mobile.

### Restant au cahier des charges

F20 et F25 restent **partiellement réalisés**, sans nouvelle acceptation complète : une IA locale 3B ne garantit ni compréhension parfaite ni recommandation de métier fiable. À vérifier : essais réels sur Android/iPhone/PC, conformité accessibilité clavier/lecteur d'écran, extraction d'annonce cohérente sur plusieurs métiers, recherche sur un profil pro à zones multiples. Aucune publication ou candidature automatique.

