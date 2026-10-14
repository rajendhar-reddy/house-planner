/**
 * util.js - Small shared helpers.
 */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape user-provided text before placing it inside innerHTML templates
 * (both element content and quoted attribute values).
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

/**
 * Copy every method of the given source classes onto `target.prototype`.
 * Lets one large class be split across several files without changing any
 * method body (`this` still refers to the app instance).
 */
export function mixin(target, ...sources) {
    for (const Source of sources) {
        for (const name of Object.getOwnPropertyNames(Source.prototype)) {
            if (name === 'constructor') continue;
            if (Object.prototype.hasOwnProperty.call(target.prototype, name)) {
                throw new Error(`mixin: "${name}" is defined twice`);
            }
            Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(Source.prototype, name));
        }
    }
}
