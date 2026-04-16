# Livesov Business & Pricing Report
**Date:** April 2026
**Prepared for:** Internal Strategy

---

## 1. Competitive Landscape

### Direct Competitors in AI Visibility Tracking

| Tool | Starting Price | Mid-Tier | Top Tier | # Platforms | Prompt Model |
|------|---------------|----------|----------|-------------|--------------|
| **Livesov** | $0 (Free) | $29/mo | $89/mo | 5 | Runs/month |
| **Otterly.ai** | $29/mo | $189/mo | Custom | 3 | Prompts/month |
| **Peec AI** | $89/mo | $199/mo | $499/mo | 3 (+extras) | Prompts/month |
| **ZipTie** | $69/mo | $159/mo | Custom | 3 | Credits |
| **Profound** | $99/mo | $399/mo | $2,000+/mo | 1-10+ | Prompts + runs |
| **Writesonic** | $249/mo | $499/mo | Custom | 3-8 | Prompts/month |
| **Scrunch AI** | $300/mo | - | Custom | 7+ | Prompts/month |
| **LLM Pulse** | $49/mo | $99/mo | $1,199/mo | Multiple | Prompts/month |
| **Ahrefs Brand Radar** | $828/mo | - | $1,148+/mo | 6 | Checks/month |

### How Competitors Structure Limits

- **Otterly**: $29/mo = 15 prompts. $189/mo = 100 prompts. Extra 100 prompts = $99 add-on.
- **Peec AI**: $89/mo = 25 prompts. $199/mo = 100 prompts. Extra platforms cost $20-30/mo each.
- **Profound**: $99/mo = 50 prompts (ChatGPT only). $399/mo = 100 prompts (3 platforms).
- **Writesonic**: $249/mo = 100 prompts. AI visibility features only on $249+ plans.
- **Scrunch**: $300/mo = 250 prompts across 7+ platforms.
- **Ahrefs**: $828/mo total (base subscription + Brand Radar add-on). 2,500 checks/mo.

### Industry Definition of "Prompt"

Most competitors count **1 prompt = 1 query tracked**, regardless of how many AI platforms it's checked against. A user who tracks "best HVAC in Austin" across ChatGPT, Perplexity, and Gemini uses 1 prompt, not 3.

### Platform Coverage Comparison

| Platform | Livesov | Otterly | Peec | Profound | Ahrefs |
|----------|---------|---------|------|----------|--------|
| ChatGPT | Yes | Yes | Yes | Yes | Yes |
| Perplexity | Yes | Yes | Yes | Yes | Yes |
| Claude | Yes | No | Add-on | Yes | No |
| Gemini/Google AI | Yes | Yes (AIO) | Yes (AIO) | Yes | Yes |
| Grok | Yes | No | Add-on | Yes | No |
| Google AI Mode | No | No | No | Yes | Yes |
| Copilot | No | No | No | Yes | Yes |

**Livesov advantage**: 6 platforms included on all paid plans (including Google AI Overviews). Most competitors charge $89+ to get 3 platforms, or $20-30 per additional platform.

---

## 2. API Cost Analysis

### Cost Per Single Query Execution (1 query, 1 platform)

Assumes ~150 input tokens, ~300 output tokens per query.

| Platform | Model Used | Input $/M | Output $/M | Extra Fee | **Cost/Query** |
|----------|-----------|-----------|------------|-----------|---------------|
| Gemini | gemini-2.5-flash | $0.30 | $2.50 | - | **$0.0001** |
| Grok | grok-3-mini | $0.30 | $0.50 | - | **$0.0002** |
| Perplexity | sonar | $1.00 | $1.00 | - | **$0.0004** |
| Claude | claude-haiku-4.5 | $1.00 | $5.00 | - | **$0.0016** |
| ChatGPT | gpt-4o-mini-search | $0.15 | $0.60 | $0.01/call | **$0.0102** |

### Cost Per "Run" (all platforms)

A "run" sends all configured queries to all active platforms.

| Queries | Platforms | Total Executions | **Cost per Run** |
|---------|-----------|-----------------|-----------------|
| 5 | 2 | 10 | $0.02 |
| 10 | 2 | 20 | $0.05 |
| 25 | 2 | 50 | $0.13 |
| 25 | 5 | 125 | $0.38 |
| 50 | 5 | 250 | $0.75 |
| 100 | 5 | 500 | $1.50 |

**Key insight**: ChatGPT Search ($0.01/call) accounts for ~80% of the total API cost. The other 4 platforms combined cost less than $0.002 per query.

---

## 3. New Plan Structure (Implemented)

### Plan Limits

| | Free | Starter $9 | Pro $29 | Agency $89 | Enterprise |
|--|------|-----------|---------|-----------|-----------|
| **Brands** | 1 | 2 | 5 | 20 | 100 |
| **Queries / brand** | 5 | 25 | 50 | 100 | 500 |
| **Runs / month** | 5 | 30 | 90 | 240 | 500 |
| **Platforms** | 2 | 2 | 5 | 5 | 5 |
| **Competitors** | 0 | 3 | 10 | 30 | 100 |
| **Scheduled Runs** | No | Every 3 days | Daily | Every 12h | Every 6h |
| **Sentiment** | No | Yes | Yes | Yes | Yes |
| **GEO Audits** | 3 | 25 | 100 | 500 | 5,000 |

### What Changed (Old vs New)

