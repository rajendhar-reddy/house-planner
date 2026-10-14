/**
 * ids.js - Shared, collision-proof ID generator.
 *
 * Every entity ID looks like `<prefix>_<number>` (wall_12, op_3, ...).
 * Counters live here (one per prefix) instead of in each module, so that
 * IDs restored from a saved project can be "reserved": the counter is moved
 * past the highest restored number and a new object can never reuse an ID.
 */

const counters = Object.create(null);

/** Create a fresh ID for the given prefix, e.g. nextId('wall') -> 'wall_7'. */
export function nextId(prefix) {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return `${prefix}_${counters[prefix]}`;
}

/** Tell the generator that `id` is in use (call for every restored object). */
export function reserveId(id) {
    if (typeof id !== 'string') return;
    const m = /^(.*)_(\d+)$/.exec(id);
    if (!m) return;
    const n = parseInt(m[2], 10);
    if (Number.isFinite(n) && n > (counters[m[1]] || 0)) counters[m[1]] = n;
}
