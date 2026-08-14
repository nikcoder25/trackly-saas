'use client';

import { useEffect } from 'react';
import { captureFirstTouch } from '@/lib/attribution-client';

/**
 * Mounted once in the root layout so first touch is recorded on whatever
 * page the visitor actually lands on. Renders nothing.
 *
 * It has to live at the root rather than on /signup: the external referrer
 * is gone by the time the signup form mounts. See src/lib/attribution-client.ts.
 */
export default function AttributionTracker() {
  useEffect(() => {
    captureFirstTouch();
  }, []);

  return null;
}
