/**
 * Fix Engine - native issue-tracker contract.
 *
 * A tracker turns a Fix Engine notification into a real ticket in the
 * customer's Linear / Jira, using a per-user API token stored encrypted in
 * fix_connections (same model as the CMS creds). Every tracker implements
 * this one interface so notify.ts can dispatch without knowing the provider.
 */

export type TrackerCreds = Record<string, unknown>;

export interface TrackerVerifyResult {
  ok: boolean;
  detail?: string;
}

export interface TrackerIssue {
  title: string;
  /** Plain-text body; adapters wrap it in the provider's format. */
  description: string;
  /** Deep link back to the fix in Livesov, appended to the body. */
  url?: string;
}

export interface TrackerCreateResult {
  ok: boolean;
  /** Provider issue id (e.g. Linear UUID, Jira key). */
  id?: string;
  /** URL of the created issue. */
  url?: string;
  detail?: string;
}

export interface Tracker {
  type: 'linear' | 'jira';
  /** Validate creds (used by the connect flow before storing). */
  verify(creds: TrackerCreds): Promise<TrackerVerifyResult>;
  /** Create an issue. */
  createIssue(creds: TrackerCreds, issue: TrackerIssue): Promise<TrackerCreateResult>;
}
