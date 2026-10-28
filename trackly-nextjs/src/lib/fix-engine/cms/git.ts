/**
 * Fix Engine - Git adapter (durable "owned" publishing via a repo PR).
 *
 * The customer connects a repository (GitHub App install / fine-grained PAT).
 * Nothing is injected at runtime: a fix's shipped/verified row IS the override,
 * and `syncBrandSeoToRepo` commits the full per-path manifest into the repo as a
 * pull request (see ../git/sync). The customer's build reads that manifest and
 * bakes the values into the generated HTML, so the changes live in their source
 * and survive removal of any livesov snippet or Worker.
 *
 * The write methods deliberately do NOT report ok. The manifest only carries
 * the edge-serveable modules (EDGE_SERVEABLE_MODULE_KEYS), and the engine's
 * ship fast-path intercepts exactly those before `module.ship()` ever runs —
 * so by construction, every call that actually reaches a write method here is
 * for a module whose change the manifest will NEVER contain (striking-distance,
 * geo-page-rewrite, keyword-opportunities, …). Returning ok for those marked
 * the fix "shipped" while nothing was committed, served, or scheduled — the
 * change simply did not exist anywhere. Throwing CmsUnsupportedError instead
 * routes the engine to verify-by-fetch (the change may already be live in the
 * repo, published by hand) and otherwise to an actionable "publish manually"
 * failure.
 */

import { getDefaultBranch } from '../git/github';
import { isGitConnectorCreds } from '../git/sync';
import type { CmsAdapter, CmsCreds, CmsWriteResult } from './types';
import { CmsUnsupportedError } from './types';

function notInManifest(op: string): never {
  throw new CmsUnsupportedError(op, 'git');
}

export const gitAdapter: CmsAdapter = {
  type: 'git',

  async verify(c: CmsCreds): Promise<{ ok: boolean; detail?: string }> {
    if (!isGitConnectorCreds(c)) return { ok: false, detail: 'Missing token / owner / repo' };
    const r = await getDefaultBranch(fetch, { token: c.token, owner: c.owner, repo: c.repo });
    return r.ok ? { ok: true, detail: `Connected to ${c.owner}/${c.repo} (base: ${r.branch})` } : { ok: false, detail: r.error };
  },

  async updateTitle(): Promise<CmsWriteResult> { return notInManifest('updateTitle'); },
  async updateMetaDescription(): Promise<CmsWriteResult> { return notInManifest('updateMetaDescription'); },
  async updateCanonical(): Promise<CmsWriteResult> { return notInManifest('updateCanonical'); },
  async injectSchema(): Promise<CmsWriteResult> { return notInManifest('injectSchema'); },
  async updateBody(): Promise<CmsWriteResult> { return notInManifest('updateBody'); },
  async setIndexable(): Promise<CmsWriteResult> { return notInManifest('setIndexable'); },

  async replaceInBody(): Promise<CmsWriteResult & { found?: boolean }> {
    // Passage rewrites aren't part of the deterministic override feed the
    // manifest carries, so they can't be delivered by the git manifest.
    return { ok: false, found: false, error: 'Passage rewrites are not delivered via the git manifest.' };
  },

  async createPage(): Promise<CmsWriteResult> {
    throw new CmsUnsupportedError('createPage', 'git');
  },
};
