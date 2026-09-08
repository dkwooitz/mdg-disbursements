/**
 * MDG Disbursements Worker
 *
 * Serves the site's static files and, on /api/ai, reads an uploaded document with
 * Gemini on the app's behalf. The app used to call a Supabase edge function for this;
 * that project no longer exists, so the proxy lives here instead — one less account in
 * the chain, and the API key stays on the server side.
 *
 * The key is a Worker secret, never a file in this repo:
 *     npx wrangler secret put GEMINI_API_KEY   (GEMINI_API_KEYS is accepted too)
 */

const AI_PATH = '/api/ai';
const KEY_PATH = '/api/key';              // says whether a key is needed, and checks one
const MAX_BODY_BYTES = 8 * 1024 * 1024;   // an inline upload larger than this is refused
const DEFAULT_MODEL = 'gemini-2.5-flash'; // override with the GEMINI_MODEL var
const UPSTREAM = 'https://generativelanguage.googleapis.com/v1beta/models/';

/**
 * Anyone who knows the address can open this app: it is on the open internet until
 * Cloudflare Access is put in front of it. Two things behind that address are worth more
 * than the rest and are gated on a shared key the staff are given:
 *
 *   /api/ai     spends the company's Gemini allowance on whoever asks
 *   the policy  is an internal Master Drilling document, not a public one
 *
 * The key is a Worker secret:  npx wrangler secret put MDG_APP_KEY
 * With no secret set, nothing is gated and the app behaves exactly as it did before, so a
 * missing or forgotten secret cannot lock staff out of an app that is already in use.
 */
const KEY_HEADER = 'X-MDG-Key';
const GATED_FILES = [
  '/SPO-MDG-HRM-0020-E_Disbursement_Policy.pdf',
  '/disbursement-policy.pdf'
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === KEY_PATH) return handleKeyCheck(request, env);
    if (url.pathname === AI_PATH) return handleAI(request, env, url);
    if (GATED_FILES.includes(url.pathname) && !hasKey(request, env)) {
      return json({ error: 'This document is for Master Drilling staff. Enter the app key under Settings to download it.' }, 401);
    }
    return env.ASSETS.fetch(request); // everything else is the site itself
  }
};

function appKey(env) { return String(env.MDG_APP_KEY || '').trim(); }

// Constant-time-ish comparison: a length check plus a full pass over the characters, so a
// wrong key takes the same time to reject whichever character is wrong.
function sameKey(given, want) {
  if (given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

function hasKey(request, env) {
  const want = appKey(env);
  if (!want) return true;   // nothing configured: nothing gated
  return sameKey(String(request.headers.get(KEY_HEADER) || '').trim(), want);
}

// Lets the app find out whether a key is needed, and check one the user has just typed,
// without spending a Gemini call to do it.
async function handleKeyCheck(request, env) {
  const want = appKey(env);
  if (!want) return json({ required: false, ok: true });
  return json({ required: true, ok: hasKey(request, env) }, hasKey(request, env) ? 200 : 401);
}

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
  // The origin check above is a courtesy lock that any caller can forge. This one cannot be.
  if (!hasKey(request, env)) {
    return json({ error: 'The reader needs the app key. Enter it under Settings.', keyRequired: true }, 401);
  }

  // GEMINI_API_KEYS is accepted too: the secret was created under that name, and a plural
  // "S" is not worth a broken reader.
  const apiKey = String(env.GEMINI_API_KEY || env.GEMINI_API_KEYS || '').trim();
  if (!apiKey) {
    return json({ error: 'The reader is not configured yet: no GEMINI_API_KEY secret is set on this Worker.' }, 503);
  }
  // A Gemini key is around 39 characters. Anything shorter did not paste properly, and
  // Google answers that with an empty 400 that explains nothing.
  if (apiKey.length < 20) {
    return json({ error: 'The stored GEMINI_API_KEY looks incomplete, so the reading service rejects it. Set it again with: npx wrangler secret put GEMINI_API_KEY' }, 503);
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
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8192 }   // a statement can run to many lines
      })
    });
  } catch (e) {
    return json({ error: 'Could not reach the reading service.' }, 502);
  }

  const raw = await res.text();
  let payload = null;
  try { payload = JSON.parse(raw); } catch (e) { /* upstream did not answer with JSON */ }

  if (!res.ok) {
    // Pass the upstream reason through — a wrong model name or a rejected key should be
    // diagnosable from the browser rather than showing up as a blank failure. Fall back to
    // the raw body, since a non-JSON answer is exactly the case worth seeing.
    const reason = (payload && payload.error && payload.error.message)
      || (raw ? raw.slice(0, 400) : 'upstream returned ' + res.status);
    return json({ error: reason, status: res.status }, 502);
  }

  const parts = payload && payload.candidates && payload.candidates[0]
    && payload.candidates[0].content && payload.candidates[0].content.parts;
  const result = Array.isArray(parts) ? parts.map(p => p.text || '').join('').trim() : '';

  return json({ result });
}
