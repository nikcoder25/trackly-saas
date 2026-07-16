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
 * Like the edge adapter, the per-field write methods here don't push — the value
 * is delivered by the manifest the moment the fix's row turns shipped. They just
 * report ok so `module.ship()` and the ship fast-path stay uniform. The real
 * commit happens in the ship handler's git branch, which calls syncBrandSeoToRepo.
 */

import { getDefaultBranch } from '../git/github';
import { isGitConnectorCreds, type GitConnectorCreds } from '../git/sync';
import type { CmsAdapter, CmsCreds, CmsWriteResult } from './types';
import { CmsUnsupportedError } from './types';

function creds(c: CmsCreds): GitConnectorCreds {
  if (!isGitConnectorCreds(c)) throw new CmsUnsupportedError('git-write', 'git');
  return c;
}

function delivered(field: string, value: string): CmsWriteResult {
  return { ok: true, detail: { delivery: 'git', field, value } };
}

export const gitAdapter: CmsAdapter = {
  type: 'git',

  async verify(c: CmsCreds): Promise<{ ok: boolean; detail?: string }> {
    if (!isGitConnectorCreds(c)) return { ok: false, detail: 'Missing token / owner / repo' };
    const r = await getDefaultBranch(fetch, { token: c.token, owner: c.owner, repo: c.repo });
    return r.ok ? { ok: true, detail: `Connected to ${c.owner}/${c.repo} (base: ${r.branch})` } : { ok: false, detail: r.error };
  },

  async updateTitle(c, _t, title): Promise<CmsWriteResult> { creds(c); return delivered('title', title); },
  async updateMetaDescription(c, _t, d): Promise<CmsWriteResult> { creds(c); return delivered('description', d); },
  async updateCanonical(c, _t, canonical): Promise<CmsWriteResult> { creds(c); return delivered('canonical', canonical); },
  async injectSchema(c, _t, jsonLd): Promise<CmsWriteResult> { creds(c); return delivered('jsonLd', jsonLd); },
  async updateBody(c, _t, _html, mode): Promise<CmsWriteResult> { creds(c); return { ok: true, detail: { delivery: 'git', field: 'body', mode } }; },
  async setIndexable(c): Promise<CmsWriteResult> { creds(c); return delivered('indexable', 'true'); },

  async replaceInBody(c): Promise<CmsWriteResult & { found?: boolean }> {
    creds(c);
    // Passage rewrites aren't part of the deterministic override feed the
    // manifest carries, so they can't be delivered by the git manifest.
    return { ok: false, found: false, error: 'Passage rewrites are not delivered via the git manifest.' };
  },

  async createPage(): Promise<CmsWriteResult> {
    throw new CmsUnsupportedError('createPage', 'git');
  },
};
