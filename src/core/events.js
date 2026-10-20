/**
 * Minimal event emitter, so the core has no dependency on Phaser or the DOM.
 */
export function createEmitter() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();

  return {
    /**
     * @param {string} event
     * @param {Function} listener
     * @returns {() => void} unsubscribe
     */
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
      return () => listeners.get(event).delete(listener);
    },

    /**
     * @param {string} event
     * @param {unknown} payload
     */
    emit(event, payload) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
  };
}
