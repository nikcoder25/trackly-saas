/**
 * Fix Engine - Linear tracker adapter.
 *
 * Auth: a Linear personal API key (Settings → API → Personal API keys),
 * sent verbatim in the Authorization header (Linear does NOT use a Bearer
 * prefix). Creds shape (encrypted at rest in fix_connections):
 *   { apiKey: string, teamId: string }
 *
 * Uses Linear's GraphQL API at https://api.linear.app/graphql.
 */

import { safeFetch } from '@/lib/safe-fetch';
import type { Tracker, TrackerCreds, TrackerCreateResult, TrackerIssue, TrackerVerifyResult } from './types';

const ENDPOINT = 'https://api.linear.app/graphql';

interface LinearCreds { apiKey: string; teamId: string }

function readCreds(raw: TrackerCreds): LinearCreds {
  const c = raw as Partial<LinearCreds>;
  return { apiKey: String(c.apiKey ?? '').trim(), teamId: String(c.teamId ?? '').trim() };
}

async function gql(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await safeFetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    timeoutMs: 12_000,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

export const linearTracker: Tracker = {
  type: 'linear',

  async verify(rawCreds): Promise<TrackerVerifyResult> {
    const { apiKey, teamId } = readCreds(rawCreds);
    if (!apiKey) return { ok: false, detail: 'Missing Linear API key' };
    if (!teamId) return { ok: false, detail: 'Missing Linear team id' };
    try {
      // Confirm the key works and the team id is visible to it.
      const { ok, status, json } = await gql(apiKey, `query($id:String!){ team(id:$id){ id name } }`, { id: teamId });
      if (!ok || (json.errors as unknown)) {
        if (status === 401 || status === 400) return { ok: false, detail: 'Invalid Linear API key' };
        return { ok: false, detail: 'Could not verify Linear team — check the team id' };
      }
      const team = (json.data as { team?: { id?: string } } | undefined)?.team;
      if (!team?.id) return { ok: false, detail: 'Team id not found for this API key' };
      return { ok: true };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },

  async createIssue(rawCreds, issue: TrackerIssue): Promise<TrackerCreateResult> {
    const { apiKey, teamId } = readCreds(rawCreds);
    const description = issue.url ? `${issue.description}\n\n[Open in Livesov](${issue.url})` : issue.description;
    try {
      const { ok, json } = await gql(
        apiKey,
        `mutation($input:IssueCreateInput!){ issueCreate(input:$input){ success issue { id url } } }`,
        { input: { teamId, title: issue.title, description } },
      );
      const created = (json.data as { issueCreate?: { success?: boolean; issue?: { id?: string; url?: string } } } | undefined)?.issueCreate;
      if (!ok || !created?.success || !created.issue?.id) {
        return { ok: false, detail: 'Linear rejected the issue create' };
      }
      return { ok: true, id: created.issue.id, url: created.issue.url };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
};
