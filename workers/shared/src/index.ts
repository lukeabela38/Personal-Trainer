export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ── KV Helpers ────────────────────────────────────────────────────────

export async function kvGet<T>(ns: KVNamespace, key: string): Promise<T | null> {
  const val = await ns.get(key, "text");
  if (val === null) return null;
  return JSON.parse(val) as T;
}

export async function kvSet<T>(
  ns: KVNamespace,
  key: string,
  value: T,
  expirationTtl?: number,
): Promise<void> {
  const opts = expirationTtl ? { expirationTtl } : undefined;
  await ns.put(key, JSON.stringify(value), opts);
}

export async function kvDelete(ns: KVNamespace, key: string): Promise<void> {
  await ns.delete(key);
}

// ── Cache-aside pattern ───────────────────────────────────────────────
// Check KV first; if miss, call fetchFn, store result, return.

export async function kvCacheGet<T>(
  ns: KVNamespace,
  key: string,
): Promise<T | null> {
  return kvGet<T>(ns, key);
}

export async function kvCacheSet<T>(
  ns: KVNamespace,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  await kvSet(ns, key, value, ttlSeconds);
}
