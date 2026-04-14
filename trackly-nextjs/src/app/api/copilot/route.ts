import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { queryAI, getDefaultModel } from '@/lib/ai-platforms';
import { getAdminModel } from '@/lib/site-config';

function parseKeys(envName: string): string[] {
  const val = process.env[envName];
  if (!val) return [];
  return [...new Set(val.split(',').map(k => k.trim()).filter(Boolean))];
}

function getServerKeys(): Record<string, string[]> {
  return {
    openai: parseKeys('OPENAI_API_KEY'),
    perplexity: parseKeys('PERPLEXITY_API_KEY'),
    gemini: parseKeys('GEMINI_API_KEY'),
    claude: parseKeys('CLAUDE_API_KEY'),
    grok: parseKeys('GROK_API_KEY'),
  };
}

interface BrandContext {
  brandName: string;
  industry: string;
  currentSov: number;
  totalRuns: number;
  platforms: string[];
  sovTrend: number;
  competitors: string[];
  queries: string[];
  recentData: Array<{ sentiment: string; mentioned: boolean; platform: string; count: number }>;
}

function buildCopilotPrompt(question: string, ctx: BrandContext): string {
  const sentimentSummary: Record<string, number> = {};
  const platformSummary: Record<string, { total: number; mentioned: number }> = {};

  ctx.recentData.forEach(r => {
    if (r.mentioned) sentimentSummary[r.sentiment] = (sentimentSummary[r.sentiment] || 0) + r.count;
    if (!platformSummary[r.platform]) platformSummary[r.platform] = { total: 0, mentioned: 0 };
    platformSummary[r.platform].total += r.count;
    if (r.mentioned) platformSummary[r.platform].mentioned += r.count;
  });

  const platBreakdown = Object.entries(platformSummary)
    .map(([p, d]) => `${p}: ${d.mentioned}/${d.total} mentions (${d.total > 0 ? Math.round(d.mentioned / d.total * 100) : 0}%)`)
    .join(', ');

  return `You are Livesov Copilot, an AI assistant for the Livesov AI Visibility platform. Answer the user's question about their brand data concisely and helpfully.

Brand: ${ctx.brandName}
Industry: ${ctx.industry || 'Not specified'}
Current Share of Voice (SOV): ${ctx.currentSov}%
SOV Trend: ${ctx.sovTrend > 0 ? '+' : ''}${ctx.sovTrend}%
Total Runs: ${ctx.totalRuns}
Tracked Platforms: ${ctx.platforms.join(', ') || 'None yet'}
Competitors: ${ctx.competitors.length > 0 ? ctx.competitors.join(', ') : 'None configured'}
Queries Tracked: ${ctx.queries.length} (${ctx.queries.slice(0, 5).join('; ')}${ctx.queries.length > 5 ? '...' : ''})
Platform Breakdown (last 7 days): ${platBreakdown || 'No data'}
Sentiment (last 7 days): ${Object.entries(sentimentSummary).map(([k, v]) => `${k}: ${v}`).join(', ') || 'No data'}

User question: ${question}

Keep your answer under 200 words. Be specific with numbers from the data. If you don't have enough data to answer, say so and suggest what the user should do (e.g., run more queries, add competitors).`;
}

