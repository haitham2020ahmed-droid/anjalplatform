/**
 * 🧹 Bounded module-level caches (Update 42A). A cache in a long-running server must never grow without limit: keys that
 * contain a version or an epoch are never asked for again once it changes, so without a bound every change leaves its
 * old value in memory. `remember` keeps the newest `max` entries (least recently set first out).
 */
export function remember<K, V>(map: Map<K, V>, key: K, value: V, max: number): V {
  map.delete(key); // re-inserting moves the key to the newest end
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
  return value;
}
