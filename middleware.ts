import { type NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getSafeCallbackUrl } from '@/lib/safe-callback-url';

export async function middleware(req: NextRequest) {
  try {
    const secret = process.env.NEXTAUTH_SECRET ?? process.env.NEXTNEXTAUTH_SECRET;
    const secureCookieName = '__Secure-authjs.session-token';
    const insecureCookieName = 'authjs.session-token';
    const token =
      (await getToken({ req, secret, cookieName: secureCookieName })) ?? (await getToken({ req, secret, cookieName: insecureCookieName }));
    const url = req.nextUrl;
    const hasToken = Boolean(token);
    const isAuthRoute = url.pathname.startsWith('/api/auth');
    const isSignIn = url.pathname.startsWith('/auth/signin');
    const isApiRoute = url.pathname.startsWith('/api');

    if (hasToken && isSignIn) {
      const safePath = getSafeCallbackUrl(url.searchParams.get('callbackUrl'), url.origin);
      return NextResponse.redirect(new URL(safePath, url.origin));
    }

    // Only redirect to sign-in for page requests; let API routes return 401 JSON
    if (!hasToken && !isAuthRoute && !isSignIn && !isApiRoute) {
      const signInUrl = new URL('/auth/signin', url.origin);
      signInUrl.searchParams.set('callbackUrl', getSafeCallbackUrl(req.url, url.origin));
      return NextResponse.redirect(signInUrl);
    }

    return NextResponse.next();
  } catch (error) {
    const url = req.nextUrl;
    const isAuthRoute = url.pathname.startsWith('/api/auth');
    const isSignIn = url.pathname.startsWith('/auth/signin');
    const isApiRoute = url.pathname.startsWith('/api');
    console.error('[middleware] Auth check failed:', error instanceof Error ? error.message : String(error));
    // Fail closed: redirect to sign-in for pages only; API routes will 401
    if (!isAuthRoute && !isSignIn && !isApiRoute) {
      const signInUrl = new URL('/auth/signin', url.origin);
      signInUrl.searchParams.set('callbackUrl', getSafeCallbackUrl(req.url, url.origin));
      return NextResponse.redirect(signInUrl);
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
