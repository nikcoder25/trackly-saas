/**
 * Fix Engine - module registry.
 *
 * The single place every module is registered. The engine, API routes,
 * and dashboard all discover modules through here. Adding a Phase-2/3
 * module = import it and add it to MODULES.
 */

import type { FixModule } from './types';
import { titleRewriteModule } from './modules/title-rewrite';
import { metaRewriteModule } from './modules/meta-rewrite';
import { geoPageRewriteModule } from './modules/geo-page-rewrite';
import { faqSchemaModule } from './modules/faq-schema';
import { llmsTxtModule } from './modules/llms-txt';
import { strikingDistanceModule } from './modules/striking-distance';
import { ctrRescueModule } from './modules/ctr-rescue';
import { internalLinkingModule } from './modules/internal-linking';
import { schemaMarkupModule } from './modules/schema-markup';
import { indexingRepairModule } from './modules/indexing-repair';
import { canonicalFixModule } from './modules/canonical-fix';
import { comparisonPagesModule } from './modules/comparison-pages';
import { citablePassagesModule } from './modules/citable-passages';
import { hallucinationCorrectionModule } from './modules/hallucination-correction';
import { robotsAiAccessModule } from './modules/robots-ai-access';
import { noindexRemovalModule } from './modules/noindex-removal';
import { ogCardsModule } from './modules/og-cards';
import { passageRewriteModule } from './modules/passage-rewrite';
import { externalCitationsModule } from './modules/external-citations';

const MODULES: FixModule[] = [
  // Phase 1 (crawl-triggered wedge)
  titleRewriteModule,
  metaRewriteModule,
  geoPageRewriteModule,
  faqSchemaModule,
  llmsTxtModule,
  passageRewriteModule, // manual, in-place targeted edits
  // Phase 2 (GSC-triggered + crawl-side)
  strikingDistanceModule,
  ctrRescueModule,
  internalLinkingModule,
  externalCitationsModule,
  schemaMarkupModule,
  // Phase 3 (GSC indexing/canonical + Channel B technical)
  indexingRepairModule,
  canonicalFixModule,
  robotsAiAccessModule,
  noindexRemovalModule,
  ogCardsModule,
  // GEO differentiators
  comparisonPagesModule,
  citablePassagesModule,
  hallucinationCorrectionModule,
];

const BY_KEY = new Map<string, FixModule>(MODULES.map((m) => [m.key, m]));

export function getModule(key: string): FixModule | undefined {
  return BY_KEY.get(key);
}

export function listModules(): FixModule[] {
  return [...MODULES];
}

/** Public catalog shape for the dashboard (no functions). */
export interface ModuleCatalogItem {
  key: string;
  title: string;
  description: string;
  channel: 'A' | 'B';
  trigger: 'crawl' | 'gsc' | 'manual';
  minPlan: string;
  phase: 1 | 2 | 3;
}

// Plan ranking for gating: a module with minPlan 'pro' requires an
// effective plan of pro or higher. Mirrors the plan keys in constants.ts.
const PLAN_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 3,
  agency: 4,
  enterprise: 5,
  // Trial mirrors the constants.ts limits table, which grants trial users
  // the full paid feature set so they can evaluate everything.
  trial: 8,
  owner: 9,
};

export function planRank(plan: string): number {
  return PLAN_RANK[plan] ?? 0;
}

/** True when `effectivePlan` is sufficient to run a module needing `minPlan`. */
export function meetsPlan(effectivePlan: string, minPlan: string): boolean {
  return planRank(effectivePlan) >= planRank(minPlan);
}

export function moduleCatalog(): ModuleCatalogItem[] {
  return MODULES.map((m) => ({
    key: m.key,
    title: m.title,
    description: m.description,
    channel: m.channel,
    trigger: m.trigger,
    minPlan: m.minPlan,
    phase: m.phase,
  }));
}
