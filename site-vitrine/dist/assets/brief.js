(function (root) {
  'use strict';
  const types = Object.freeze({
    peinture: {title: 'Rafraîchir les murs d’une pièce', trade: 'Peinture intérieure', checklist: ['Estimer la surface à peindre et préciser l’état des supports.', 'Préparer des photos de la pièce et des murs.', 'Décrire les couleurs et finitions envisagées.']},
    'salle-de-bain': {title: 'Rénover une salle de bain', trade: 'Rénovation de salle de bain · métiers à préciser', checklist: ['Lister les équipements à conserver ou à remplacer.', 'Relever les dimensions et préparer des photos de la pièce.', 'Préciser si l’agencement ou les arrivées d’eau doivent changer.']},
    menuiserie: {title: 'Créer un rangement sur mesure', trade: 'Menuiserie intérieure', checklist: ['Relever les dimensions de l’emplacement et les contraintes d’accès.', 'Décrire les objets à ranger et les usages souhaités.', 'Préparer des exemples de finitions ou de matériaux.']},
    electricite: {title: 'Repenser l’éclairage d’une pièce', trade: 'Électricité · éclairage intérieur', checklist: ['Décrire les usages de la pièce et les zones à éclairer.', 'Repérer les points lumineux et commandes existants sans intervenir sur l’installation.', 'Faire préciser la faisabilité et la sécurité par un professionnel qualifié.']}
  });
  const states = Object.freeze({idee: 'J’explore encore les possibilités', precis: 'J’ai une idée assez précise', defini: 'Le besoin est défini'});
  const timings = Object.freeze({flexible: 'Je suis flexible', 'trois-mois': 'Dans les trois prochains mois', 'six-mois': 'Dans les six prochains mois'});
  function own(object, key, fallback) { return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : object[fallback]; }
  function create(type, state, timing) {
    const spec = own(types, type, 'peinture');
    const checklist = Object.freeze(spec.checklist.slice());
    return Object.freeze({title:spec.title, trade:spec.trade, state:own(states,state,'idee'), timing:own(timings,timing,'flexible'), checklist});
  }
  function toText(brief) {
    return ['UN COUP DE POUCE — MON EXEMPLE DE BRIEF', 'Support de préparation personnel. Aucun projet publié.', '', brief.title, 'Métier à explorer : '+brief.trade, 'Maturité : '+brief.state, 'Horizon : '+brief.timing, '', 'À préciser avant un échange :', ...brief.checklist.map((line,i)=>(i+1)+'. '+line), '', 'Pensez également à préciser votre commune, vos contraintes d’accès et votre budget indicatif lors de votre échange avec un professionnel.', '', 'Ce support n’est ni un devis ni un diagnostic technique. Il a été produit localement avec des règles prédéfinies, sans IA.'].join('\n');
  }
  root.UCPBrief=Object.freeze({create,toText});
  if (typeof module !== 'undefined' && module.exports) module.exports=root.UCPBrief;
})(typeof window !== 'undefined' ? window : globalThis);
