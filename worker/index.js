/**
 * MDG Disbursements Worker
 *
 * Serves the site's static files and, on /api/ai, reads an uploaded document with
 * Gemini on the app's behalf. The app used to call a Supabase edge function for this;
 * that project no longer exists, so the proxy lives here instead — one less account in
 * the chain, and the API key stays on the server side.
 *
 * The key is a Worker secret, never a file in this repo:
 *     npx wrangler secret put GEMINI_API_KEY
 */

const AI_PATH = '/api/ai';
const MAX_BODY_BYTES = 8 * 1024 * 1024;   // an inline upload larger than this is refused
const DEFAULT_MODEL = 'gemini-2.5-flash'; // override with the GEMINI_MODEL var
const UPSTREAM = 'https://generativelanguage.googleapis.com/v1beta/models/';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === AI_PATH) return handleAI(request, env, url);
    return env.ASSETS.fetch(request); // everything else is the site itself
  }
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/**
 * The endpoint spends the company's Gemini quota, so it only answers calls made by the
 * app itself. This is a courtesy lock, not authentication — a determined caller can set
 * any header. Real protection comes with Cloudflare Access in front of the app.
 */
function fromThisApp(request, url) {
  const origin = request.headers.get('Origin');
  if (origin) return origin === url.origin;
  const referer = request.headers.get('Referer');
  if (referer) { try { return new URL(referer).origin === url.origin; } catch (e) { return false; } }
  return false;
}

async function handleAI(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!fromThisApp(request, url)) return json({ error: 'This endpoint only answers the app itself.' }, 403);

  if (!env.GEMINI_API_KEY) {
    return json({ error: 'The reader is not configured yet: GEMINI_API_KEY has not been set on this Worker.' }, 503);
  }

  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) return json({ error: 'That file is too large to read.' }, 413);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Expected a JSON body.' }, 400); }

  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const base64Data = typeof body.base64Data === 'string' ? body.base64Data : '';
  const mimeType = typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : 'image/jpeg';
  if (!prompt) return json({ error: 'No prompt was given.' }, 400);
  if (!base64Data) return json({ error: 'No file was given.' }, 400);
  if (base64Data.length > MAX_BODY_BYTES) return json({ error: 'That file is too large to read.' }, 413);

  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const upstream = UPSTREAM + encodeURIComponent(model) + ':generateContent';

  let res;
  try {
    res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 }
      })
    });
  } catch (e) {
    return json({ error: 'Could not reach the reading service.' }, 502);
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    // Pass the upstream reason through — a wrong model name or a rejected key should be
    // diagnosable from the browser rather than showing up as a blank failure.
    const reason = (payload && payload.error && payload.error.message) || ('upstream returned ' + res.status);
    return json({ error: reason }, 502);
  }

  const parts = payload && payload.candidates && payload.candidates[0]
    && payload.candidates[0].content && payload.candidates[0].content.parts;
  const result = Array.isArray(parts) ? parts.map(p => p.text || '').join('').trim() : '';

  return json({ result });
}
