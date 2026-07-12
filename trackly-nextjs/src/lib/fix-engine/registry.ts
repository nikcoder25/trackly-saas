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
import { contentFreshnessModule } from './modules/content-freshness';
import { imageAltModule } from './modules/image-alt';
import { keywordOpportunitiesModule } from './modules/keyword-opportunities';

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
  contentFreshnessModule,
  imageAltModule,
  keywordOpportunitiesModule,
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

// Flat per-module generation cost (quota credits, not provider $). The
// single source of truth — the engine reserves this, the catalog surfaces
// it, and the dashboard shows it. Deterministic modules cost 0.
const MODULE_COST: Record<string, number> = {
  'title-rewrite': 1, 'meta-rewrite': 1, 'faq-schema': 1, 'geo-page-rewrite': 2,
  'llms-txt': 2, 'passage-rewrite': 1, 'striking-distance': 2, 'ctr-rescue': 1,
  'internal-linking': 1, 'external-citations': 1, 'schema-markup': 1,
  'indexing-repair': 2, 'canonical-fix': 0, 'robots-ai-access': 0,
  'noindex-removal': 0, 'og-cards': 1, 'comparison-pages': 3,
  'citable-passages': 1, 'hallucination-correction': 1, 'content-freshness': 1,
  'image-alt': 1, 'keyword-opportunities': 2,
};
export function generateCost(moduleKey: string): number {
  return MODULE_COST[moduleKey] ?? 1;
}

// Relative SEO/GEO impact of each module, used to rank fixes so customers do
// the high-value ones first. 3 = high, 2 = medium, 1 = low.
const MODULE_IMPACT: Record<string, 1 | 2 | 3> = {
  'title-rewrite': 3, 'meta-rewrite': 2, 'faq-schema': 2, 'geo-page-rewrite': 3,
  'llms-txt': 3, 'passage-rewrite': 2, 'striking-distance': 3, 'ctr-rescue': 3,
  'internal-linking': 2, 'external-citations': 2, 'schema-markup': 2,
  'indexing-repair': 3, 'canonical-fix': 2, 'robots-ai-access': 3,
  'noindex-removal': 3, 'og-cards': 1, 'comparison-pages': 3,
  'citable-passages': 3, 'hallucination-correction': 3, 'content-freshness': 3,
  'image-alt': 1, 'keyword-opportunities': 3,
};
export function moduleImpact(moduleKey: string): 1 | 2 | 3 {
  return MODULE_IMPACT[moduleKey] ?? 2;
}

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
  /** Quota credits a generate costs (0 = deterministic, no LLM). */
  cost: number;
  /** True when the module can undo a shipped fix. */
  revertable: boolean;
  /** Relative impact for ranking: 3 = high, 2 = medium, 1 = low. */
  impact: 1 | 2 | 3;
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
    cost: generateCost(m.key),
    revertable: typeof m.revert === 'function',
    impact: moduleImpact(m.key),
  }));
}
