const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isBase64Url(value, min = 16, max = 128) {
  return typeof value === 'string' && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (!isBase64Url(entry.key, 32, 128)) return false;
  if (!Number.isInteger(entry.version) || entry.version < 1) return false;
  if (!isFiniteNumber(entry.updatedAt) || entry.updatedAt < 0) return false;
  if (typeof entry.deleted !== 'boolean') return false;
  if (!isBase64Url(entry.iv, 12, 64)) return false;
  if (!isBase64Url(entry.ciphertext, 1, 35_000_000)) return false;
  return true;
}

function pickNewer(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.version !== b.version) return a.version > b.version ? a : b;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if (a.deleted !== b.deleted) return a.deleted ? a : b;
  return a;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function vaultPrefix(vaultToken) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(vaultToken));
  return `v1:${bytesToHex(new Uint8Array(digest))}:entry:`;
}

async function listAllEntries(kv, prefix) {
  const entries = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor, limit: 1000 });
    const values = await Promise.all(
      page.keys.map(async ({ name }) => {
        try {
          return await kv.get(name, { type: 'json', cacheTtl: 60 });
        } catch {
          return null;
        }
      })
    );
    for (const value of values) {
      if (isValidEntry(value)) entries.push(value);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return entries;
}

async function handleSync(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.MEMOMEMO_KV) return json({ error: 'MEMOMEMO_KV binding is missing' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const vaultToken = body?.vaultToken;
  if (!isBase64Url(vaultToken, 32, 128)) {
    return json({ error: 'Invalid vault token' }, 401);
  }

  const incoming = Array.isArray(body?.entries) ? body.entries : [];
  if (incoming.length > 1000 || !incoming.every(isValidEntry)) {
    return json({ error: 'Invalid sync entries' }, 400);
  }

  const prefix = await vaultPrefix(vaultToken);
  for (const entry of incoming) {
    const storageKey = prefix + entry.key;
    let existing = null;
    try {
      existing = await env.MEMOMEMO_KV.get(storageKey, { type: 'json' });
    } catch {
      existing = null;
    }
    const winner = pickNewer(existing, entry);
    if (winner === entry) {
      await env.MEMOMEMO_KV.put(storageKey, JSON.stringify(entry));
    }
  }

  const entries = await listAllEntries(env.MEMOMEMO_KV, prefix);
  return json({ success: true, entries, serverTime: Date.now() });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({ ok: true, storage: Boolean(env.MEMOMEMO_KV) });
    }

    if (url.pathname === '/api/sync') {
      return handleSync(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
