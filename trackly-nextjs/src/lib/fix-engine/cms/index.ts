/**
 * Fix Engine - CMS adapter registry.
 *
 * Maps a CMS type string (stored on fix_connections.cms_type) to its
 * adapter. Phase 1 ships WordPress; Webflow / Shopify / etc. register
 * here behind the same CmsAdapter interface as they're built.
 */

import type { CmsAdapter } from './types';
import { wordpressAdapter } from './wordpress';
import { shopifyAdapter } from './shopify';
import { ghostAdapter } from './ghost';
import { webflowAdapter } from './webflow';
import { customAdapter } from './custom';

const ADAPTERS: Record<string, CmsAdapter> = {
  wordpress: wordpressAdapter,
  shopify: shopifyAdapter,
  ghost: ghostAdapter,
  webflow: webflowAdapter,
  custom: customAdapter,
};

export function getCmsAdapter(type: string | null | undefined): CmsAdapter | null {
  if (!type) return null;
  return ADAPTERS[type.toLowerCase()] ?? null;
}

export function listSupportedCms(): string[] {
  return Object.keys(ADAPTERS);
}

export * from './types';
