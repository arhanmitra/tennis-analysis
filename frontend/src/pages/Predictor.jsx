import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import PlayerSearch from "../components/PlayerSearch";
import { Button, EmptyState, ErrorState, PageHeading, Plate, Segmented } from "../ui/atlas";
import { Flag } from "../ui/Flag";
import { StarMark } from "../ui/icons";
import { INK } from "../ui/chartTheme";

// Only the inputs that actually move the model are offered. Round isn't a model
// feature at all, event level shifts the call by under a point on its own, and
// best-of follows the event (5 sets at Grand Slams, 3 elsewhere). Carpet left the
// tour in the late 2000s, so it isn't offered for a current matchup.
const SURFACES = ["Hard", "Clay", "Grass"];
const LEVELS = [
  { value: "G", label: "Slam", name: "Grand Slam" },
  { value: "M", label: "1000", name: "Masters 1000" },
  { value: "500", label: "500", name: "ATP 500" },
  { value: "250", label: "250", name: "ATP 250" },
];
const bestOfFor = (level) => (level === "G" ? 5 : 3);

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function featureLabel(name) {
  const labels = {
    elo_diff: "Overall Elo",
    surface_elo_diff: "Surface Elo",
    rank_diff: "Ranking",
    rank_points_diff: "Ranking points",
    age_diff: "Age",
    height_diff: "Height",
    same_hand: "Same-handed matchup",
    win_pct_last10_diff: "Form, last 10",
    win_pct_last52w_diff: "Form, last 52 weeks",
    serve_1st_win_pct_diff: "1st-serve points won",
    h2h_win_pct_a: "Head-to-head",
    best_of: "Best-of format",
  };
  if (labels[name]) return labels[name];
  if (name.startsWith("surface_")) return `Surface: ${name.slice(8)}`;
  if (name.startsWith("level_")) return `Event level`;
  return name;
}

