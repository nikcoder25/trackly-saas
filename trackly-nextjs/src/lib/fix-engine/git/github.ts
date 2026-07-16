/**
 * Fix Engine - Git connector: minimal GitHub REST client.
 *
 * Only the handful of Contents/Git-refs/Pulls calls the SEO manifest sync
 * needs, over an injected `fetch` (defaults to the global) so it is unit-tested
 * with a mock. All calls hit the fixed, trusted api.github.com host with a
 * bearer token, so plain fetch is used (no SSRF surface to guard).
 *
 * Auth: a token with `contents:write` + `pull_requests:write` on the repo — a
 * GitHub App installation token (preferred) or a fine-grained PAT. Token
 * provisioning (the App install / OAuth handshake) lives in the connect flow;
 * this client just consumes the token from the stored connection creds.
 */

const GITHUB_API = 'https://api.github.com';

export type FetchLike = typeof fetch;

export interface GitHubRepoRef {
  token: string;
  owner: string;
  repo: string;
}

export interface GitHubError {
  status: number;
  message: string;
}

function isErr(v: unknown): v is GitHubError {
  return !!v && typeof v === 'object' && 'status' in v && 'message' in v;
}

async function gh<T = unknown>(
  fetchImpl: FetchLike,
  ref: GitHubRepoRef,
  method: string,
  path: string,
  body?: unknown,
): Promise<T | GitHubError> {
  let res: Response;
  try {
    res = await fetchImpl(`${GITHUB_API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${ref.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'livesov-fix-engine',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { status: 0, message: (e as Error).message };
  }
  if (res.status === 404) return { status: 404, message: 'Not found' };
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) {
    const msg = (json && typeof json === 'object' && 'message' in json)
      ? String((json as Record<string, unknown>).message)
      : `HTTP ${res.status}`;
    return { status: res.status, message: msg };
  }
  return json as T;
}

/** Base64-encode UTF-8 content the way the GitHub Contents API expects. */
export function toBase64(content: string): string {
  return Buffer.from(content, 'utf8').toString('base64');
}
function fromBase64(b64: string): string {
  return Buffer.from(b64.replace(/\n/g, ''), 'base64').toString('utf8');
}

/** Verify the token can read the repo; returns the repo's default branch. */
export async function getDefaultBranch(
  fetchImpl: FetchLike, ref: GitHubRepoRef,
): Promise<{ ok: true; branch: string } | { ok: false; error: string }> {
  const r = await gh<{ default_branch?: string }>(fetchImpl, ref, 'GET', `/repos/${ref.owner}/${ref.repo}`);
  if (isErr(r)) return { ok: false, error: r.status === 404 ? 'Repository not found or token lacks access' : r.message };
  return { ok: true, branch: r.default_branch || 'main' };
}

/** The commit sha a branch points at, or null if the branch doesn't exist. */
export async function getBranchSha(
  fetchImpl: FetchLike, ref: GitHubRepoRef, branch: string,
): Promise<string | null | GitHubError> {
  const r = await gh<{ object?: { sha?: string } }>(
    fetchImpl, ref, 'GET', `/repos/${ref.owner}/${ref.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  if (isErr(r)) return r.status === 404 ? null : r;
  return r.object?.sha ?? null;
}

/** Create `branch` pointing at `fromSha`. No-op-safe: returns ok if it exists. */
export async function ensureBranch(
  fetchImpl: FetchLike, ref: GitHubRepoRef, branch: string, fromSha: string,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await getBranchSha(fetchImpl, ref, branch);
  if (isErr(existing)) return { ok: false, error: existing.message };
  if (existing) return { ok: true };
  const r = await gh(fetchImpl, ref, 'POST', `/repos/${ref.owner}/${ref.repo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: fromSha,
  });
  return isErr(r) ? { ok: false, error: r.message } : { ok: true };
}

export interface FileState { sha: string; content: string }

/** Current file blob sha + decoded content on `branch`, or null if absent. */
export async function getFile(
  fetchImpl: FetchLike, ref: GitHubRepoRef, path: string, branch: string,
): Promise<FileState | null | GitHubError> {
  const r = await gh<{ sha?: string; content?: string; encoding?: string }>(
    fetchImpl, ref, 'GET',
    `/repos/${ref.owner}/${ref.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
  );
  if (isErr(r)) return r.status === 404 ? null : r;
  if (!r.sha) return null;
  const content = r.content && r.encoding === 'base64' ? fromBase64(r.content) : '';
  return { sha: r.sha, content };
}

/** Create or update a file on `branch`. Pass `sha` to update an existing file. */
export async function putFile(
  fetchImpl: FetchLike, ref: GitHubRepoRef,
  args: { path: string; branch: string; content: string; message: string; sha?: string },
): Promise<{ ok: boolean; commitSha?: string; error?: string }> {
  const r = await gh<{ commit?: { sha?: string } }>(
    fetchImpl, ref, 'PUT',
    `/repos/${ref.owner}/${ref.repo}/contents/${args.path.split('/').map(encodeURIComponent).join('/')}`,
    { message: args.message, content: toBase64(args.content), branch: args.branch, ...(args.sha ? { sha: args.sha } : {}) },
  );
  if (isErr(r)) return { ok: false, error: r.message };
  return { ok: true, commitSha: r.commit?.sha };
}

export interface PullRequest { number: number; url: string }

/** The open PR from `head` into `base`, if any. */
export async function findOpenPull(
  fetchImpl: FetchLike, ref: GitHubRepoRef, head: string, base: string,
): Promise<PullRequest | null | GitHubError> {
  const r = await gh<Array<{ number: number; html_url: string }>>(
    fetchImpl, ref, 'GET',
    `/repos/${ref.owner}/${ref.repo}/pulls?state=open&head=${encodeURIComponent(`${ref.owner}:${head}`)}&base=${encodeURIComponent(base)}`,
  );
  if (isErr(r)) return r;
  const p = Array.isArray(r) ? r[0] : undefined;
  return p ? { number: p.number, url: p.html_url } : null;
}

/** Open a PR from `head` into `base`. */
export async function openPull(
  fetchImpl: FetchLike, ref: GitHubRepoRef,
  args: { head: string; base: string; title: string; body: string },
): Promise<{ ok: boolean; pull?: PullRequest; error?: string }> {
  const r = await gh<{ number?: number; html_url?: string }>(
    fetchImpl, ref, 'POST', `/repos/${ref.owner}/${ref.repo}/pulls`,
    { title: args.title, body: args.body, head: args.head, base: args.base },
  );
  if (isErr(r)) return { ok: false, error: r.message };
  return { ok: true, pull: { number: r.number ?? 0, url: r.html_url ?? '' } };
}
