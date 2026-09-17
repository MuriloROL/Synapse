'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  OPENROUTER_URL, buildOpenRouterMessages, hasOpenRouterKey, parseJsonResponse, sendOpenRouterChat,
} = require('../openrouter');

test('OpenRouter: a chave vem apenas do ambiente e as mensagens preservam o histórico útil', () => {
  assert.equal(hasOpenRouterKey({}), false);
  assert.equal(hasOpenRouterKey({ OPENROUTER_API_KEY: ' chave ' }), true);
  assert.deepEqual(buildOpenRouterMessages({
    systemPrompt: 'Contexto', message: 'Pergunta',
    history: [
      { role: 'user', text: 'Antes' }, { role: 'ai', text: 'Resposta' },
      { role: 'ai', text: 'falhou', error: true },
    ],
  }), [
    { role: 'system', content: 'Contexto' },
    { role: 'user', content: 'Antes' },
    { role: 'assistant', content: 'Resposta' },
    { role: 'user', content: 'Pergunta' },
  ]);
});

test('OpenRouter: envia contrato compatível e devolve o texto', async () => {
  let request;
  const result = await sendOpenRouterChat({
    apiKey: 'secret', model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'oi' }],
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, json: async () => ({ choices: [{ message: { content: ' Olá! ' } }] }) };
    },
  });
  assert.equal(request.url, OPENROUTER_URL);
  assert.equal(request.init.headers.Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(request.init.body), {
    model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'oi' }], stream: false,
  });
  assert.deepEqual(result, { ok: true, text: 'Olá!', model: 'openai/gpt-4o-mini', usage: null });
});

test('OpenRouter: traduz erros sem vazar a chave', async () => {
  const result = await sendOpenRouterChat({
    apiKey: 'secret', model: 'x', messages: [],
    fetchImpl: async () => ({ status: 401, ok: false, json: async () => ({}) }),
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /chave do OpenRouter/i);
  assert.doesNotMatch(result.message, /secret/);
});

test('OpenRouter: aceita JSON puro ou cercado por markdown na análise', () => {
  assert.deepEqual(parseJsonResponse('{"title":"Weekly"}'), { title: 'Weekly' });
  assert.deepEqual(parseJsonResponse('```json\n{"tasks":[]}\n```'), { tasks: [] });
  assert.equal(parseJsonResponse('não é JSON'), null);
});