function formatValue(name, v) {
  if (name.startsWith("surface_") && name !== "surface_elo_diff") return null;
  if (name.startsWith("level_") || name === "same_hand") return null;
  if (name.includes("win_pct") || name.includes("pct")) return `${v >= 0 && !name.startsWith("h2h") ? "+" : ""}${(v * 100).toFixed(0)}%`;
  if (name === "best_of") return `${v}`;
  const r = Math.round(v);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toLocaleString()}`;
}

export default function Predictor() {
  const [params, setParams] = useSearchParams();
  const [playerA, setPlayerA] = useState(null);
  const [playerB, setPlayerB] = useState(null);
  const [surface, setSurface] = useState(pick(params.get("surface"), SURFACES, "Hard"));
  const [level, setLevel] = useState(pick(params.get("level"), LEVELS.map((l) => l.value), "250"));
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const restored = useRef(false);

  const canPredict = playerA && playerB && playerA.player_id !== playerB.player_id;

  async function runPrediction(a = playerA, b = playerB, opts = { surface, level }) {
    if (!a || !b || a.player_id === b.player_id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.predict({
        player_a_id: a.player_id,
        player_b_id: b.player_id,
        surface: opts.surface,
        tourney_level: opts.level,
        best_of: bestOfFor(opts.level),
      });
      setResult({ ...res, a, b, conditions: opts });
      setParams(
        { a: a.player_id, b: b.player_id, surface: opts.surface, level: opts.level },
        { replace: true }
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // A shared link (?a=…&b=…) restores the matchup and re-runs it.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const a = params.get("a");
    const b = params.get("b");
    if (!a || !b) return;
    Promise.all([api.getPlayer(a), api.getPlayer(b)])
      .then(([pa, pb]) => {
        setPlayerA(pa);
        setPlayerB(pb);
        runPrediction(pa, pb, { surface, level });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeading title="Who wins?">
        Pick two players active in the last twelve months and set the match conditions. The model returns a win
        probability from each player’s current Elo, ranking and form, and shows which features moved it.
      </PageHeading>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Plate title="Matchup" className="self-start" bodyClassName="space-y-5 p-5 sm:p-6">
          <PlayerSearch
            key={`a-${playerA?.player_id ?? "none"}`}
            label="Player A"
            value={playerA}
            onChange={setPlayerA}
            excludeId={playerB?.player_id}
            activeOnly
          />
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-rule-soft" />
            <span className="display text-lg text-fog">versus</span>
            <span className="h-px flex-1 bg-rule-soft" />
          </div>
          <PlayerSearch
            key={`b-${playerB?.player_id ?? "none"}`}
            label="Player B"
            value={playerB}
            onChange={setPlayerB}
            excludeId={playerA?.player_id}
            activeOnly
          />
          <Segmented
            label="Surface"
            name="surface"
            value={surface}
            onChange={setSurface}
            options={SURFACES.map((s) => ({ value: s, label: s }))}
          />
          <div>
            <Segmented
              label="Event"
              name="level"
              value={level}
              onChange={setLevel}
              options={LEVELS.map((l) => ({ value: l.value, label: l.label }))}
            />
            <p className="mt-2 text-xs text-fog">
              {LEVELS.find((l) => l.value === level).name} · best of {bestOfFor(level)} sets
            </p>
          </div>
          <Button type="button" onClick={() => runPrediction()} disabled={!canPredict || loading} className="w-full">
            <StarMark size={14} />
            {loading ? "Running the model…" : "Predict the winner"}
          </Button>
          {!canPredict && (
            <p className="text-xs text-fog">
              {playerA && playerB ? "Choose two different players." : "Choose both players to run a prediction."}
            </p>
          )}
        </Plate>

        <div className="min-w-0 space-y-8">
          {error ? (
            <Plate>
              <ErrorState title="The prediction didn't run" error={error} onRetry={() => runPrediction()} />
            </Plate>
          ) : result ? (
            <Result result={result} loading={loading} />
          ) : (
            <Plate title="Win probability">
              <Meridian probA={0.5} ghost />
              <EmptyState title={loading ? "Running the model…" : "No matchup yet"}>
                Choose two players on the left. Try a top-ten pairing on their best and worst surfaces: surface Elo
                moves the call more than most people expect.
              </EmptyState>
            </Plate>
          )}
        </div>
      </div>
    </>
  );
}

function Result({ result, loading }) {
  const { a, b, prob_a, prob_b, conditions } = result;
  const favA = prob_a >= prob_b;
  const levelName = LEVELS.find((l) => l.value === conditions.level)?.name;

  return (
    <>
      <Plate
        title="Win probability"
        aside={`${conditions.surface} · ${levelName} · best of ${bestOfFor(conditions.level)}`}
        className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}
      >
        <div className="grid grid-cols-2 gap-4 pt-2">
          <Side name={a.name} ioc={a.ioc} prob={prob_a} fav={favA} side="A" />
          <Side name={b.name} ioc={b.ioc} prob={prob_b} fav={!favA} side="B" align="right" />
        </div>
        <Meridian probA={prob_a} />
      </Plate>

      <Plate title="What moved the call">
        <Contributions features={result.top_features} a={a} b={b} />
      </Plate>
    </>
  );
}

function Side({ name, ioc, prob, fav, side, align = "left" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className={`display truncate text-2xl leading-tight sm:text-4xl ${fav ? "text-star" : "text-mist"}`}>{name}</div>
      <div className={`mt-1 flex h-4 items-center gap-1.5 text-xs tracking-wider text-fog ${align === "right" ? "justify-end" : ""}`}>
        <Flag ioc={ioc} size={12} />
        {ioc}
      </div>
      <div
        className={`mt-2 text-5xl font-medium tabular-nums tracking-tight sm:text-6xl ${
          fav ? (side === "A" ? "text-emerald" : "text-star") : "text-fog"
        }`}
      >
        {(prob * 100).toFixed(1)}
        <span className="text-2xl sm:text-3xl">%</span>
      </div>
    </div>
  );
}

// The probability as a split on a meridian: A's share from the left, B's from
// the right, the even line at 50%. The marker settles from even to the call.
function Meridian({ probA, ghost = false }) {
  const [shown, setShown] = useState(0.5);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(probA));
    return () => cancelAnimationFrame(id);
  }, [probA]);
  const left = `${shown * 100}%`;

  return (
    <div className={`relative mt-8 mb-2 select-none ${ghost ? "opacity-40" : ""}`} aria-hidden={ghost}>
      <div className="relative h-3 border border-rule bg-night">
        <div
          className="absolute inset-y-0 left-0 bg-emerald/85 transition-[width] duration-[600ms] ease-sidereal"
          style={{ width: left }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-star/20 transition-[width] duration-[600ms] ease-sidereal"
          style={{ width: `${(1 - shown) * 100}%` }}
        />
        {/* even line */}
        <span className="absolute -top-3 -bottom-3 left-1/2 w-px bg-mist/60" />
      </div>
      {/* marker */}
      <div
        className="absolute top-1.5 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-[600ms] ease-sidereal"
        style={{ left }}
      >
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
          <circle cx="17" cy="17" r="9" fill={INK.plate} stroke={INK.star} strokeWidth="1.5" />
          <circle cx="17" cy="17" r="2.5" fill={INK.star} />
          <path d="M17 1v6M17 27v6M1 17h6M27 17h6" stroke={INK.star} strokeWidth="1.5" />
        </svg>
      </div>
      <div className="relative mt-3 h-4 text-[11px] text-fog">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span
            key={t}
            className={`absolute -translate-x-1/2 tabular-nums ${t === 0 ? "translate-x-0" : ""} ${t === 1 ? "-translate-x-full" : ""}`}
            style={{ left: `${t * 100}%` }}
          >
            {t === 0.5 ? "even" : `${Math.round(t * 100)}%`}
          </span>
        ))}
      </div>
    </div>
  );
}

function Contributions({ features, a, b }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(0.05, ...features.map((f) => Math.abs(f.contribution)));
  const ordered = [...features].sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution));

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-x-4 text-xs text-fog sm:grid-cols-[220px_minmax(0,1fr)]">
        <span className="hidden sm:block" />
        <div className="flex justify-between">
          <span>← favours {lastName(a.name)}</span>
          <span>favours {lastName(b.name)} →</span>
        </div>
      </div>
      <ul className="space-y-0">
        {ordered.map((f, i) => {
          // Positive SHAP pushes toward A, which sits on the left.
          const towardA = f.contribution >= 0;
          const share = (Math.abs(f.contribution) / max) * 34; // leaves room for the value label inside the plot
          const value = formatValue(f.feature, f.value);
          const dim = hover !== null && hover !== i;
          return (
            <li
              key={f.feature}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className={`grid grid-cols-1 items-center gap-x-4 gap-y-1 border-b border-rule-soft py-2 transition-opacity duration-200 sm:grid-cols-[220px_minmax(0,1fr)] ${
                dim ? "opacity-35" : ""
              }`}
            >
              <div className="min-w-0 truncate text-sm">
                <span className="text-star">{featureLabel(f.feature)}</span>
                {value && <span className="ml-2 tabular-nums text-fog">{value}</span>}
              </div>
              <div className="relative h-6">
                <span className="absolute inset-y-0 left-1/2 w-px bg-rule" aria-hidden="true" />
                <span
                  className={`absolute top-1/2 h-0.5 -translate-y-1/2 ${towardA ? "bg-emerald" : "bg-star/70"}`}
                  style={towardA ? { right: "50%", width: `${share}%` } : { left: "50%", width: `${share}%` }}
                />
                <span
                  className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                    towardA ? "bg-emerald" : "bg-star"
                  }`}
                  style={{ left: `${50 + (towardA ? -share : share)}%` }}
                />
                {hover === i && (
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 30 30"
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-emerald"
                    style={{ left: `${50 + (towardA ? -share : share)}%` }}
                  >
                    <circle cx="15" cy="15" r="8" fill="none" stroke="currentColor" strokeWidth="1.25" />
                    <path d="M15 1v6M15 23v6M1 15h6M23 15h6" stroke="currentColor" strokeWidth="1.25" />
                  </svg>
                )}
                <span
                  className={`absolute top-1/2 -translate-y-1/2 text-xs tabular-nums ${hover === i ? "text-star" : "text-fog"}`}
                  style={towardA ? { right: `calc(${50 + share}% + 10px)` } : { left: `calc(${50 + share}% + 10px)` }}
                >
                  {towardA ? "+" : "−"}
                  {Math.abs(f.contribution).toFixed(2)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm leading-relaxed text-fog text-pretty">
        Bars are SHAP contributions in log-odds: how far each feature pushed this prediction away from an even call.
        Values beside each label are the raw A-minus-B difference going into the model.
      </p>
    </div>
  );
}

function lastName(name) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}
