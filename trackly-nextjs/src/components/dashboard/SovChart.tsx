'use client';

import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface SovDataPoint {
  date: string;
  sov: number;
  platforms?: Record<string, number>;
}

const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: '#19c37d',
  Perplexity: '#20b8cd',
  Claude: '#d97706',
  Gemini: '#4285f4',
  Grok: '#1d9bf0',
};

export default function SovChart({ data }: { data: SovDataPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !data.length) return;

    if (chartRef.current) chartRef.current.destroy();

    const labels = data.map(d => {
      const date = new Date(d.date);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    const datasets = [
      {
        label: 'Overall SOV',
        data: data.map(d => d.sov),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79,70,229,0.1)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
      },
      ...Object.entries(PLATFORM_COLORS).map(([platform, color]) => ({
        label: platform,
        data: data.map(d => d.platforms?.[platform] ?? null),
        borderColor: color,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [4, 4],
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 4,
      })),
    ];

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#71717a', font: { size: 11 }, boxWidth: 12, padding: 16 },
          },
          tooltip: {
            backgroundColor: '#1a1a2e',
            titleColor: '#e4e4e7',
            bodyColor: '#a1a1aa',
            borderColor: '#27272a',
            borderWidth: 1,
            padding: 10,
            callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%` },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(39,39,42,0.5)' },
            ticks: { color: '#71717a', font: { size: 10 } },
          },
          y: {
            min: 0, max: 100,
            grid: { color: 'rgba(39,39,42,0.5)' },
            ticks: { color: '#71717a', font: { size: 10 }, callback: (v) => `${v}%` },
          },
        },
      },
    });

    return () => { chartRef.current?.destroy(); };
  }, [data]);

  if (!data.length) return null;

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Share of Voice Over Time</h3>
      <div style={{ height: '300px' }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
