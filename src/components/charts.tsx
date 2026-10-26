"use client";

import { formatCompactMoney, formatMinor } from "@/lib/format";
import type { Dashboard } from "@/lib/types";

export function CashflowChart({ series }: { series: Dashboard["series"] }) {
  const width = 720;
  const height = 268;
  const padding = { top: 22, right: 16, bottom: 38, left: 58 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...series.flatMap((entry) => [
      Number(entry.revenueMinor),
      Number(entry.expensesMinor),
      Number(entry.ownerDrawMinor),
    ]),
  );
  const tickCount = 4;
  const tickStep = maxValue / tickCount;
  const barGroup = innerWidth / Math.max(series.length, 1);
  const barWidth = Math.min(20, barGroup * 0.22);
  const hasData = series.some(
    (entry) =>
      BigInt(entry.revenueMinor) > 0n || BigInt(entry.expensesMinor) > 0n || BigInt(entry.ownerDrawMinor) > 0n,
  );

  return (
    <div className="chart-wrap">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="legend-income" />Revenue</span>
        <span><i className="legend-expense" />Expenses</span>
        <span><i className="legend-draw" />Owner draws</span>
      </div>
      <svg
        className="cashflow-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Revenue, expenses and owner draws over the last six months"
      >
        {Array.from({ length: tickCount + 1 }, (_, index) => {
          const value = tickStep * index;
          const y = padding.top + innerHeight - (index / tickCount) * innerHeight;
          return (
            <g key={index}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                className="chart-grid"
              />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="chart-tick">
                {index === 0 ? "R0" : formatCompactMoney(BigInt(Math.round(value)))}
              </text>
            </g>
          );
        })}
        {series.map((entry, index) => {
          const centre = padding.left + barGroup * index + barGroup / 2;
          const revenueHeight = (Number(entry.revenueMinor) / maxValue) * innerHeight;
          const expenseHeight = (Number(entry.expensesMinor) / maxValue) * innerHeight;
          const drawHeight = (Number(entry.ownerDrawMinor) / maxValue) * innerHeight;
          const base = padding.top + innerHeight;
          const gap = 3;
          const totalWidth = barWidth * 3 + gap * 2;
          const start = centre - totalWidth / 2;
          return (
            <g key={entry.month}>
              <rect
                x={start}
                y={base - revenueHeight}
                width={barWidth}
                height={Math.max(revenueHeight, 0)}
                rx={4}
                className="bar-income"
              >
                <title>{`${entry.fullLabel} revenue: ${formatMinor(entry.revenueMinor)}`}</title>
              </rect>
              <rect
                x={start + barWidth + gap}
                y={base - expenseHeight}
                width={barWidth}
                height={Math.max(expenseHeight, 0)}
                rx={4}
                className="bar-expense"
              >
                <title>{`${entry.fullLabel} expenses: ${formatMinor(entry.expensesMinor)}`}</title>
              </rect>
              <rect
                x={start + (barWidth + gap) * 2}
                y={base - drawHeight}
                width={barWidth}
                height={Math.max(drawHeight, 0)}
                rx={4}
                className="bar-draw"
              >
                <title>{`${entry.fullLabel} owner draws: ${formatMinor(entry.ownerDrawMinor)}`}</title>
              </rect>
              <text x={centre} y={height - 12} textAnchor="middle" className="chart-label">
                {entry.label}
              </text>
            </g>
          );
        })}
        {!hasData && (
          <text x={width / 2} y={padding.top + innerHeight / 2} textAnchor="middle" className="chart-empty">
            Log a few transactions to see your cash flow trend
          </text>
        )}
      </svg>
    </div>
  );
}

export function ScoreRing({ score, size = 148 }: { score: number; size?: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;
  const tone = clamped >= 75 ? "strong" : clamped >= 45 ? "steady" : "early";
  return (
    <div className={`score-ring score-${tone}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" role="img" aria-label={`Funding readiness score ${clamped} out of 100`}>
        <circle cx="50" cy="50" r={radius} className="ring-track" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="ring-value"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="score-ring-label">
        <strong>{clamped}</strong>
        <span>/100</span>
      </div>
    </div>
  );
}

export function CategoryBars({ categories }: { categories: Dashboard["categories"] }) {
  if (categories.length === 0) {
    return <p className="muted">No expenses recorded this month yet.</p>;
  }
  const max = Math.max(...categories.map((entry) => Number(entry.amountMinor)), 1);
  return (
    <ul className="category-bars">
      {categories.map((entry) => (
        <li key={entry.category}>
          <div className="category-line">
            <span>{entry.category}</span>
            <strong>{formatMinor(entry.amountMinor, { cents: false })}</strong>
          </div>
          <div className="bar-track">
            <span style={{ width: `${Math.max(3, (Number(entry.amountMinor) / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MiniTrend({ values }: { values: number[] }) {
  const width = 96;
  const height = 30;
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="mini-trend" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
