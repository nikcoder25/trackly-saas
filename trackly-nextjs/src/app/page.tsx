// The homepage lives in (public)/home so it shares that folder's fonts and
// styles, but a route's layout only wraps its own URL. "/" used to re-export
// just the page, so the home layout's title, description and JSON-LD never
// reached the real homepage (only the 301ing /home). Render both here.
import HomeLayout, { metadata as homeMetadata } from './(public)/home/layout';
import HomePage from './(public)/home/page';

export const metadata = homeMetadata;

export default function Page() {
  return (
    <HomeLayout>
      <HomePage />
    </HomeLayout>
  );
}
