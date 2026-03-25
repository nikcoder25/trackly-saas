import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const protectedPaths = ['/dashboard', '/overview', '/mentions', '/setup', '/billing', '/account', '/analytics'];
const authPaths = ['/login', '/signup'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('livesov_token')?.value;

  // If user is on auth page but already logged in, redirect to dashboard
  if (authPaths.some((p) => pathname.startsWith(p)) && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If user is on protected page but not logged in, redirect to login
  if (protectedPaths.some((p) => pathname.startsWith(p)) && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/overview/:path*', '/mentions/:path*', '/setup/:path*', '/billing/:path*', '/account/:path*', '/analytics/:path*', '/login', '/signup'],
};
