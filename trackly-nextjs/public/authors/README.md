# Author portraits

`nik.svg` is a **placeholder monogram**, not the real headshot. It exists so no
page ships with a broken image while the photo is pending.

## To swap in the real photo

1. Drop the headshot here as `nik.jpg` — square, at least 400×400, ideally
   800×800. A tight head-and-shoulders crop reads best at the 44px byline size.
2. Change one line in `src/data/authors.ts`:

   ```diff
   -  avatar: '/authors/nik.svg',
   +  avatar: '/authors/nik.jpg',
   ```

Nothing else needs to change. Every byline, the author bio box, the `/author/nik`
page, and the `Person` JSON-LD all read that single field.

A real photograph matters here: it is the difference between a byline that reads
as a person and one that reads as a brand account. Ship it as soon as the file
is available.