function generateCopilotAnswer(question: string, ctx: BrandContext): string {
  const q = question.toLowerCase();

  if (q.includes('sov') || q.includes('share of voice') || q.includes('visibility')) {
    const trend = ctx.sovTrend > 0 ? `up ${ctx.sovTrend}%` : ctx.sovTrend < 0 ? `down ${Math.abs(ctx.sovTrend)}%` : 'stable';
    let advice = '';
    if (ctx.currentSov < 10) advice = ' This is quite low — focus on establishing brand presence through authoritative content and reviews.';
    else if (ctx.currentSov < 30) advice = " There's room to grow. Check the Recommendations tab for specific improvements.";
    else if (ctx.currentSov >= 60) advice = ' This is a strong position. Focus on maintaining and defending against competitors.';
    return `${ctx.brandName}'s current share of voice is ${ctx.currentSov}%, trending ${trend} compared to the previous measurement. This is based on ${ctx.totalRuns} total runs across ${ctx.platforms.length} platforms.${advice}`;
  }

  if (q.includes('competitor') || q.includes('competition')) {
    if (ctx.competitors.length === 0) return 'No competitors are currently configured for tracking. Add competitors in Brand Setup to see how you compare.';
    const compData: Record<string, number> = {};
    ctx.recentData.forEach(r => { if (r.mentioned) compData[r.platform] = (compData[r.platform] || 0) + r.count; });
    return `You're tracking ${ctx.competitors.length} competitors: ${ctx.competitors.join(', ')}. Your brand appears in ${Object.keys(compData).length} platforms in the last 7 days. Visit the Competitors tab for detailed co-occurrence and per-platform breakdown.`;
  }

  if (q.includes('platform') || q.includes('chatgpt') || q.includes('perplexity') || q.includes('claude') || q.includes('gemini') || q.includes('grok')) {
    const platData: Record<string, { total: number; mentioned: number }> = {};
    ctx.recentData.forEach(r => {
      if (!platData[r.platform]) platData[r.platform] = { total: 0, mentioned: 0 };
      platData[r.platform].total += r.count;
      if (r.mentioned) platData[r.platform].mentioned += r.count;
    });
    const summary = Object.entries(platData).map(([p, d]) => {
      const rate = d.total > 0 ? Math.round(d.mentioned / d.total * 100) : 0;
      return `${p}: ${rate}% mention rate (${d.mentioned}/${d.total})`;
    }).join(', ');
    return summary
      ? `Platform breakdown (last 7 days): ${summary}. Visit Platform Status for API health details.`
      : `${ctx.brandName} is tracked across ${ctx.platforms.length} platforms: ${ctx.platforms.join(', ')}. Run queries to see per-platform data.`;
  }

  if (q.includes('improve') || q.includes('recommendation') || q.includes('suggest') || q.includes('how to') || q.includes('increase') || q.includes('boost')) {
    const tips: string[] = [];
    if (ctx.currentSov < 20) tips.push('Strengthen your website with clear, factual brand descriptions');
    if (ctx.currentSov < 40) tips.push('Build reviews on authoritative platforms (G2, Trustpilot, etc.)');
    if (ctx.competitors.length > 0) tips.push('Create comparison content vs ' + ctx.competitors.slice(0, 2).join(' and '));
    tips.push('Ensure consistent NAP (Name, Address, Phone) across the web');
    if (ctx.queries.length < 5) tips.push('Add more tracking queries to discover visibility gaps');
    tips.push('Check the Recommendations tab for AI-generated, data-driven action items');
    return `Here are suggestions to improve ${ctx.brandName}'s visibility (current SOV: ${ctx.currentSov}%):\n\n` +
      tips.map((t, i) => `${i + 1}. ${t}`).join('\n');
  }

  if (q.includes('sentiment')) {
    const sentData: Record<string, number> = {};
    ctx.recentData.forEach(r => {
      if (r.mentioned) sentData[r.sentiment] = (sentData[r.sentiment] || 0) + r.count;
    });
    const total = Object.values(sentData).reduce((s, v) => s + v, 0);
    if (total === 0) return 'No recent sentiment data available. Run more queries to build sentiment history.';
    const parts = Object.entries(sentData).map(([k, v]) => `${k}: ${v} (${Math.round(v / total * 100)}%)`);
    const negPct = sentData.negative ? Math.round(sentData.negative / total * 100) : 0;
    let advice = '';
    if (negPct > 30) advice = '\n\nHigh negative sentiment detected. Review the specific responses in Prompt Details to understand the concerns.';
    return `Recent sentiment for ${ctx.brandName} (last 7 days, ${total} mentions): ${parts.join(', ')}.${advice}`;
  }

  if (q.includes('query') || q.includes('prompt') || q.includes('keyword')) {
    return `${ctx.brandName} is tracking ${ctx.queries.length} queries: "${ctx.queries.slice(0, 5).join('", "')}${ctx.queries.length > 5 ? '"...' : '"'}. Visit Prompt Details for per-query visibility, sentiment, and trend data.`;
  }

  if (q.includes('trend') || q.includes('history') || q.includes('change') || q.includes('over time')) {
    const trend = ctx.sovTrend > 0 ? `increasing (+${ctx.sovTrend}%)` : ctx.sovTrend < 0 ? `decreasing (${ctx.sovTrend}%)` : 'stable';
    return `${ctx.brandName}'s SOV trend is ${trend}. You have ${ctx.totalRuns} historical runs. Visit SOV Trends for detailed charts, or Prompt Details for per-query time series.`;
  }

  if (q.includes('alert') || q.includes('notify') || q.includes('notification')) {
    return 'Configure alerts in the Alerts tab. You can set up notifications for: visibility drops, SOV falling below a threshold, brand disappearing from responses, negative sentiment spikes, and new competitor detections. Alerts can trigger in-app notifications, emails, or webhooks.';
  }

  if (q.includes('export') || q.includes('report') || q.includes('download')) {
    return 'You can export data in several ways: 1) Overview → Export CSV for mentions, 2) Prompt Details → Export CSV for prompt-level stats, 3) Recommendations → Export CSV, 4) Account → Export All (JSON). All exports are available from their respective view headers.';
  }

  return `Based on your data: ${ctx.brandName} has a ${ctx.currentSov}% share of voice across ${ctx.platforms.length} AI platforms with ${ctx.totalRuns} total runs. Ask me about:\n• SOV / visibility metrics\n• Competitor analysis\n• Platform breakdown\n• Sentiment analysis\n• How to improve\n• Trends over time\n• Alerts & notifications\n• Exporting data`;
}

