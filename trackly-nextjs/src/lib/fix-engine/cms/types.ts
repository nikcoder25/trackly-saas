/**
 * Fix Engine - CMS adapter contract (Channel A shipping).
 *
 * Channel A modules ship by writing content through the customer's CMS
 * REST API. Every CMS (WordPress, Webflow, Shopify, ...) implements this
 * one interface so module.ship() is platform-agnostic - it asks the
 * registry for the brand's adapter and calls the relevant operation.
 *
 * Phase 1 ships the WordPress reference adapter; others are registered
 * behind the same interface as they're built. Operations a given CMS
 * can't perform throw CmsUnsupportedError, which the engine surfaces as
 * a "needs Connector / manual" state rather than a hard failure.
 */

export class CmsUnsupportedError extends Error {
  constructor(op: string, cms: string) {
    super(`CMS '${cms}' does not support operation '${op}'`);
    this.name = 'CmsUnsupportedError';
  }
}

export class CmsAuthError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'CmsAuthError';
  }
}

/** Decrypted credentials handed to an adapter. Shape is per-CMS. */
export type CmsCreds = Record<string, unknown>;

export interface CmsWriteResult {
  ok: boolean;
  /** CMS object id that was written (post id, page id, ...). */
  resourceId?: string | number;
  /** Public URL of the updated resource, when known. */
  url?: string;
  detail?: Record<string, unknown>;
}

/**
 * Identifies a target resource on the CMS. Phase-1 modules resolve a
 * page URL to a CMS resource; the adapter maps URL → post/page id.
 */
export interface CmsTarget {
  url: string;
}

export interface CmsAdapter {
  /** CMS identifier, e.g. 'wordpress'. */
  type: string;
  /** Verify the credentials work (used by the connect flow). */
  verify(creds: CmsCreds, siteUrl: string): Promise<{ ok: boolean; detail?: string }>;
  /** Update the <title> SEO field of the page at target.url. */
  updateTitle(creds: CmsCreds, target: CmsTarget, title: string): Promise<CmsWriteResult>;
  /** Update the meta description SEO field of the page at target.url. */
  updateMetaDescription(creds: CmsCreds, target: CmsTarget, description: string): Promise<CmsWriteResult>;
  /** Replace/append the page body (used by GEO rewrite, FAQ block). */
  updateBody(creds: CmsCreds, target: CmsTarget, html: string, mode: 'replace' | 'append'): Promise<CmsWriteResult>;
  /** Inject a JSON-LD schema block into the page head/body. */
  injectSchema(creds: CmsCreds, target: CmsTarget, jsonLd: string): Promise<CmsWriteResult>;
}
