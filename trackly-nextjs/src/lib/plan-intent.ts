// Plan + billing cycle picked on /pricing (?plan=pro&billing=annual). Signup
// stashes it in sessionStorage so the billing page can preselect it later,
// after onboarding, without forcing new users straight into checkout.

export interface PlanIntent {
  plan: 'starter' | 'pro' | 'agency';
  billing: 'monthly' | 'annual';
}

const KEY = 'livesov_plan_intent';

export function parsePlanIntent(search: string): PlanIntent | null {
  const params = new URLSearchParams(search);
  const plan = (params.get('plan') || '').toLowerCase();
  if (plan !== 'starter' && plan !== 'pro' && plan !== 'agency') return null;
  return { plan, billing: params.get('billing') === 'annual' ? 'annual' : 'monthly' };
}

export function savePlanIntent(intent: PlanIntent): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(intent)); } catch { /* storage blocked */ }
}

/** Returns and clears the stashed intent. */
export function takePlanIntent(): PlanIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const v = JSON.parse(raw);
    return parsePlanIntent(`plan=${encodeURIComponent(v?.plan ?? '')}&billing=${encodeURIComponent(v?.billing ?? '')}`);
  } catch {
    return null;
  }
}
