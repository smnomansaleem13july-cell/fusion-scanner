// Simple in-memory TTL cache shared across requests (per server instance).
// Yehi cache rate-limit problem fix karta hai: server ek baar fetch karta hai,
// saare users ko cached data milta hai.

const store = new Map();

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expires: Date.now() + ttlMs });
  // light cleanup so memory bloat na ho
  if (store.size > 3000) {
    const now = Date.now();
    for (const [k, v] of store) {
      if (now > v.expires) store.delete(k);
    }
  }
  return value;
}

// In-flight request dedupe: agar 5 users same time pe same data maangte hain,
// sirf 1 upstream request jaati hai.
const inflight = new Map();

export async function cachedFetch(key, ttlMs, fn) {
  const hit = cacheGet(key);
  if (hit !== null) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const value = await fn();
      cacheSet(key, value, ttlMs);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}
