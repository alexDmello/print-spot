"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESERVED_SLUGS = void 0;
exports.sanitizeSlug = sanitizeSlug;
exports.allocateUniqueSlug = allocateUniqueSlug;
const db_1 = require("../db");
exports.RESERVED_SLUGS = new Set([
    'api',
    'admin',
    'superadmin',
    'dashboard',
    'auth',
    'login',
    'register',
    'shop',
    'kiosk',
    'billing',
    'root',
    'static',
    'assets',
    'printspot',
    'mellod',
    'status',
    'test',
    'demo',
    'support',
    'help',
    'terms',
    'privacy',
    'checkout',
    'payment',
]);
/**
 * Sanitizes an input string to a clean URL-friendly subdomain slug
 */
function sanitizeSlug(input) {
    return (input || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24);
}
/**
 * Smart Subdomain Allocator
 * Allocates a unique slug without throwing raw collision errors.
 * Provides smart suggestions if the desired name is already taken.
 */
async function allocateUniqueSlug(desiredName, preferredSlug) {
    let base = sanitizeSlug(preferredSlug || desiredName);
    if (!base || base.length < 2) {
        base = 'counter';
    }
    // Generate a pool of intelligent candidate slugs
    const candidates = [
        base,
        `${base}-2`,
        `${base}-3`,
        `${base}-hub`,
        `${base}-counter`,
        `${base}-prints`,
        `${base}-express`,
        `${base}-spot`,
        `${base}-4`,
        `${base}-5`,
    ];
    // Query DB for all slugs matching base or prefix
    const res = await (0, db_1.query)(`SELECT slug FROM shops WHERE slug = $1 OR slug LIKE $2`, [base, `${base}-%`]);
    const taken = new Set(res.rows.map((r) => r.slug.toLowerCase()));
    // Also include reserved slugs
    exports.RESERVED_SLUGS.forEach(s => taken.add(s));
    const availableCandidates = candidates.filter(c => !taken.has(c));
    if (!taken.has(base)) {
        // Exact match is available!
        return {
            slug: base,
            isOriginalAvailable: true,
            suggestions: availableCandidates.filter(c => c !== base).slice(0, 4),
        };
    }
    // Base is taken, pick first available candidate
    let primarySlug = availableCandidates[0];
    if (!primarySlug) {
        // Fallback if all candidates taken: append random 3-digit suffix
        primarySlug = `${base}-${Math.floor(100 + Math.random() * 900)}`;
    }
    const otherSuggestions = availableCandidates.filter(c => c !== primarySlug).slice(0, 4);
    return {
        slug: primarySlug,
        isOriginalAvailable: false,
        suggestions: otherSuggestions,
    };
}
