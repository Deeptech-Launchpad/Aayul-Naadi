import type { Status } from "@/lib/metrics";

/**
 * Charts are hand-drawn SVG rather than a charting library: the shapes here
 * are simple, the bundle stays small, and every colour comes from the same
 * token set as the rest of the interface.
 */

const STATUS_STROKE: Record<Status, string> = {
  in_range: "var(--ok)",
  above: "var(--high)",
  below: "var(--low)",
  unknown: "var(--txt-3)",
};

const STATUS_FILL: Record<Status, string> = {
  in_range: "var(--ok-bg)",
  above: "var(--high-bg)",
  below: "var(--low-bg)",
  unknown: "var(--surface-2)",
};

function project(values: number[], width: number, height: number, pad = 3) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, i) => ({
    x: values.length > 1 ? i * step : width / 2,
    y: pad + (1 - (value - min) / span) * (height - pad * 2),
  }));
}

export function Sparkline({
  values,
  status = "in_range",
  width = 104,
  height = 28,
}: {
  values: number[];
  status?: Status;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return (
      <svg className="sp" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--line)"
          strokeWidth="1.4"
          strokeDasharray="3 4"
        />
      </svg>
    );
  }
  const points = project(values, width, height);
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `M${line.split(" ").join(" L")} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg className="sp" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={area} fill={STATUS_FILL[status]} />
      <polyline
        points={line}
        fill="none"
        stroke={STATUS_STROKE[status]}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="2.2" fill={STATUS_STROKE[status]} />
    </svg>
  );
}

export function TrendChart({
  points,
  status = "in_range",
  band,
  unit,
  fromLabel,
  toLabel,
}: {
  points: Array<{ at: Date; value: number }>;
  status?: Status;
  band?: { low?: number | null; high?: number | null };
  unit?: string;
  fromLabel?: string;
  toLabel?: string;
}) {
  const width = 300;
  const height = 132;
  const padTop = 12;
  const padBottom = 22;
  const plotHeight = height - padTop - padBottom;

  if (points.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "26px 12px" }}>
        No readings in this window yet.
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const bandValues = [band?.low, band?.high].filter((v): v is number => v != null);
  const min = Math.min(...values, ...bandValues);
  const max = Math.max(...values, ...bandValues);
  const pad = (max - min) * 0.12 || Math.max(Math.abs(max) * 0.05, 1);
  const lo = min - pad;
  const hi = max + pad;
  const scaleY = (value: number) => padTop + (1 - (value - lo) / (hi - lo || 1)) * plotHeight;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: points.length > 1 ? i * step : width / 2,
    y: scaleY(p.value),
  }));
  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `M${line.split(" ").join(" L")} L${width},${padTop + plotHeight} L0,${padTop + plotHeight} Z`;
  const last = coords[coords.length - 1];

  const bandTop = band?.high != null ? scaleY(band.high) : null;
  const bandBottom = band?.low != null ? scaleY(band.low) : null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 140, display: "block" }} role="img" aria-label="Trend over the selected window">
      {bandTop != null && bandBottom != null && (
        <>
          <rect x="0" y={bandTop} width={width} height={Math.max(bandBottom - bandTop, 1)} fill="var(--ok-bg)" />
          <text x="4" y={bandTop - 3} fontFamily="var(--f-mono)" fontSize="7.5" fill="var(--ok)" letterSpacing="0.1em">
            IN RANGE
          </text>
        </>
      )}
      {bandTop != null && (
        <line x1="0" y1={bandTop} x2={width} y2={bandTop} stroke="var(--line)" strokeWidth="0.7" strokeDasharray="3 3" />
      )}
      {bandBottom != null && (
        <line x1="0" y1={bandBottom} x2={width} y2={bandBottom} stroke="var(--line)" strokeWidth="0.7" strokeDasharray="3 3" />
      )}

      <path d={area} fill={STATUS_FILL[status]} opacity="0.5" />
      <polyline points={line} fill="none" stroke={STATUS_STROKE[status]} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="5.5" fill={STATUS_STROKE[status]} opacity="0.2" />
      <circle cx={last.x} cy={last.y} r="3" fill={STATUS_STROKE[status]} />

      <text x="2" y={height - 6} fontFamily="var(--f-mono)" fontSize="7.5" fill="var(--txt-3)" letterSpacing="0.1em">
        {fromLabel ?? ""}
      </text>
      <text x={width - 2} y={height - 6} textAnchor="end" fontFamily="var(--f-mono)" fontSize="7.5" fill="var(--txt-3)" letterSpacing="0.1em">
        {toLabel ?? ""}
      </text>
      <text x={width - 2} y={padTop - 3} textAnchor="end" fontFamily="var(--f-mono)" fontSize="7.5" fill="var(--txt-3)">
        {unit ?? ""}
      </text>
    </svg>
  );
}

/** Where a single value sits against its reference interval. */
export function RangeBar({
  value,
  low,
  high,
  status,
}: {
  value: number;
  low?: number | null;
  high?: number | null;
  status: Status;
}) {
  const width = 260;
  const barY = 11;
  const barH = 8;

  const lo = low ?? (high != null ? high * 0.4 : value * 0.5);
  const hi = high ?? (low != null ? low * 2.2 : value * 1.5);
  const axisMin = Math.min(lo * 0.5, value * 0.85);
  const axisMax = Math.max(hi * 1.25, value * 1.15);
  const scale = (v: number) => ((v - axisMin) / (axisMax - axisMin || 1)) * width;

  const lowX = Math.max(0, Math.min(width, scale(lo)));
  const highX = Math.max(0, Math.min(width, scale(hi)));
  const valueX = Math.max(4, Math.min(width - 4, scale(value)));

  return (
    <svg viewBox={`0 0 ${width} 30`} style={{ width: "100%", height: 30, display: "block" }} role="img" aria-label="Value against reference range">
      {low != null && <rect x="0" y={barY} width={lowX} height={barH} rx={barH / 2} fill="var(--low-bg)" />}
      <rect x={low != null ? lowX : 0} y={barY} width={Math.max((high != null ? highX : width) - (low != null ? lowX : 0), 2)} height={barH} rx={barH / 2} fill="var(--ok-bg)" />
      {high != null && <rect x={highX} y={barY} width={Math.max(width - highX, 2)} height={barH} rx={barH / 2} fill="var(--high-bg)" />}
      <circle cx={valueX} cy={barY + barH / 2} r="5.5" fill={STATUS_STROKE[status]} />
      <text x={valueX} y={barY - 4} textAnchor="middle" fontFamily="var(--f-mono)" fontSize="7.5" fill={STATUS_STROKE[status]}>
        YOU
      </text>
      {low != null && (
        <text x={lowX} y="29" textAnchor="middle" fontFamily="var(--f-mono)" fontSize="7.5" fill="var(--txt-3)">
          {low}
        </text>
      )}
      {high != null && (
        <text x={highX} y="29" textAnchor="middle" fontFamily="var(--f-mono)" fontSize="7.5" fill="var(--txt-3)">
          {high}
        </text>
      )}
    </svg>
  );
}

/** Adherence over N days — one cell per scheduled day. */
export function AdherenceGrid({ days }: { days: Array<"taken" | "missed" | "none"> }) {
  const colour = { taken: "var(--ok)", missed: "var(--watch)", none: "var(--surface-3)" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(15, 1fr)", gap: 3 }}>
      {days.map((day, i) => (
        <i key={i} style={{ height: 15, borderRadius: 3, background: colour[day], display: "block" }} />
      ))}
    </div>
  );
}
