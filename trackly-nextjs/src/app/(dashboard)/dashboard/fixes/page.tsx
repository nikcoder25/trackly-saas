import { redirect } from 'next/navigation';

// /dashboard/fixes — the Fix Engine is retired from the product. Old links,
// bookmarks and the OAuth callbacks that still land here go to the
// Recommendations list instead.
export default function FixesDashboardPage() {
  redirect('/dashboard/recommendations');
}
