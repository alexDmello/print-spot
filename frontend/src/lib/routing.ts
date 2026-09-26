/**
 * PrintSpot URL & QR Routing Architecture Utility
 * 
 * Provides unified, deterministic URL resolution across all portals:
 * 1. Customer Order Client: /counter/:slug or /?shop=:slug or :slug.domain
 * 2. Shopkeeper Counter Station: /shop or shop.domain
 * 3. Super Admin Command Center: /admin or admin.domain
 */

export type RoutingScheme = 'path' | 'subdomain' | 'query';

export interface PlatformRoutingConfig {
  scheme: RoutingScheme;
  baseUrl: string;
  domain: string;
}

export const DEFAULT_ROUTING_CONFIG: PlatformRoutingConfig = {
  scheme: 'path',
  baseUrl: '',
  domain: 'mellod.in',
};

/**
 * Normalizes an origin to the root application base (strips 'shop.' or 'admin.' subdomains).
 */
export function cleanRootOrigin(customBaseUrl?: string): string {
  if (customBaseUrl && customBaseUrl.trim()) {
    return customBaseUrl.trim().replace(/\/+$/, '');
  }

  if (typeof window === 'undefined') {
    return 'https://mellod.in';
  }

  const { protocol, host, hostname, port } = window.location;
  const lowerHost = host.toLowerCase();

  // If running on shop.localhost:3000 or admin.localhost:3000
  if (lowerHost.startsWith('shop.localhost') || lowerHost.startsWith('admin.localhost')) {
    return `${protocol}//localhost${port ? `:${port}` : ''}`;
  }

  // If running on shop.mellod.in or admin.mellod.in
  if (lowerHost === 'shop.mellod.in' || lowerHost === 'admin.mellod.in') {
    return `${protocol}//mellod.in`;
  }

  // If hostname ends with .mellod.in and starts with reserved subdomains
  if (hostname.endsWith('.mellod.in')) {
    const parts = hostname.split('.');
    if (parts.length > 2 && ['shop', 'admin', 'api', 'app', 'www'].includes(parts[0])) {
      return `${protocol}//mellod.in`;
    }
  }

  return window.location.origin.replace(/\/+$/, '');
}

/**
 * Builds the exact Customer Ordering Gateway URL for a given shop.
 * Guarantees that customers land directly on the document upload & print queue page,
 * NEVER on the shopkeeper dashboard or login page.
 */
export function buildCustomerUrl(
  shop: { id: string; slug?: string | null },
  scheme: RoutingScheme = 'path',
  customBaseUrl?: string,
  domain: string = 'mellod.in'
): string {
  const identifier = (shop.slug && shop.slug.trim()) ? shop.slug.trim() : shop.id;
  const root = cleanRootOrigin(customBaseUrl);

  switch (scheme) {
    case 'subdomain': {
      // If localhost or custom IP, fallback to path if subdomain won't resolve on external devices
      if (root.includes('localhost') || root.includes('127.0.0.1')) {
        const port = typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : ':3000';
        return `http://${identifier}.localhost${port}`;
      }
      return `https://${identifier}.${domain.replace(/^\.+/, '')}`;
    }
    case 'query': {
      return `${root}/?shop=${encodeURIComponent(identifier)}`;
    }
    case 'path':
    default: {
      return `${root}/counter/${encodeURIComponent(identifier)}`;
    }
  }
}

/**
 * Builds the Shopkeeper Counter Station URL (/shop).
 */
export function buildShopkeeperUrl(customBaseUrl?: string): string {
  const root = cleanRootOrigin(customBaseUrl);
  return `${root}/shop`;
}

/**
 * Builds the Super Admin Command Center URL (/admin).
 */
export function buildAdminUrl(customBaseUrl?: string): string {
  const root = cleanRootOrigin(customBaseUrl);
  return `${root}/admin`;
}
