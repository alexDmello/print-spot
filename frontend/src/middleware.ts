import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * 1. /api routes
     * 2. /_next (Next.js internals, static files, images)
     * 3. Static files (.ico, .png, .jpg, .svg, .js, .css, .woff, .woff2)
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)',
  ],
};

const ROOT_DOMAINS = ['mellod.in', 'www.mellod.in'];
const RESERVED_SUBDOMAINS = ['www', 'api', 'app', 'mail', 'status', 'portal', 'root'];

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const rawHost = req.headers.get('host') || '';
  // Strip port (e.g. 'engg.localhost:3000' -> 'engg.localhost')
  const host = rawHost.toLowerCase().replace(/:\d+$/, '');

  let subdomain: string | null = null;

  // 1. Detect Production Subdomain (*.mellod.in)
  if (host.endsWith('.mellod.in')) {
    subdomain = host.replace(/\.mellod\.in$/, '');
  }
  // 2. Detect Local Development Subdomain (*.localhost)
  else if (host.endsWith('.localhost')) {
    subdomain = host.replace(/\.localhost$/, '');
  }

  // If host is bare root domain or reserved, proceed normally
  if (!subdomain || ROOT_DOMAINS.includes(host) || host === 'localhost' || host === '127.0.0.1' || RESERVED_SUBDOMAINS.includes(subdomain)) {
    return NextResponse.next();
  }

  // 3. Super Admin Subdomain (admin.mellod.in -> /admin)
  if (subdomain === 'admin') {
    if (!url.pathname.startsWith('/admin')) {
      const adminUrl = new URL(`/admin${url.pathname === '/' ? '' : url.pathname}`, req.url);
      return NextResponse.rewrite(adminUrl);
    }
    return NextResponse.next();
  }

  // 4. Shop Counter Subdomain ({slug}.mellod.in)
  // Rewrite customer request directly into that shop counter's context
  // e.g. https://engg.mellod.in/ -> internally rewrites to /?shop=engg
  if (url.pathname === '/') {
    const tenantUrl = new URL(`/?shop=${encodeURIComponent(subdomain)}`, req.url);
    return NextResponse.rewrite(tenantUrl);
  }

  // If shopkeeper visits their counter portal from their subdomain:
  // e.g. https://engg.mellod.in/shop -> internally rewrites to /shop?shop=engg
  if (url.pathname.startsWith('/shop')) {
    const shopPortalUrl = new URL(`${url.pathname}?shop=${encodeURIComponent(subdomain)}`, req.url);
    return NextResponse.rewrite(shopPortalUrl);
  }

  // For any other path on a custom subdomain, preserve the shop query param
  const rewrittenUrl = new URL(`${url.pathname}${url.search ? url.search + '&' : '?'}shop=${encodeURIComponent(subdomain)}`, req.url);
  return NextResponse.rewrite(rewrittenUrl);
}
