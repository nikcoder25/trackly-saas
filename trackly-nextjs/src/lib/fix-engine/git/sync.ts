/**
 * Fix Engine - Git connector: repo sync orchestration.
 *
 * Turns a brand's shipped SEO overrides into a committed manifest delivered by
 * a pull request:
 *   1. Build the deterministic manifest JSON.
 *   2. Ensure a working branch off the repo's default branch.
 *   3. Write the manifest file there — skipping the commit if the content is
 *      byte-identical to what's already on the branch (no-op).
 *   4. Open a PR (or leave the existing open one to accumulate updates).
 *
 * Delivery mirrors the edge model: `shipFix` marks a git-fronted fix shipped,
 * then triggers `syncBrandSeoToRepo`, which regenerates the WHOLE manifest from
 * all shipped fixes (same `getEdgeSeoOverrides` feed the Worker uses). The sync
 * is best-effort and never throws into the ship path.
 */

import { logger } from '@/lib/logger';
import type { EdgeSeoOverride } from '../schema';
import { getEdgeSeoOverrides } from '../schema';
import { getConnection } from '../connections';
import { buildSeoManifest, DEFAULT_MANIFEST_PATH } from './manifest';
import {
  getDefaultBranch, getBranchSha, ensureBranch, getFile, putFile, findOpenPull, openPull,
  type FetchLike, type GitHubRepoRef,
} from './github';

/** Shape of the creds stored on a `git` CMS connection. */
export interface GitConnectorCreds {
  token: string;
  owner: string;
  repo: string;
  /** Override the auto-detected default branch to base the PR on. */
  baseBranch?: string;
  /** Working branch the manifest is committed to (PR head). */
  workBranch?: string;
  /** In-repo path for the manifest. */
  manifestPath?: string;
}

export interface GitSyncResult {
  ok: boolean;
  committed: boolean;
  prUrl?: string;
  branch?: string;
  error?: string;
}

const WORK_BRANCH = 'livesov/seo-overrides';
const PR_TITLE = 'livesov: update SEO overrides';

/** Validate a creds object has the required GitHub fields. */
export function isGitConnectorCreds(v: unknown): v is GitConnectorCreds {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return typeof c.token === 'string' && typeof c.owner === 'string' && typeof c.repo === 'string'
    && !!c.token && !!c.owner && !!c.repo;
}

function prBody(pathCount: number): string {
  return [
    'Automated by **livesov**. This commits your approved SEO fixes into your repo as a',
    `manifest (\`${DEFAULT_MANIFEST_PATH}\`) so they live in your source and survive removal`,
    'of any livesov snippet. Your build reads this file and applies the values at render time.',
    '',
    `Covers **${pathCount}** page${pathCount === 1 ? '' : 's'}. Merges are safe and repeatable; livesov`,
    'updates this same PR as you approve more fixes.',
  ].join('\n');
}

/**
 * Core sync: given creds + overrides, commit the manifest and ensure a PR.
 * Pure over an injected `fetch` for testability.
 */
export async function syncSeoToRepo(args: {
  creds: GitConnectorCreds;
  brandId: string;
  overrides: Record<string, EdgeSeoOverride>;
  generatedAt?: string | null;
  fetchImpl?: FetchLike;
}): Promise<GitSyncResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const ref: GitHubRepoRef = { token: args.creds.token, owner: args.creds.owner, repo: args.creds.repo };
  const manifestPath = args.creds.manifestPath || DEFAULT_MANIFEST_PATH;
  const workBranch = args.creds.workBranch || WORK_BRANCH;

  const body = buildSeoManifest({ brandId: args.brandId, overrides: args.overrides, generatedAt: args.generatedAt ?? null });

  // Base branch (explicit or the repo default).
  let baseBranch = args.creds.baseBranch;
  if (!baseBranch) {
    const db = await getDefaultBranch(fetchImpl, ref);
    if (!db.ok) return { ok: false, committed: false, error: db.error };
    baseBranch = db.branch;
  }

  const baseSha = await getBranchSha(fetchImpl, ref, baseBranch);
  if (baseSha === null || typeof baseSha !== 'string') {
    return { ok: false, committed: false, error: `Base branch '${baseBranch}' not found` };
  }

  const branched = await ensureBranch(fetchImpl, ref, workBranch, baseSha);
  if (!branched.ok) return { ok: false, committed: false, error: branched.error };

  // No-op guard: skip the commit if the manifest is unchanged on the branch.
  const existing = await getFile(fetchImpl, ref, manifestPath, workBranch);
  if (existing && 'status' in existing) return { ok: false, committed: false, error: existing.message };
  let committed = false;
  if (!existing || existing.content !== body) {
    const put = await putFile(fetchImpl, ref, {
      path: manifestPath, branch: workBranch, content: body,
      message: PR_TITLE, sha: existing?.sha,
    });
    if (!put.ok) return { ok: false, committed: false, error: put.error };
    committed = true;
  }

  // Ensure an open PR (accumulates further updates).
  const open = await findOpenPull(fetchImpl, ref, workBranch, baseBranch);
  if (open && 'status' in open) return { ok: false, committed, error: open.message };
  let prUrl = open?.url;
  if (!open) {
    const pathCount = Object.keys(args.overrides).length;
    const pr = await openPull(fetchImpl, ref, {
      head: workBranch, base: baseBranch, title: PR_TITLE, body: prBody(pathCount),
    });
    if (!pr.ok) return { ok: false, committed, error: pr.error };
    prUrl = pr.pull?.url;
  }

  return { ok: true, committed, prUrl, branch: workBranch };
}

/**
 * Best-effort: regenerate the manifest from all of a brand's shipped fixes and
 * sync it to the connected repo. Called from the ship path for git-fronted
 * brands. Never throws — a repo/API hiccup is logged, not surfaced as a ship
 * failure (the fix is already shipped; the manifest catches up on the next
 * ship or a manual re-sync).
 */
export async function syncBrandSeoToRepo(
  brandId: string, opts?: { generatedAt?: string | null; fetchImpl?: FetchLike },
): Promise<GitSyncResult> {
  try {
    const conn = await getConnection(brandId, 'cms');
    if (!conn || conn.status !== 'active' || conn.cmsType !== 'git') {
      return { ok: false, committed: false, error: 'No active git connection' };
    }
    if (!isGitConnectorCreds(conn.creds)) {
      return { ok: false, committed: false, error: 'git connection is missing token/owner/repo' };
    }
    const overrides = await getEdgeSeoOverrides(brandId);
    const res = await syncSeoToRepo({
      creds: conn.creds, brandId, overrides,
      generatedAt: opts?.generatedAt ?? null, fetchImpl: opts?.fetchImpl,
    });
    if (!res.ok) logger.warn('fix_engine.git_sync_failed', { brandId, err: res.error });
    else logger.info('fix_engine.git_sync_ok', { brandId, committed: res.committed, prUrl: res.prUrl });
    return res;
  } catch (e) {
    logger.warn('fix_engine.git_sync_threw', { brandId, err: (e as Error).message });
    return { ok: false, committed: false, error: (e as Error).message };
  }
}
