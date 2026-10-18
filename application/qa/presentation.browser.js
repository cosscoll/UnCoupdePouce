// Run with the Playwright MCP browser_run_code_unsafe tool (filename argument).
// Requires presentation.py on 127.0.0.1:8876; uses only synthetic demo accounts.
async (page) => {
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const title = 'Recette plomberie ' + Date.now();
  const message = 'Bonjour, précisons ce projet fictif de présentation.';
  const checks = [];
  const assert = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  async function role(name, heading) {
    await page.getByRole('button', {name, exact:true}).click();
    await page.getByRole('heading', {name:heading, exact:true}).waitFor();
  }
  async function responsive(screen) {
    for (const width of [320, 375, 390, 768, 1440]) {
      await page.setViewportSize({width, height:900});
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), screen + ' sans débordement à ' + width + ' px');
    }
  }
  try {
    await page.goto('http://127.0.0.1:8876/');
    await role('Espace demandeur', 'Vos projets, en bonne voie.');
    await page.getByRole('button', {name:'+ Décrire mon projet', exact:true}).click();
    await page.locator('.wizard [name=title]').fill(title);
    await page.locator('.wizard [name=description]').fill('Rénover la plomberie d’une pièce fictive et préciser les équipements à remplacer.');
    await page.locator('.category-browser details').filter({has:page.locator('input[value=plomberie]')}).locator('summary').click();
    await page.locator('input[value=plomberie]').check();
    await page.getByRole('button', {name:'Continuer →', exact:true}).click();
    await page.getByRole('heading', {name:'Parlez-nous de votre projet.', exact:true}).waitFor();
    await page.locator('[name=town]').fill('Toulouse');
    await page.locator('[name=timing]').selectOption('quarter');
    await page.getByRole('button', {name:'Continuer →', exact:true}).click();
    await page.getByRole('heading', {name:'Tout est prêt pour publier ?', exact:true}).waitFor();
    assert((await page.locator('.review').innerText()).includes('Dans les trois mois'), 'Délai présent dans le récapitulatif');
    await page.locator('[name=confirmed]').check();
    await page.getByRole('button', {name:'Publier ma demande →', exact:true}).click();
    await page.locator('#alert').filter({hasText:'publiée'}).waitFor();
    await page.getByLabel('Rechercher un projet', {exact:true}).fill(title);
    assert(await page.locator('.project-card').count() === 1, 'Publication retrouvée par recherche');
    await page.getByRole('button', {name:'Réinitialiser', exact:true}).click();
    await responsive('Demandeur');
    await role('Espace artisan', 'Les projets qui vous correspondent.');
    await page.getByLabel('Rechercher un projet', {exact:true}).fill(title);
    await page.locator('.project-card').filter({hasText:title}).getByRole('button',{name:'Voir le projet →',exact:true}).click();
    await page.getByRole('button', {name:'Proposer ma candidature', exact:true}).click();
    await page.getByRole('heading', {name:'Vos candidatures.', exact:true}).waitFor();
    assert(await page.locator('.application-card').filter({hasText:title}).count() === 1, 'Candidature persistée');
    await role('Espace demandeur', 'Vos projets, en bonne voie.');
    await page.getByLabel('Rechercher un projet', {exact:true}).fill(title);
    await page.locator('.project-card').filter({hasText:title}).getByRole('button').click();
    await page.getByRole('button', {name:'Choisir ce professionnel', exact:true}).click();
    await page.getByRole('button', {name:'Confirmer', exact:true}).click();
    await page.getByRole('heading', {name:'Vos projets, en bonne voie.', exact:true}).waitFor();
    await page.locator('.project-card').filter({hasText:title}).getByRole('button').click();
    await page.getByRole('button', {name:'Ouvrir la conversation', exact:true}).click();
    await page.locator('.chat textarea').fill(message);
    await page.getByRole('button', {name:'Envoyer le message →', exact:true}).click();
    await page.locator('.bubble').filter({hasText:message}).waitFor();
    await responsive('Messagerie');
    await role('Espace artisan', 'Les projets qui vous correspondent.');
    await page.getByRole('button', {name:'Mes candidatures', exact:true}).click();
    await page.getByRole('heading', {name:'Vos candidatures.', exact:true}).waitFor();
    await page.locator('.application-card').filter({hasText:title}).getByRole('button', {name:'Ouvrir mes messages', exact:true}).click();
    await page.locator('.bubble').filter({hasText:message}).waitFor();
    assert((await page.locator('.conversation-list button[aria-pressed=true]').innerText()).includes(title), 'Conversation ciblée et message reçu');
    await page.locator('.chat textarea').fill('Votre demande fictive est bien reçue.');
    await page.getByRole('button', {name:'Envoyer le message →', exact:true}).click();
    await page.locator('.bubble').filter({hasText:'bien reçue'}).waitFor();
    checks.push('Réponse professionnelle persistée');
    await page.getByRole('button', {name:'Trouver des projets', exact:true}).click();
    await page.getByRole('heading', {name:'Les projets qui vous correspondent.', exact:true}).waitFor();
    await responsive('Artisan');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert(await page.locator('.view-stage').evaluate(node => getComputedStyle(node).animationName === 'none'), 'Réduction des animations respectée');
    await page.emulateMedia({reducedMotion:'no-preference'});
    assert(errors.length === 0, 'Aucune exception JavaScript');
    return {status:'PASS', checks, project:title};
  } finally {
    page.off('pageerror', onError);
  }
}
