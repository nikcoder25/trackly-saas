import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const authPaths = ['/login', '/signup', '/reset-password'];

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 < Date.now() : true;
  } catch {
    return true;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('livesov_token')?.value;
  const hasValidToken = token && !isTokenExpired(token);

  // If user is on auth page but already logged in, redirect to dashboard
  // This prevents logged-in users from accessing login/signup/reset pages
  if (authPaths.some((p) => pathname.startsWith(p)) && hasValidToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If user is on any dashboard or onboarding page but not logged in, redirect to login
  if ((pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding')) && !hasValidToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding', '/login', '/signup', '/reset-password'],
};
