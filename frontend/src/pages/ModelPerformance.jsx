import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { ErrorState, LoadingState, MagnitudeLegend, PageHeading, Plate, Reading, Readings, pct } from "../ui/atlas";
import { INK, ReticleMark } from "../ui/chartTheme";
import { useWidth } from "../ui/useWidth";

const THIN_EVIDENCE = 200; // calibration buckets below this many matches are drawn hollow

export default function ModelPerformance() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    api.getModelPerformance().then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <PageHeading title="Model performance">
        XGBoost over Elo, ranking, form and serve features, scored on ATP matches from 2024 onward that it never saw
        in training or validation. Every number here comes from that held-out set.
      </PageHeading>
      {error ? (
        <Plate>
          <ErrorState title="Couldn't load the backtest" error={error} onRetry={load} />
        </Plate>
      ) : !data ? (
        <Plate>
          <LoadingState label="Scoring the backtest" />
        </Plate>
      ) : (
        <Report data={data} />
      )}
    </>
  );
}

function Report({ data }) {
  const [hovered, setHovered] = useState(null);
  const first = data.rolling[0]?.period;
  const last = data.rolling[data.rolling.length - 1]?.period;

  return (
    <div className="space-y-8">
      <Plate title="Accuracy against the baselines" bodyClassName="grid grid-cols-1 gap-8 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <AccuracyRuler
            model={data.overall_accuracy}
            rank={data.baseline_rank_accuracy}
            elo={data.baseline_elo_accuracy}
          />
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-mist text-pretty">
            A modest edge, and an expected one: ranking and Elo already call most matches correctly. The bigger gain
            is that the model gives <span className="text-star">probabilities you can trust</span>, where a baseline
            only gives a pick. The calibration plate below shows how closely they hold up.
          </p>
        </div>
        <Readings className="self-start">
          <Reading label="Log-loss" value={data.overall_log_loss.toFixed(3)} note="lower is better" />
          <Reading label="Test matches" value={data.n_test_matches.toLocaleString()} />
          <Reading label="Test window" value={`${monthLabel(first)} – ${monthLabel(last)}`} />
          <Reading label="Model" value={data.model_version} />
          <Reading label="Split" value="Temporal" note="never random" />
        </Readings>
      </Plate>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Plate
          title="Calibration"
          aside={<MagnitudeLegend steps={[200, 800, 1600]} radius={(n) => bucketRadius(n, maxCount(data))} />}
        >
          <CalibrationChart buckets={data.calibration} hovered={hovered} onHover={setHovered} />
        </Plate>
        <Plate title="Calibration by bucket" bodyClassName="px-5 pb-5 pt-3 sm:px-6">
          <CalibrationTable buckets={data.calibration} hovered={hovered} onHover={setHovered} />
        </Plate>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Plate title="Month by month" aside={<SeriesKey />}>
          <RollingChart rolling={data.rolling} />
        </Plate>
        <Plate title="Confusion at a 0.50 threshold">
          <Confusion cm={data.confusion_matrix} />
        </Plate>
      </div>
    </div>
  );
}

// ---- Accuracy ruler ------------------------------------------------------
// The signature: baseline and model plotted on one measured scale, so the
// size of the edge is shown at its true (small) size.

