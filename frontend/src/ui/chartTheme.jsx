// Recharts styling shared by every plate, so axes, grids and tooltips match.

// Surfaces wear their court colours: blue hard, orange clay, green grass. The
// overall rating is the combined line, so it takes the neutral stardust ink
// instead of a hue. The four hues pass the palette validator against the plate
// surface (#0f1930) on every pair, not just neighbours (worst colour-blind
// ΔE 8.1): clay and grass are a red/green pair, so they are split by lightness
// (light clay, deep grass) as well as hue. Grass stays well clear of the UI
// emerald, which means "the model", not a surface. Every line still carries a
// direct end label, so identity never rides on colour alone.
export const SURFACE_COLORS = {
  overall: "#eef0e8",
  Clay: "#dc7533",
  Hard: "#4081d2",
  Grass: "#307609",
  Carpet: "#bc5694",
};
export const SURFACE_ORDER = ["overall", "Clay", "Hard", "Grass", "Carpet"];

export const INK = {
  star: "#eef0e8",
  mist: "#b9c2d0",
  fog: "#8a95a8",
  rule: "#24374f",
  ruleSoft: "#1a2944",
  emerald: "#34d399",
  ember: "#e8765a",
  plate: "#0f1930",
};

export const axisProps = {
  stroke: INK.rule,
  tick: { fill: INK.fog, fontSize: 11, fontFamily: "Barlow" },
  tickLine: { stroke: INK.rule },
  axisLine: { stroke: INK.rule },
};

export const gridProps = {
  stroke: INK.ruleSoft,
  strokeDasharray: "2 4",
};

// Tooltip as a small ephemeris card. `rows` maps a payload to [label, value, color?].
export function AtlasTooltip({ active, payload, label, title, rows }) {
  if (!active || !payload || payload.length === 0) return null;
  const items = rows ? rows(payload, label) : payload.map((p) => [p.name, p.value, p.color]);
  return (
    <div className="min-w-44 border border-rule bg-night/95 px-3 py-2.5 text-xs shadow-[0_8px_24px_rgb(0_0_0/0.45)]">
      <div className="caps mb-1.5 text-mist">{title ? title(label, payload) : label}</div>
      <dl>
        {items
          .filter((r) => r && r[1] !== null && r[1] !== undefined)
          .map(([k, v, color]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-0.5">
              <dt className="flex items-center gap-1.5 text-fog">
                {color && <span className="size-2 rounded-full" style={{ background: color }} />}
                {k}
              </dt>
              <dd className="tabular-nums text-star">{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

export function downsample(rows, max = 400) {
  const step = Math.max(1, Math.floor(rows.length / max));
  const out = rows.filter((_, i) => i % step === 0);
  if (rows.length && out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
  return out;
}

// Dates become timestamps so charts plot on a true time scale: a year is the
// same width whether it holds ten rating points or two hundred.
export function toTime(date) {
  return Date.parse(`${date}T00:00:00Z`);
}

// 1 January of each year inside [min, max], thinned to fit the plot width.
export function yearTicks(min, max, maxTicks = window.innerWidth < 640 ? 5 : 10) {
  const first = new Date(min).getUTCFullYear() + 1;
  const last = new Date(max).getUTCFullYear();
  const years = [];
  for (let y = first; y <= last; y++) years.push(y);
  const step = Math.max(1, Math.ceil(years.length / maxTicks));
  return years.filter((y) => (last - y) % step === 0).map((y) => Date.UTC(y, 0, 1));
}

export function yearTick(t) {
  return new Date(t).getUTCFullYear();
}

export function dateLabel(t) {
  return new Date(t).toISOString().slice(0, 10);
}

// Evenly stepped y ticks on a "nice" step, with the domain snapped to it.
export function niceTicks(min, max, target = 5) {
  const span = Math.max(1, max - min);
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t));
  return { domain: [lo, hi], ticks };
}


// The focus reticle: a ring with four ticks, drawn on whatever is under the eye.
export function ReticleMark({ cx, cy, r }) {
  return (
    <g stroke={INK.emerald} strokeWidth="1.25" fill="none" pointerEvents="none">
      <circle cx={cx} cy={cy} r={r} />
      <path d={`M${cx} ${cy - r - 6}v6M${cx} ${cy + r}v6M${cx - r - 6} ${cy}h6M${cx + r} ${cy}h6`} />
    </g>
  );
}