| Metric | Old System | New System |
|--------|-----------|------------|
| **Limit unit** | "Prompts" (= individual API calls) | "Runs" (= 1 click of Run Queries) |
| **Starter brands** | 1 | 2 |
| **Starter competitors** | 2 | 3 |
| **Pro queries** | 250 (total across brands) | 50/brand (250 effective with 5 brands) |
| **Pro competitors** | 5 | 10 |
| **Agency competitors** | 20 | 30 |
| **Agency effective runs** | ~8 (with 23q × 5p = 115 per "prompt run") | 240 (8/day) |

---

## 4. Profitability Analysis

### Worst-Case Scenario (Max Usage)

Every user maxes out their plan every month:

| Plan | Price | Max Runs | Max Queries | Platforms | Executions | API Cost | **Margin** |
|------|-------|----------|-------------|-----------|------------|----------|-----------|
| Free | $0 | 5 | 5 | 2 | 50 | $0.10 | -$0.10 |
| Starter | $9 | 30 | 25 | 2 | 1,500 | $3.75 | **$5.25 (58%)** |
| Pro | $29 | 90 | 50 | 5 | 22,500 | $14.06 | **$14.94 (52%)** |
| Agency | $89 | 240 | 100 | 5 | 120,000 | $37.50 | **$51.50 (58%)** |

### Realistic Scenario (50% Average Usage)

Most users don't max out. Assuming 50% average utilization:

| Plan | Price | Avg Runs | API Cost | **Margin** |
|------|-------|----------|----------|-----------|
| Free | $0 | 2 | $0.04 | -$0.04 |
| Starter | $9 | 15 | $1.88 | **$7.12 (79%)** |
| Pro | $29 | 45 | $7.03 | **$21.97 (76%)** |
| Agency | $89 | 120 | $18.75 | **$70.25 (79%)** |

### Break-Even Analysis

| Plan | Price | Break-even (runs) | With 50q × 5p |
|------|-------|-------------------|---------------|
| Starter | $9 | 72 runs/month | Well above 30 limit |
| Pro | $29 | 38 runs/month | Well below 90 limit |
| Agency | $89 | 59 runs/month | Well below 240 limit |

**All paid plans are profitable even at maximum usage.**

### Revenue Projection (Per 100 Paying Users)

| Distribution | Users | MRR | API Cost | **Net Margin** |
|-------------|-------|-----|----------|---------------|
| 40 Starter | 40 | $360 | $150 | $210 |
| 35 Pro | 35 | $1,015 | $492 | $523 |
| 20 Agency | 20 | $1,780 | $750 | $1,030 |
| 5 Enterprise | 5 | $2,500* | $500 | $2,000 |
| **Total** | **100** | **$5,655** | **$1,892** | **$3,763 (67%)** |

*Enterprise pricing assumed at $500/mo average.

---

## 5. Competitive Positioning

### Where Livesov Wins

1. **Price-to-value ratio**: $29/mo for 6 platforms + 90 runs. Competitors charge $89-199/mo for 3 platforms and fewer prompts.
2. **Free tier**: Only tool offering a free plan. Otterly's cheapest is $29/mo.
3. **Platform coverage**: 6 AI platforms on all paid plans (including Google AI Overviews). Others charge extra per platform.
4. **Claude + Grok included**: Most competitors don't track these. Profound charges $399+/mo for similar coverage.

### Where Competitors Win

1. **Prompt volume data** (Profound): Shows how many people are asking AI about a topic - unique feature.
2. **GA4 integration** (Scrunch): Tracks actual AI referral traffic to your website.
3. **Google AI Mode** (Ahrefs, Profound): New Google feature not yet tracked by Livesov.
4. **Microsoft Copilot** (Profound, Ahrefs): Growing enterprise AI not tracked by Livesov.
5. **Static prompt libraries** (Ahrefs): 260M+ prompts - shows industry-wide visibility, not just your queries.

### Value Proposition for Marketing

**For small businesses** (Free/Starter): "Track your brand across AI platforms for free. See if ChatGPT and Perplexity recommend you."

**For growing brands** (Pro): "Daily AI visibility monitoring across 6 platforms for $29/mo - 10x cheaper than alternatives."

**For agencies** (Agency): "Monitor 20 client brands across ChatGPT, Perplexity, Claude, Gemini, Grok & Google AI Overviews for $89/mo. Competitors charge $300+."

---

## 6. Key Metrics to Track

1. **Cost per user per month** - Monitor actual API spend vs projected
2. **Average runs per user** - If consistently low, limits can be raised further
3. **Plan distribution** - Target 30% Pro, 20% Agency for healthy MRR
4. **Churn rate by plan** - If Agency users churn, run limits may still be too restrictive
5. **ChatGPT cost ratio** - ChatGPT Search is 80% of API cost; monitor OpenAI pricing changes

---

## 7. Future Considerations

1. **Add Google AI Mode tracking** - All competitors have it. Could use existing Gemini API.
2. **Add Microsoft Copilot** - Growing enterprise demand. Bing API integration.
3. **Offer annual billing** - Industry standard 15-20% discount. Improves cash flow.
4. **Consider prompt volume data** - Profound's unique feature. Would require large-scale query monitoring.
5. **GA4 integration** - Track AI-referred traffic. High demand feature.

---

*Report generated April 2026. API pricing subject to change. Competitor pricing verified via public pricing pages.*