function AccuracyRuler({ model, rank, elo }) {
  const [ref, width] = useWidth(800);
  const values = [model, rank, elo].filter((v) => typeof v === "number").map((v) => v * 100);
  // Fixed 60–70% window (widened only if a value falls outside), so the edge
  // is drawn at an honest scale rather than zoomed to look bigger.
  const lo = Math.min(60, Math.floor(Math.min(...values) - 1));
  const hi = Math.max(70, Math.ceil(Math.max(...values) + 1));
  const padX = 16;
  const span = width - padX * 2;
  const xp = (pts) => padX + ((pts - lo) / (hi - lo)) * span;
  const x = (v) => xp(v * 100);
  const axisY = 104;
  const height = 176;
  const edge = (model - rank) * 100;
  const pxPerPt = span / (hi - lo);
  const labelEvery = pxPerPt < 40 ? 2 : 1;
  const marks = values.map((v) => xp(v));
  const ticks = [];
  for (let t = lo; t <= hi + 1e-9; t += 0.5) ticks.push(Math.round(t * 10) / 10);

  return (
    <div ref={ref} className="w-full min-w-0">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Model accuracy ${pct(model)} against higher-rank baseline ${pct(rank)}${
          elo ? ` and higher-Elo baseline ${pct(elo)}` : ""
        }, on a 60 to 70 percent scale`}
        className="block overflow-visible"
      >
        {/* bracket: the measured edge over the rank baseline */}
        <path d={`M${x(rank)} 40 V32 H${x(model)} V40`} fill="none" stroke={INK.emerald} strokeWidth="1" opacity="0.7" />
        <text
          x={Math.min(width - 50, Math.max(50, (x(rank) + x(model)) / 2))}
          y={20}
          textAnchor="middle"
          className="fill-emerald"
          style={{ fontSize: 20, fontWeight: 500 }}
        >
          {edge >= 0 ? "+" : "−"}
          {Math.abs(edge).toFixed(1)} pts
        </text>

        {/* scale */}
        <line x1={padX} x2={width - padX} y1={axisY} y2={axisY} stroke={INK.fog} strokeWidth="1" />
        {ticks.map((t) => {
          const major = Number.isInteger(t);
          const tx = xp(t);
          const labelled = major && (t - lo) % labelEvery === 0;
          // never print a scale label underneath a plotted mark
          const clear = marks.every((mx) => Math.abs(mx - tx) > 13);
          return (
            <g key={t}>
              <line x1={tx} x2={tx} y1={axisY} y2={axisY + (major ? 9 : 4)} stroke={major ? INK.mist : INK.rule} />
              {labelled && clear && (
                <text x={tx} y={axisY + 24} textAnchor="middle" style={{ fontSize: 11 }} fill={INK.fog}>
                  {t}%
                </text>
              )}
            </g>
          );
        })}

        {/* baselines: hollow reticles. Elo labelled above-left, rank below-left. */}
        {elo && (
          <BaselineMark x={x(elo)} y={axisY} label="Higher Elo" value={pct(elo)} placement="above" />
        )}
        <BaselineMark x={x(rank)} y={axisY} label="Higher rank" value={pct(rank)} placement="below" />

        {/* model: the star on the scale */}
        <g>
          <line x1={x(model)} x2={x(model)} y1={46} y2={axisY - 12} stroke={INK.emerald} strokeWidth="1" strokeDasharray="2 3" />
          <path
            transform={`translate(${x(model) - 12} ${axisY - 12})`}
            d="M12 0 14.2 9.8 24 12 14.2 14.2 12 24 9.8 14.2 0 12 9.8 9.8Z"
            fill={INK.emerald}
            stroke={INK.plate}
            strokeWidth="1.5"
          />
          <text
            x={x(model) + (x(model) > width - 110 ? -16 : 16)}
            y={axisY - 18}
            textAnchor={x(model) > width - 110 ? "end" : "start"}
            style={{ fontSize: 13 }}
            fill={INK.star}
          >
            Model <tspan fontWeight="600">{pct(model)}</tspan>
          </text>
        </g>
      </svg>
    </div>
  );
}

function BaselineMark({ x, y, label, value, placement }) {
  const above = placement === "above";
  const ly = above ? y - 34 : y + 46;
  return (
    <g>
      <line x1={x} x2={x - 10} y1={above ? y - 9 : y + 9} y2={above ? ly + 4 : ly - 12} stroke={INK.fog} strokeWidth="1" />
      <circle cx={x} cy={y} r="5" fill={INK.plate} stroke={INK.star} strokeWidth="1.5" />
      <path d={`M${x} ${y - 9}v3M${x} ${y + 6}v3M${x - 9} ${y}h3M${x + 6} ${y}h3`} stroke={INK.star} strokeWidth="1.25" />
      <text x={x - 14} y={ly} textAnchor="end" style={{ fontSize: 12 }} fill={INK.mist}>
        {label} <tspan fill={INK.star} fontWeight="600">{value}</tspan>
      </text>
    </g>
  );
}

// ---- Calibration ---------------------------------------------------------

function maxCount(data) {
  return Math.max(...data.calibration.map((c) => c.count));
}
function bucketRadius(n, max) {
  return 3 + 10 * Math.sqrt(n / max);
}

function CalibrationChart({ buckets, hovered, onHover }) {
  const [ref, width] = useWidth(560);
  const size = Math.min(width, 560);
  const m = { top: 12, right: 16, bottom: 48, left: 52 };
  const inner = size - m.left - m.right;
  const height = inner + m.top + m.bottom;
  const sx = (v) => m.left + v * inner;
  const sy = (v) => m.top + (1 - v) * inner;
  const max = Math.max(...buckets.map((b) => b.count));
  const grid = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const active = hovered !== null ? buckets[hovered] : null;

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg width={size} height={height} role="img" aria-label="Calibration curve: predicted probability against observed win rate" className="mx-auto block">
        <defs>
          <radialGradient id="star-fill">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor={INK.star} />
            <stop offset="100%" stopColor="#c9cfd9" />
          </radialGradient>
        </defs>
        {grid.map((g) => (
          <g key={g}>
            <line x1={sx(g)} x2={sx(g)} y1={sy(0)} y2={sy(1)} stroke={INK.ruleSoft} strokeWidth="1" />
            <line x1={sx(0)} x2={sx(1)} y1={sy(g)} y2={sy(g)} stroke={INK.ruleSoft} strokeWidth="1" />
            {g * 10 === Math.round(g * 10) && Math.round(g * 10) % 2 === 0 && (
              <>
                <text x={sx(g)} y={sy(0) + 18} textAnchor="middle" style={{ fontSize: 11 }} fill={INK.fog}>
                  {Math.round(g * 100)}%
                </text>
                <text x={sx(0) - 10} y={sy(g) + 4} textAnchor="end" style={{ fontSize: 11 }} fill={INK.fog}>
                  {Math.round(g * 100)}%
                </text>
              </>
            )}
          </g>
        ))}
        <rect x={sx(0)} y={sy(1)} width={inner} height={inner} fill="none" stroke={INK.rule} />
        <text x={sx(0.5)} y={height - 6} textAnchor="middle" className="caps" style={{ fontSize: 10.5 }} fill={INK.fog}>
          Predicted win probability
        </text>
        <text
          transform={`translate(13 ${sy(0.5)}) rotate(-90)`}
          textAnchor="middle"
          className="caps"
          style={{ fontSize: 10.5 }}
          fill={INK.fog}
        >
          Observed win rate
        </text>

        {/* perfect calibration */}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke={INK.mist} strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
        <text
          transform={`translate(${sx(0.72) + 14} ${sy(0.72) + 14}) rotate(-45)`}
          textAnchor="middle"
          style={{ fontSize: 11, fontStyle: "italic", fontFamily: "EB Garamond" }}
          fill={INK.mist}
        >
          perfectly calibrated
        </text>

        {/* path through the buckets */}
        <polyline
          points={buckets.map((b) => `${sx(b.predicted_mean)},${sy(b.actual_win_rate)}`).join(" ")}
          fill="none"
          stroke={INK.emerald}
          strokeWidth="1.5"
          opacity={active ? 0.25 : 0.6}
          style={{ transition: "opacity 200ms" }}
        />

        {buckets.map((b, i) => {
          const r = bucketRadius(b.count, max);
          const thin = b.count < THIN_EVIDENCE;
          const isActive = hovered === i;
          const dim = hovered !== null && !isActive;
          return (
            <g
              key={i}
              style={{ opacity: dim ? 0.3 : 1, transition: "opacity 200ms" }}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
            >
              {/* residual: how far the bucket sits off the diagonal */}
              <line
                x1={sx(b.predicted_mean)}
                x2={sx(b.predicted_mean)}
                y1={sy(b.predicted_mean)}
                y2={sy(b.actual_win_rate)}
                stroke={INK.ember}
                strokeWidth="1.5"
              />
              <circle
                cx={sx(b.predicted_mean)}
                cy={sy(b.actual_win_rate)}
                r={r}
                fill={thin ? INK.plate : "url(#star-fill)"}
                stroke={thin ? INK.star : INK.plate}
                strokeWidth={thin ? 1.5 : 2}
              />
              {isActive && <ReticleMark cx={sx(b.predicted_mean)} cy={sy(b.actual_win_rate)} r={r + 7} />}
              {/* generous hit target */}
              <circle cx={sx(b.predicted_mean)} cy={sy(b.actual_win_rate)} r={Math.max(r + 8, 16)} fill="transparent" />
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-fog">
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" fill="none" stroke={INK.star} strokeWidth="1.5" />
          </svg>
          Hollow: fewer than {THIN_EVIDENCE} matches
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-[1.5px] bg-ember" aria-hidden="true" />
          Distance from the diagonal
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        {active &&
          `Bucket ${pct(active.bucket_lower, 0)} to ${pct(active.bucket_upper, 0)}: predicted ${pct(
            active.predicted_mean
          )}, observed ${pct(active.actual_win_rate)}, ${active.count} matches`}
      </p>
    </div>
  );
}

function CalibrationTable({ buckets, hovered, onHover }) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const ece = buckets.reduce((s, b) => s + b.count * Math.abs(b.predicted_mean - b.actual_win_rate), 0) / total;
  const worst = buckets.reduce((w, b) =>
    Math.abs(b.predicted_mean - b.actual_win_rate) > Math.abs(w.predicted_mean - w.actual_win_rate) ? b : w
  );
  const max = Math.max(...buckets.map((b) => b.count));

  return (
    <>
      <Readings className="mb-4">
        <Reading
          label="Expected calibration error"
          value={`${(ece * 100).toFixed(1)} pts`}
          emphasis
        />
        <Reading
          label="Largest bucket gap"
          value={`${(Math.abs(worst.predicted_mean - worst.actual_win_rate) * 100).toFixed(1)} pts`}
          note={`at ${pct(worst.bucket_lower < 0 ? 0 : worst.bucket_lower, 0)}–${pct(worst.bucket_upper, 0)}`}
        />
      </Readings>
      <p className="mb-4 text-sm leading-relaxed text-fog text-pretty">
        On average, a predicted probability lands {(ece * 100).toFixed(1)} points from the rate those players actually
        won at. Hover a row or a dot to find it on the chart.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="caps pb-2 pr-3 font-semibold text-fog">Bucket</th>
              <th className="caps pb-2 pr-3 text-right font-semibold text-fog">Pred.</th>
              <th className="caps pb-2 pr-3 text-right font-semibold text-fog">Obs.</th>
              <th className="caps pb-2 pr-3 text-right font-semibold text-fog">Gap</th>
              <th className="caps pb-2 text-right font-semibold text-fog">n</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b, i) => {
              const gap = (b.actual_win_rate - b.predicted_mean) * 100;
              const r = 1.5 + 5 * Math.sqrt(b.count / max);
              return (
                <tr
                  key={i}
                  onMouseEnter={() => onHover(i)}
                  onMouseLeave={() => onHover(null)}
                  className={`border-b border-rule-soft transition-colors ${hovered === i ? "bg-raised" : ""} ${
                    hovered !== null && hovered !== i ? "text-fog" : "text-star"
                  }`}
                >
                  <td className="py-1.5 pr-3 text-mist">
                    {Math.round(Math.max(0, b.bucket_lower) * 100)}–{Math.round(b.bucket_upper * 100)}%
                  </td>
                  <td className="py-1.5 pr-3 text-right">{pct(b.predicted_mean)}</td>
                  <td className="py-1.5 pr-3 text-right">{pct(b.actual_win_rate)}</td>
                  <td className="py-1.5 pr-3 text-right">
                    {gap >= 0 ? "+" : "−"}
                    {Math.abs(gap).toFixed(1)}
                  </td>
                  <td className="py-1.5 text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      {b.count.toLocaleString()}
                      <svg width="14" height="14" aria-hidden="true">
                        <circle
                          cx="7"
                          cy="7"
                          r={r}
                          fill={b.count < THIN_EVIDENCE ? "none" : INK.star}
                          stroke={INK.star}
                          strokeWidth={b.count < THIN_EVIDENCE ? 1.2 : 0}
                        />
                      </svg>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---- Rolling accuracy ----------------------------------------------------

function SeriesKey() {
  return (
    <span className="flex items-center gap-4">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 bg-emerald" aria-hidden="true" />
        Model
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="16" height="2" aria-hidden="true">
          <line x1="0" x2="16" y1="1" y2="1" stroke={INK.star} strokeWidth="1.5" strokeDasharray="3 3" />
        </svg>
        Higher rank
      </span>
    </span>
  );
}

function RollingChart({ rolling }) {
  const [ref, width] = useWidth(700);
  const [hover, setHover] = useState(null);
  const height = 300;
  const m = { top: 16, right: 92, bottom: 34, left: 44 };
  const innerW = Math.max(10, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const vals = rolling.flatMap((r) => [r.model_accuracy, r.baseline_rank_accuracy]);
  const lo = Math.floor((Math.min(...vals) - 0.02) * 20) / 20;
  const hi = Math.ceil((Math.max(...vals) + 0.02) * 20) / 20;
  const n = rolling.length;
  const sx = (i) => m.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const sy = (v) => m.top + (1 - (v - lo) / (hi - lo)) * innerH;
  const maxN = Math.max(...rolling.map((r) => r.n_matches));
  const ahead = rolling.filter((r) => r.model_accuracy > r.baseline_rank_accuracy).length;
  const yTicks = [];
  for (let t = lo; t <= hi + 1e-9; t += 0.05) yTicks.push(Math.round(t * 100) / 100);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 64))));

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - m.left) / innerW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  const h = hover !== null ? rolling[hover] : null;
  const path = (key) => rolling.map((r, i) => `${i ? "L" : "M"}${sx(i)},${sy(r[key])}`).join("");
  const lastI = n - 1;
  let yModel = sy(rolling[lastI].model_accuracy) + 4;
  let yBase = sy(rolling[lastI].baseline_rank_accuracy) + 4;
  if (Math.abs(yModel - yBase) < 15) {
    const mid = (yModel + yBase) / 2;
    const modelAbove = rolling[lastI].model_accuracy >= rolling[lastI].baseline_rank_accuracy;
    yModel = mid + (modelAbove ? -7.5 : 7.5);
    yBase = mid + (modelAbove ? 7.5 : -7.5);
  }

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Monthly accuracy: model ahead of the higher-rank baseline in ${ahead} of ${n} months`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="block"
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={m.left + innerW} y1={sy(t)} y2={sy(t)} stroke={INK.ruleSoft} />
            <text x={m.left - 10} y={sy(t) + 4} textAnchor="end" style={{ fontSize: 11 }} fill={INK.fog}>
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        {rolling.map((r, i) =>
          i % labelEvery === 0 ? (
            <text key={r.period} x={sx(i)} y={height - 10} textAnchor="middle" style={{ fontSize: 11 }} fill={INK.fog}>
              {monthLabel(r.period)}
            </text>
          ) : null
        )}
        <line x1={m.left} x2={m.left + innerW} y1={m.top + innerH} y2={m.top + innerH} stroke={INK.rule} />

        {h && <line x1={sx(hover)} x2={sx(hover)} y1={m.top} y2={m.top + innerH} stroke={INK.mist} strokeWidth="1" opacity="0.5" />}

        <path d={path("baseline_rank_accuracy")} fill="none" stroke={INK.star} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.75" />
        <path d={path("model_accuracy")} fill="none" stroke={INK.emerald} strokeWidth="2" />
        {rolling.map((r, i) => (
          <circle
            key={r.period}
            cx={sx(i)}
            cy={sy(r.model_accuracy)}
            r={1.5 + 4 * Math.sqrt(r.n_matches / maxN)}
            fill={INK.emerald}
            stroke={INK.plate}
            strokeWidth="1.5"
            opacity={hover === null || hover === i ? 1 : 0.35}
          />
        ))}
        {h && <ReticleMark cx={sx(hover)} cy={sy(h.model_accuracy)} r={9} />}

        {/* direct end labels */}
        <text x={sx(lastI) + 10} y={yModel} style={{ fontSize: 12 }} fill={INK.star}>
          Model
        </text>
        <text x={sx(lastI) + 10} y={yBase} style={{ fontSize: 12 }} fill={INK.mist}>
          Higher rank
        </text>
      </svg>

      {h && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-48 border border-rule bg-night/95 px-3 py-2.5 text-xs shadow-[0_8px_24px_rgb(0_0_0/0.45)]"
          style={sx(hover) > width / 2 ? { right: width - sx(hover) + 14 } : { left: sx(hover) + 14 }}
        >
          <div className="caps mb-1.5 text-mist">{monthLabel(h.period, true)}</div>
          <TipRow label="Model" value={pct(h.model_accuracy)} color={INK.emerald} />
          <TipRow label="Higher rank" value={pct(h.baseline_rank_accuracy)} color={INK.star} />
          <TipRow label="Log-loss" value={h.log_loss.toFixed(3)} />
          <TipRow label="Matches" value={h.n_matches.toLocaleString()} />
        </div>
      )}

      <p className="mt-2 text-sm text-fog">
        The model beat the ranking baseline in <span className="text-star">{ahead} of {n}</span> months. Dot size is
        the number of matches that month; quiet months swing the most.
      </p>
    </div>
  );
}

function TipRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 text-fog">
        {color && <span className="size-2 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="tabular-nums text-star">{value}</span>
    </div>
  );
}

// ---- Confusion -----------------------------------------------------------

function Confusion({ cm }) {
  const total = cm.true_positive + cm.false_positive + cm.true_negative + cm.false_negative;
  const cells = [
    { label: "Picked A, A won", value: cm.true_positive, correct: true },
    { label: "Picked B, A won", value: cm.false_negative, correct: false },
    { label: "Picked A, B won", value: cm.false_positive, correct: false },
    { label: "Picked B, B won", value: cm.true_negative, correct: true },
  ];
  const max = Math.max(...cells.map((c) => c.value));
  const aWins = (cm.true_positive + cm.false_negative) / total;
  const pickedA = (cm.true_positive + cm.false_positive) / total;

  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_1fr] text-sm">
        <span />
        <span className="caps px-3 pb-2 text-center text-fog">Model picks A</span>
        <span className="caps px-3 pb-2 text-center text-fog">Model picks B</span>
        {[0, 1].map((row) => (
          <Row key={row} label={row === 0 ? "A won" : "B won"}>
            {[cells[row === 0 ? 0 : 2], cells[row === 0 ? 1 : 3]].map((c) => {
              const r = 4 + 14 * Math.sqrt(c.value / max);
              return (
                <div key={c.label} className="flex flex-col items-center justify-center gap-2 border border-rule-soft px-2 py-4">
                  <svg width="40" height="40" aria-hidden="true">
                    <circle
                      cx="20"
                      cy="20"
                      r={r}
                      fill={c.correct ? INK.emerald : "none"}
                      fillOpacity={c.correct ? 0.85 : 0}
                      stroke={c.correct ? "none" : INK.ember}
                      strokeWidth="1.5"
                    />
                  </svg>
                  <span className="text-xl tabular-nums text-star">{c.value.toLocaleString()}</span>
                  <span className="text-xs text-fog">
                    {c.correct ? "correct" : "missed"} · {pct(c.value / total)}
                  </span>
                </div>
              );
            })}
          </Row>
        ))}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-fog text-pretty">
        Which player is “A” is set by a hash of the match ID, so the matrix should be close to symmetric, and it is: A
        won {pct(aWins)} of matches and the model picked A {pct(pickedA)} of the time. No meaningful side bias.
      </p>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <>
      <span className="caps flex items-center pr-3 text-fog">{label}</span>
      {children}
    </>
  );
}

// ---- helpers ---------------------------------------------------------------


const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(period, long = false) {
  if (!period) return "";
  const [y, mo] = period.split("-");
  const name = MONTHS[Number(mo) - 1];
  return long ? `${name} ${y}` : `${name} ’${y.slice(2)}`;
}
