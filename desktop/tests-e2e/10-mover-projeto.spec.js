'use strict';

/**
 * Mover uma reunião para um projeto — e trazer de volta.
 *
 * O que só este teste alcança: a pasta no disco mudar de lugar e os vínculos
 * acompanharem. O `relocateMeeting` tem teste de unidade; aqui o caminho é o do
 * usuário — abrir o painel, escolher o projeto e ver a reunião aparecer lá.
 */

const fs = require('node:fs');
const path = require('node:path');

const { test, expect, waitForHome } = require('./fixtures');

const NOME = 'Reunião para mover';
const PROJETO = 'Projeto Mover';

function semear(outputDir) {
  const dir = path.join(outputDir, NOME);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${NOME}.md`), `# ${NOME}\n\n**Idioma:** pt\n\n---\n\nOi.\n`, 'utf-8');
  fs.writeFileSync(path.join(dir, 'meeting.json'), JSON.stringify({
    name: NOME,
    recorded_at_local: '2026-09-16 14:30:00',
    duration_seconds: 60,
    segments: 1,
    language: 'pt',
  }), 'utf-8');
}

async function abrirReuniaoPeloProjeto(page) {
  await page.locator('#nav-projects-all').click();
  await page.locator('#projects-grid .proj-card', { hasText: PROJETO }).first().click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'project');
  await page.locator('#project-tabs .tab[data-tab="meetings"]').click();
  const tile = page.locator('#project-meetings .tile', { hasText: NOME });
  await expect(tile).toHaveCount(1);
  await tile.click();
  await expect(page.locator('#drawer-text')).toBeVisible();
}

test.describe('mover reunião para um projeto', () => {
  test('leva a pasta para a raiz do projeto e devolve para sem projeto', async ({
    page, workspace, errors,
  }) => {
    semear(workspace.outputDir);
    await waitForHome(page);

    const workdir = path.join(workspace.root, 'trabalho-projeto');
    fs.mkdirSync(workdir, { recursive: true });
    const criado = await page.evaluate(
      (dir) => window.api.saveProject({ name: 'Projeto Mover', workdir: dir }),
      workdir,
    );
    expect(criado.ok).toBe(true);

    // Abre a reunião pela biblioteca e move para o projeto.
    await page.locator('#nav-library').click();
    await page.locator('#lib-search').fill('para mover');
    const cartao = page.locator('#lib-list .tile', { hasText: NOME });
    await expect(cartao).toHaveCount(1);
    await cartao.click();
    await expect(page.locator('#drawer-text')).toBeVisible();

    await page.locator('#drawer-move').click();
    const modal = page.locator('#modal-move');
    await expect(modal).toBeVisible();
    await modal.locator('label', { hasText: PROJETO }).locator('input[type="radio"]').check();
    await modal.locator('button[type="submit"]').click();
    await expect(modal).toBeHidden();

    // A pasta foi para a raiz do projeto; saiu da pasta de saída geral.
    const destino = path.join(workdir, 'synapse', NOME);
    expect(fs.existsSync(destino)).toBe(true);
    expect(fs.existsSync(path.join(workspace.outputDir, NOME))).toBe(false);

    // A reunião aparece dentro do projeto.
    await abrirReuniaoPeloProjeto(page);

    // E volta para "Sem projeto".
    await page.locator('#drawer-move').click();
    await expect(modal).toBeVisible();
    await modal.locator('label', { hasText: 'Sem projeto' }).locator('input[type="radio"]').check();
    await modal.locator('button[type="submit"]').click();
    await expect(modal).toBeHidden();

    expect(fs.existsSync(path.join(workspace.outputDir, NOME))).toBe(true);
    expect(fs.existsSync(destino)).toBe(false);

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
