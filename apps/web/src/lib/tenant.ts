// src/lib/tenant.ts
// Subdomain-based multi-tenant helpers
//
// Domain structure:
//   ROOT_DOMAIN = example.com
//   Main app    = sme.example.com  (NEXT_PUBLIC_APP_URL)
//   Company     = acme.example.com, acme.example.com, ...
//
// Dev:
//   ROOT_DOMAIN = localhost
//   Main app    = localhost:3000
//   Company     = acme.localhost:3000

const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'cdn', 'mail', 'static',
  'assets', 'media', 'status', 'auth', 'platform',
]);

function getRootDomain(): string {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost';
}

/** Hostname của main app (vd: "sme.example.com" hoặc "localhost") */
function getMainHostname(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return (appUrl.replace(/^https?:\/\//, '').split(':')[0]) ?? 'localhost';
}

/**
 * Extract company slug từ hostname.
 *
 *   "acme.example.com"  → "acme"
 *   "sme.example.com"   → null   (main app)
 *   "example.com"       → null   (root domain)
 *   "acme.localhost" → "acme" (dev)
 *   "localhost"      → null   (dev main)
 */
export function getSubdomain(hostname: string): string | null {
  const rootDomain = getRootDomain();
  const mainHostname = getMainHostname();
  const host = hostname.split(':')[0] ?? ''; // strip port

  // Exact match: main app hostname or root domain → no subdomain
  if (host === mainHostname || host === rootDomain) return null;

  if (host.endsWith(`.${rootDomain}`)) {
    const sub = host.slice(0, -(rootDomain.length + 1));
    if (!sub) return null;

    // Reserved: bao gồm subdomain của main app (vd: "sme")
    if (RESERVED_SUBDOMAINS.has(sub)) return null;
    if (mainHostname.endsWith(`.${rootDomain}`)) {
      const mainSub = mainHostname.slice(0, -(rootDomain.length + 1));
      if (sub === mainSub) return null; // "sme" → main app, không phải company
    }

    return sub;
  }

  return null;
}

/**
 * Build full URL cho một company subdomain.
 * "acme" → "https://acme.example.com"       (prod)
 *        → "http://acme.localhost:3000"   (dev)
 */
export function getTenantUrl(slug: string, path = ''): string {
  const rootDomain = getRootDomain();
  const isProd = process.env.NODE_ENV === 'production';
  const protocol = isProd ? 'https' : 'http';
  const port = isProd ? '' : ':3000';
  return `${protocol}://${slug}.${rootDomain}${port}${path}`;
}

/**
 * Main app URL.
 * → NEXT_PUBLIC_APP_URL hoặc http://localhost:3000
 */
export function getMainUrl(path = ''): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${path}`;
}
