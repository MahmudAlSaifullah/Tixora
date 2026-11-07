"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";

// Chart marks follow one spec: 2px lines, a 10% area wash, columns capped at 24px with 4px rounded
// data-ends, solid hairline grids, and text in text tokens, never the series colour. Every chart
// has a hover and keyboard tooltip, and a table view so no value is locked behind hover.

export type ValueFormat = "money" | "count";

export interface Point {
  label: string;
  value: number;
}

const SERIES_ONE = "var(--series-1)";
export const SEGMENT_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];

function formatValue(value: number, format: ValueFormat) {
  return format === "money" ? formatMoney(value) : value.toLocaleString("en-IN");
}

function compact(value: number, format: ValueFormat) {
  const major = format === "money" ? value / 100 : value;
  const prefix = format === "money" ? "৳" : "";
  if (major >= 100_000) return `${prefix}${(major / 100_000).toFixed(major >= 1_000_000 ? 0 : 1)}L`;
  if (major >= 10_000) return `${prefix}${Math.round(major / 1000)}K`;
  return `${prefix}${major.toLocaleString("en-IN")}`;
}

/** Round axis ticks, in the display unit. */
function niceTicks(max: number, format: ValueFormat, count = 4) {
  const unit = format === "money" ? 100 : 1;
  const top = Math.max(max / unit, 1);
  const rough = top / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((m) => m >= rough) ?? rough;
  const ticks: number[] = [];
  for (let tick = 0; tick <= top + step * 0.001; tick += step) ticks.push(tick * unit);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step * unit);
  return ticks;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  // Zero until measured: a guessed width would overflow narrow screens on first paint.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(entry.contentRect.width, 240)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function TableView({ data, format, valueLabel }: { data: Point[]; format: ValueFormat; valueLabel: string }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">View as table</summary>
      <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Period</th>
              <th className="px-3 py-2 text-right font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.label} className="border-t">
                <td className="px-3 py-1.5">{point.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatValue(point.value, format)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const PAD = { top: 16, right: 16, bottom: 26, left: 52 };
const PLOT_HEIGHT = 200;

function Tooltip({ x, width, label, value }: { x: number; width: number; label: string; value: string }) {
  const flip = x > width - 130;
  return (
    <div className="pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-lg" style={{ left: flip ? undefined : x + 10, right: flip ? width - x + 10 : undefined }}>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function GridAndTicks({ ticks, y, width, format }: { ticks: number[]; y: (value: number) => number; width: number; format: ValueFormat }) {
  return (
    <>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeWidth={1} />
          <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={11} fill="var(--chart-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
            {compact(tick, format)}
          </text>
        </g>
      ))}
    </>
  );
}

function xLabelStride(count: number, width: number) {
  const fit = Math.max(Math.floor((width - PAD.left - PAD.right) / 58), 1);
  return Math.max(Math.ceil(count / fit), 1);
}

