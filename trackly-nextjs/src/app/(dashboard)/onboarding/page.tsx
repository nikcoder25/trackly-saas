'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Onboarding is now handled by the AddBrandModal popup on the dashboard.
// Redirect any direct visits to /onboarding to /dashboard.
export default function OnboardingPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return null;
}
