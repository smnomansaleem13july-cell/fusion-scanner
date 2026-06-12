'use client';

// Module-level store: page switch karne par bhi state zinda rehta hai
// (Next.js client navigation me JS context same rehta hai, sirf component unmount hota hai)

import { useSyncExternalStore, useCallback } from 'react';

const stores = new Map();

function ensure(key, initial) {
  if (!stores.has(key)) {
    stores.set(key, { state: { ...initial }, listeners: new Set() });
  }
  return stores.get(key);
}

export function getState(key) {
  const s = stores.get(key);
  return s ? s.state : null;
}

export function setState(key, patch) {
  const s = stores.get(key);
  if (!s) return;
  s.state = { ...s.state, ...(typeof patch === 'function' ? patch(s.state) : patch) };
  s.listeners.forEach((l) => l());
}

export function useScanStore(key, initial) {
  const s = ensure(key, initial);
  const subscribe = useCallback((cb) => {
    s.listeners.add(cb);
    return () => s.listeners.delete(cb);
  }, [s]);
  return useSyncExternalStore(subscribe, () => s.state, () => s.state);
}