/** Single-series change over time: a 2px line with an area wash and crosshair tooltip. */
export function LineChart({ data, format, valueLabel, ariaLabel }: { data: Point[]; format: ValueFormat; valueLabel: string; ariaLabel: string }) {
  const { ref, width } = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const height = PLOT_HEIGHT + PAD.top + PAD.bottom;
  const max = useMemo(() => Math.max(...data.map((d) => d.value), 0), [data]);
  const ticks = useMemo(() => niceTicks(max, format), [max, format]);
  const top = ticks[ticks.length - 1] || 1;
  const innerWidth = width - PAD.left - PAD.right;
  const x = (index: number) => PAD.left + (data.length > 1 ? (index / (data.length - 1)) * innerWidth : innerWidth / 2);
  const y = (value: number) => PAD.top + PLOT_HEIGHT - (value / top) * PLOT_HEIGHT;
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = data.length ? `${line} L${x(data.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : "";
  const stride = xLabelStride(data.length, width);
  const last = data.length - 1;
  const shown = active ?? null;

  function pointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left - PAD.left) / innerWidth;
    setActive(Math.min(Math.max(Math.round(ratio * last), 0), last));
  }
  function keyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight") setActive((a) => Math.min((a ?? -1) + 1, last));
    if (event.key === "ArrowLeft") setActive((a) => Math.max((a ?? last + 1) - 1, 0));
  }

  return (
    <div>
      <div ref={ref} className="relative min-w-0" style={{ minHeight: height }}>
        {width > 0 && <svg width={width} height={height} role="img" aria-label={ariaLabel} tabIndex={0} className="block rounded outline-none focus-visible:ring-2 focus-visible:ring-ring" onPointerMove={pointerMove} onPointerLeave={() => setActive(null)} onFocus={() => setActive(last)} onBlur={() => setActive(null)} onKeyDown={keyDown}>
          <GridAndTicks ticks={ticks} y={y} width={width} format={format} />
          <path d={area} fill={SERIES_ONE} fillOpacity={0.1} />
          <path d={line} fill="none" stroke={SERIES_ONE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) =>
            i % stride === 0 ? (
              <text key={d.label} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : "middle"} fontSize={11} fill="var(--chart-muted)">
                {d.label}
              </text>
            ) : null,
          )}
          {shown !== null && data[shown] && (
            <>
              <line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={y(0)} stroke="var(--chart-axis)" strokeWidth={1} />
              <circle cx={x(shown)} cy={y(data[shown].value)} r={5} fill={SERIES_ONE} stroke="var(--card)" strokeWidth={2} />
            </>
          )}
        </svg>}
        {shown !== null && data[shown] && <Tooltip x={x(shown)} width={width} label={data[shown].label} value={`${formatValue(data[shown].value, format)} ${format === "count" ? valueLabel.toLowerCase() : ""}`} />}
      </div>
      <TableView data={data} format={format} valueLabel={valueLabel} />
    </div>
  );
}

/** Single-series magnitude per period: thin columns from one baseline, value on hover. */
export function ColumnChart({ data, format, valueLabel, ariaLabel }: { data: Point[]; format: ValueFormat; valueLabel: string; ariaLabel: string }) {
  const { ref, width } = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const height = PLOT_HEIGHT + PAD.top + PAD.bottom;
  const max = useMemo(() => Math.max(...data.map((d) => d.value), 0), [data]);
  const ticks = useMemo(() => niceTicks(max, format), [max, format]);
  const top = ticks[ticks.length - 1] || 1;
  const innerWidth = width - PAD.left - PAD.right;
  const band = data.length ? innerWidth / data.length : innerWidth;
  const barWidth = Math.min(24, Math.max(band - 6, 4));
  const y = (value: number) => PAD.top + PLOT_HEIGHT - (value / top) * PLOT_HEIGHT;
  const stride = xLabelStride(data.length, width);
  const radius = Math.min(4, barWidth / 2);

  return (
    <div>
      <div ref={ref} className="relative min-w-0" style={{ minHeight: height }}>
        {width > 0 && <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
          <GridAndTicks ticks={ticks} y={y} width={width} format={format} />
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const barTop = y(d.value);
            const base = y(0);
            const r = Math.min(radius, base - barTop);
            const left = cx - barWidth / 2;
            const right = cx + barWidth / 2;
            return (
              <g key={d.label}>
                {d.value > 0 && <path d={`M${left},${base} V${barTop + r} Q${left},${barTop} ${left + r},${barTop} H${right - r} Q${right},${barTop} ${right},${barTop + r} V${base} Z`} fill={SERIES_ONE} fillOpacity={active === null || active === i ? 1 : 0.55} />}
                {i % stride === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--chart-muted)">
                    {d.label}
                  </text>
                )}
                {/* The hit area is the whole band, far larger than the mark itself. */}
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={PLOT_HEIGHT} fill="transparent" tabIndex={0} aria-label={`${d.label}: ${formatValue(d.value, format)}`} className="outline-none" onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} />
              </g>
            );
          })}
        </svg>}
        {active !== null && data[active] && <Tooltip x={PAD.left + band * active + band / 2} width={width} label={data[active].label} value={formatValue(data[active].value, format)} />}
      </div>
      <TableView data={data} format={format} valueLabel={valueLabel} />
    </div>
  );
}

export interface RankedRow {
  label: string;
  sublabel?: string;
  value: number;
  /** Replaces the formatted value at the bar's tip. */
  display?: string;
}

/** Ranked horizontal bars. One colour, values printed at the tip, so nothing depends on hover. */
export function RankedBars({ rows, format, emptyText = "No sales yet." }: { rows: RankedRow[]; format: ValueFormat; emptyText?: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={`${row.label}-${row.sublabel ?? ""}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {row.label}
              {row.sublabel && <span className="ml-1.5 text-xs text-muted-foreground">{row.sublabel}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{row.display ?? formatValue(row.value, format)}</span>
          </div>
          <div className="mt-1.5 h-2">
            <div className="h-full rounded-r bg-[var(--series-1)]" style={{ width: `${Math.max((row.value / max) * 100, row.value > 0 ? 1 : 0)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One whole split into parts: a tall segmented bar plus a legend and table. */
export function SegmentedBar({ parts, format, emptyText = "No payments yet." }: { parts: { label: string; value: number }[]; format: ValueFormat; emptyText?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (total === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  // A ninth category would need a generated hue, so the tail folds into "Other".
  const shown = parts.length <= 8 ? parts : [...parts.slice(0, 7), { label: "Other", value: parts.slice(7).reduce((sum, p) => sum + p.value, 0) }];
  const share = (value: number) => `${Math.round((value / total) * 100)}%`;
  return (
    <div>
      <div className="flex gap-0.5" role="img" aria-label={shown.map((p) => `${p.label} ${share(p.value)}`).join(", ")}>
        {shown.map((part, index) => {
          const percent = (part.value / total) * 100;
          if (percent === 0) return null;
          const dark = SEGMENT_COLORS[index] === "var(--series-4)";
          return (
            <div
              key={part.label}
              className="relative flex h-7 min-w-0 items-center rounded px-1.5 text-xs font-medium"
              style={{ width: `${percent}%`, background: SEGMENT_COLORS[index], color: dark ? "#0b0b0b" : "#ffffff", opacity: active === null || active === index ? 1 : 0.6 }}
              onPointerEnter={() => setActive(index)}
              onPointerLeave={() => setActive(null)}
              title={`${part.label}: ${formatValue(part.value, format)} (${share(part.value)})`}
            >
              {percent >= 12 && share(part.value)}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        {shown.map((part, index) => (
          <li key={part.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: SEGMENT_COLORS[index] }} aria-hidden />
              <span className="truncate">{part.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatValue(part.value, format)} · {share(part.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Progress against a whole, with the unfilled track in a lighter step of the same family. */
export function Meter({ ratio, label }: { ratio: number; label: string }) {
  const percent = Math.round(ratio * 100);
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--series-1)_22%,transparent)]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
