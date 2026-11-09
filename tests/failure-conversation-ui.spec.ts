import { test, expect } from '@playwright/test';
import { generationFixture } from './helpers/generation.ts';
import { adviceReply, adviceRun } from './helpers/failure-advice.ts';

test('Castellano preference persists, conversation retains follow-up and terminal chat requests stop', async ({
  page,
}) => {
  const prompts: { language: string; history: unknown[] }[] = [];
  const p = generationFixture({
    async run(request) {
      prompts.push(JSON.parse(request.prompt));
      request.onEvent({
        kind: 'message',
        text: 'Synthetic diagnostic provider fixture; no live AI',
      });
      return { output: adviceReply, model: 'fixture-model', threadId: 'fixture-only', usage: null };
    },
  });
  const run = adviceRun(p);
  const base = await p.app.listen({ host: '127.0.0.1', port: 0 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let conversationRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/discussion')) conversationRequests++;
  });
  try {
    await page.goto(base + '/#launch=' + p.launchToken);
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByLabel('Default interface language', { exact: true }).selectOption('es');
    await page.getByRole('button', { name: 'Save environment', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(
      page.getByRole('heading', { name: 'Fuentes de contexto', exact: true }),
    ).toBeVisible();
    expect(p.store.settings().language).toBe('es');
    await page.getByRole('button', { name: 'Ejecuciones', exact: true }).click();
    await page.getByRole('button', { name: 'Inspeccionar ↗', exact: true }).click();
    const conversation = page.getByRole('region', {
      name: 'Conversación con IA sobre el fallo',
      exact: true,
    });
    const question = conversation.getByLabel('Pregunta sobre este fallo', { exact: true });
    await question.fill('El localizador parece incorrecto. ¿Qué opciones hay?');
    await conversation.getByRole('button', { name: 'Enviar a la IA', exact: true }).click();
    await expect(conversation.getByText(adviceReply.summary, { exact: true })).toBeVisible();
    await question.fill('¿Qué evidencia falta antes de cambiarlo?');
    await conversation.getByRole('button', { name: 'Enviar a la IA', exact: true }).click();
    await expect(conversation.getByText(adviceReply.summary, { exact: true })).toHaveCount(2);
    expect(prompts).toHaveLength(2);
    expect(prompts[1].history).toHaveLength(1);
    expect(prompts.every((p) => p.language === 'es')).toBe(true);
    await conversation.screenshot({ path: 'test-results/failure-conversation-es.png' });
    await page.clock.install();
    const before = conversationRequests;
    await page.clock.fastForward(6000);
    await page.evaluate(async () => {
      await fetch('/api/state', {
        headers: { 'X-QA-Session': sessionStorage.getItem('qa-session-proof')! },
      });
    });
    expect(conversationRequests).toBe(before);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await page.getByRole('button', { name: 'Ejecuciones', exact: true }).click();
    await page.getByRole('button', { name: 'Inspeccionar ↗', exact: true }).click();
    await expect(
      conversation.getByText('¿Qué evidencia falta antes de cambiarlo?', { exact: true }),
    ).toBeVisible();
    expect(p.store.get('runs', run.id)?.status).toBe('FAILED');
    expect(p.store.list('runs')).toHaveLength(1);
    expect(p.generation.repository.list('changes')).toHaveLength(0);
    await page.getByRole('button', { name: 'Espacio de trabajo', exact: true }).click();
    await page.getByLabel('Idioma por defecto de la interfaz', { exact: true }).selectOption('en');
    await page.getByRole('button', { name: 'Guardar preferencias', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(errors).toEqual([]);
  } finally {
    await p.app.close();
  }
});
