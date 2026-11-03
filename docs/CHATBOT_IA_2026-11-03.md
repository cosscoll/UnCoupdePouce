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

## Contrainte budgétaire

**Aucun coût de génération par message, aucune consommation d'API IA payante.** Cela n'affirme pas que l'hébergement web, la bande passante CDN, les limites gratuites de Vercel, les appareils ou l'accès Internet resteront toujours gratuits et illimités. Aucun nouveau service payant, abonnement, quota limité d'agent/Work/Codex ou automatisation ChatGPT n'a été activé.