export async function POST(request: NextRequest) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  try {
    const { message, brandId } = await request.json();
    if (!message || typeof message !== 'string') return Response.json({ error: 'Message required' }, { status: 400 });
    if (message.length > 500) return Response.json({ error: 'Message too long (max 500 characters)' }, { status: 400 });

    // If no brandId provided, return a helpful message
    if (!brandId) {
      return Response.json({
        reply: 'Please select a brand first so I can analyze your data. Use the brand selector at the top of the dashboard.',
        aiPowered: false,
      });
    }

    // Verify brand access
    const brandResult = await pool.query(
      `SELECT b.id, b.data FROM brands b
       WHERE b.id = $1 AND (b.user_id = $2 OR EXISTS (
         SELECT 1 FROM team_members tm WHERE tm.brand_id = b.id AND tm.user_id = $2
       ))`,
      [brandId, user.id]
    );
    if (!brandResult.rows.length) return Response.json({ error: 'Brand not found' }, { status: 404 });

    const brand = brandResult.rows[0].data || {};
    const runs = brand.runs || [];
    const lastRun = runs.length ? runs[runs.length - 1] : null;
    const sovHistory = brand.sovHistory || [];

    // Get recent diagnostics from prompt_runs
    const diagResult = await pool.query(`
      SELECT sentiment, mentioned, platform,
        COUNT(*)::int AS count
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND created_at > NOW() - INTERVAL '7 days'
      GROUP BY sentiment, mentioned, platform
    `, [brandId]);

    const ctx: BrandContext = {
      brandName: brand.name || 'Unknown Brand',
      industry: brand.industry || '',
      currentSov: lastRun ? lastRun.sov : 0,
      totalRuns: runs.length,
      platforms: lastRun ? Object.keys(lastRun.platforms || {}) : [],
      sovTrend: sovHistory.length >= 2
        ? sovHistory[sovHistory.length - 1].overall - sovHistory[sovHistory.length - 2].overall
        : 0,
      competitors: brand.competitors || [],
      queries: brand.queries || [],
      recentData: diagResult.rows,
    };

    // Try AI-powered answer first
    let reply: string | undefined;
    let aiPowered = false;

    try {
      const serverKeys = getServerKeys();
      const platformOrder = ['gemini', 'claude', 'perplexity', 'openai', 'grok'] as const;
      const platformMap: Record<string, string> = {
        gemini: 'Gemini', openai: 'ChatGPT', claude: 'Claude',
        perplexity: 'Perplexity', grok: 'Grok',
      };

      let aiPlatform: string | null = null;
      let aiKey: string | null = null;
      for (const p of platformOrder) {
        const keys = serverKeys[p];
        if (keys && keys.length > 0) {
          aiPlatform = platformMap[p];
          aiKey = keys[0];
          break;
        }
      }

      if (aiPlatform && aiKey) {
        const systemPrompt = buildCopilotPrompt(message, ctx);
        const model = await getAdminModel(aiPlatform) || getDefaultModel(aiPlatform);
        const result = await queryAI(aiPlatform, message, aiKey, model, undefined, {
          systemPrompt,
          maxTokens: 400,
        });
        if (result && result.text && result.text.trim().length > 10) {
          reply = result.text.trim();
          aiPowered = true;
        }
      }
    } catch {
      // AI call failed — fall back to rules-based
    }

    if (!reply) {
      reply = generateCopilotAnswer(message, ctx);
    }

    return Response.json({
      reply,
      aiPowered,
      context: { sov: ctx.currentSov, trend: ctx.sovTrend },
    });
  } catch {
    return Response.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
