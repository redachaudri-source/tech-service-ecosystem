/**
 * Utility functions for Client Web Portal
 */

/**
 * Normaliza un número de teléfono al formato estándar de 9 dígitos (España)
 * Quita espacios, guiones, paréntesis y prefijo +34/34
 * @param {string} phone - Teléfono a normalizar
 * @returns {string} Teléfono normalizado (ej: "633489521")
 */
export function normalizePhone(phone) {
    if (!phone) return '';

    // Quitar todo excepto dígitos
    let clean = phone.replace(/\D/g, '');

    // Quitar prefijo 34 si tiene más de 9 dígitos
    if (clean.length > 9 && clean.startsWith('34')) {
        clean = clean.slice(2);
    }

    return clean;
}

/**
 * Valida que un teléfono español tenga 9 dígitos
 * @param {string} phone - Teléfono (puede estar sin normalizar)
 * @returns {boolean} true si es válido
 */
export function isValidSpanishPhone(phone) {
    const normalized = normalizePhone(phone);
    return normalized.length === 9 && /^[6789]/.test(normalized);
}

/**
 * Formatea un teléfono para mostrar: 633 489 521
 * @param {string} phone - Teléfono normalizado
 * @returns {string} Teléfono formateado
 */
export function formatPhoneDisplay(phone) {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 9) return phone;
    return `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6)}`;
}

/**
 * Debounce function para evitar llamadas excesivas
 * @param {Function} func - Función a ejecutar
 * @param {number} wait - Milisegundos de espera
 * @returns {Function} Función con debounce
 */
export function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
