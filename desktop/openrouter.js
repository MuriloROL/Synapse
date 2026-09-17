'use strict';

/**
 * Cliente mínimo do OpenRouter para o chat do projeto.
 *
 * A chave só vem do ambiente do processo; ela nunca passa pela ponte do
 * Electron, pelo renderer ou pelo banco. O provedor responde ao contexto que
 * o Synapse monta, mas não recebe permissões para arquivos ou comandos.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function hasOpenRouterKey(env = process.env) {
  return Boolean(String(env.OPENROUTER_API_KEY || '').trim());
}

function buildOpenRouterMessages({ systemPrompt, history = [], message }) {
  const messages = [{ role: 'system', content: String(systemPrompt || '') }];
  for (const item of history) {
    if (!item?.text || !['user', 'ai'].includes(item.role) || item.error) continue;
    messages.push({ role: item.role === 'ai' ? 'assistant' : 'user', content: item.text });
  }
  messages.push({ role: 'user', content: String(message || '') });
  return messages;
}

function errorMessage(response) {
  if (response.status === 401 || response.status === 403) return 'A chave do OpenRouter foi recusada. Confira OPENROUTER_API_KEY.';
  if (response.status === 429) return 'O OpenRouter atingiu o limite de uso. Tente de novo em alguns instantes.';
  return `O OpenRouter não respondeu (HTTP ${response.status}).`;
}

async function sendOpenRouterChat({ apiKey, model, messages, tools, fetchImpl = fetch, signal }) {
  if (!String(apiKey || '').trim()) {
    return { ok: false, message: 'Falta OPENROUTER_API_KEY no arquivo .synapse-env.' };
  }

  let response;
  try {
    response = await fetchImpl(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-OpenRouter-Title': 'Synapse',
      },
      body: JSON.stringify({ model, messages, ...(tools ? { tools, parallel_tool_calls: false } : {}), stream: false }),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, canceled: true, message: 'Interrompido.' };
    return { ok: false, message: 'Não foi possível acessar o OpenRouter. Confira sua conexão e tente de novo.' };
  }

  let body = null;
  try { body = await response.json(); } catch { /* a mensagem abaixo cobre resposta inválida */ }
  if (!response.ok) return { ok: false, message: errorMessage(response) };

  const assistant = body?.choices?.[0]?.message;
  const meta = { model: String(body?.model || model), usage: body?.usage || null };
  const toolCalls = Array.isArray(assistant?.tool_calls) ? assistant.tool_calls : [];
  if (toolCalls.length) return { ok: true, toolCalls, assistant, ...meta };
  const text = assistant?.content;
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, message: 'O OpenRouter respondeu sem texto. Tente outro modelo.' };
  }
  return { ok: true, text: text.trim(), ...meta };
}

function parseJsonResponse(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(raw); } catch { return null; }
}

module.exports = {
  OPENROUTER_URL, buildOpenRouterMessages, hasOpenRouterKey, parseJsonResponse, sendOpenRouterChat,
};
