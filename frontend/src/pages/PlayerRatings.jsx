import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import PlayerSearch from "../components/PlayerSearch";
import { usePlayerParams } from "../ui/usePlayerParam";
import { Flag } from "../ui/Flag";
import { EloNote } from "../ui/EloNote";
import { EmptyState, ErrorState, LoadingState, PageHeading, Plate, Reading, Readings, Segmented } from "../ui/atlas";
import { AtlasTooltip, INK, SURFACE_COLORS, SURFACE_ORDER, axisProps, dateLabel, downsample, gridProps, niceTicks, toTime, yearTick, yearTicks } from "../ui/chartTheme";

const SURFACE_LABEL = { overall: "Overall", Hard: "Hard", Clay: "Clay", Grass: "Grass", Carpet: "Carpet" };

export default function PlayerRatings() {
  const [player, setPlayer] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());
  const [standing, setStanding] = useState(null);

  const persist = usePlayerParams(["p"], (p) => loadPlayer(p));

  async function loadPlayer(p) {
    setPlayer(p);
    persist(p);
    setData(null);
    setStanding(null);
    setError(null);
    if (!p) return;
    setLoading(true);
    // Standing is a nice-to-have beside the chart; a failure there shouldn't block it.
    api.getStanding(p.player_id).then(setStanding).catch(() => setStanding(null));
    try {
      setData(await api.getRatings(p.player_id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const reshaped = data ? reshape(data.history) : null;

  return (
    <>
      <PageHeading title="Player ratings">
        Elo is computed once, match by match in date order, from 1968 to today. Each player carries an overall rating
        and one per surface. Search a player to chart their career and see where they stand on each surface today.
      </PageHeading>

      <div className="mb-8">
        <EloNote />
      </div>

      <div className="mb-8 max-w-md">
        <PlayerSearch key={player?.player_id ?? "none"} label="Player" value={player} onChange={loadPlayer} />
      </div>

      <div className="space-y-8">
        {player && standing && <SurfaceStanding standing={standing} name={player.name} />}

        {player && (
          <Plate
            title={
              <span className="flex items-center gap-2">
                Elo trajectory · {player.name}
                <Flag ioc={player.ioc} size={10} />
              </span>
            }
            aside={reshaped && `${reshaped.chartData.length.toLocaleString()} rating points`}
          >
            {error ? (
              <ErrorState title="Couldn't load the Elo history" error={error} onRetry={() => loadPlayer(player)} />
            ) : loading || !reshaped ? (
              <LoadingState label="Replaying the Elo history" />
            ) : reshaped.chartData.length === 0 ? (
              <EmptyState title="No rated matches">This player has no main-tour matches in the record.</EmptyState>
            ) : (
              <Trajectory reshaped={reshaped} hidden={hidden} setHidden={setHidden} />
            )}
          </Plate>
        )}

        <Leaderboard
          selectedId={player?.player_id}
          onPick={(p) => {
            loadPlayer(p);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </div>
    </>
  );
}

function Trajectory({ reshaped, hidden, setHidden }) {
  const { chartData, surfaces, stats } = reshaped;
  const visible = surfaces.filter((s) => !hidden.has(s));
  const y = eloAxis(chartData, visible.length ? visible : surfaces);
  const labelShift = endLabelShifts(chartData, visible, stats, y.domain);
  const tMin = chartData[0].t;
  const tMax = chartData[chartData.length - 1].t;

  function toggle(s) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Series shown">
          {surfaces.map((s) => {
            const on = !hidden.has(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s)}
                className={`flex h-8 items-center gap-2 border px-3 text-sm transition-colors ${
                  on ? "border-rule bg-raised text-star" : "border-rule-soft text-fog hover:text-mist"
                }`}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: on ? SURFACE_COLORS[s] : "transparent", boxShadow: `inset 0 0 0 1.5px ${SURFACE_COLORS[s]}` }}
                />
                {SURFACE_LABEL[s]}
              </button>
            );
          })}
        </div>
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={chartData} margin={{ top: 8, right: 64, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[tMin, tMax]}
              {...axisProps}
              ticks={yearTicks(tMin, tMax)}
              interval={0}
              tickFormatter={yearTick}
            />
            <YAxis {...axisProps} domain={y.domain} ticks={y.ticks} interval={0} allowDecimals={false} width={48} />
            <Tooltip
              cursor={{ stroke: INK.mist, strokeOpacity: 0.4 }}
              content={
                <AtlasTooltip
                  title={dateLabel}
                  rows={(payload) =>
                    payload.map((p) => [SURFACE_LABEL[p.dataKey], p.value == null ? null : Math.round(p.value), p.color])
                  }
                />
              }
            />
            {surfaces.map((s) =>
              hidden.has(s) ? null : (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={s}
                  stroke={SURFACE_COLORS[s]}
                  dot={false}
                  activeDot={{ r: 4, stroke: INK.plate, strokeWidth: 2 }}
                  strokeWidth={s === "overall" ? 2.5 : 1.5}
                  connectNulls
                  isAnimationActive={false}
                  label={
                    <EndLabel lastIndex={stats[s].lastIndex} text={SURFACE_LABEL[s]} color={INK.mist} dy={labelShift[s] ?? 0} />
                  }
                />
              )
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <Readings className="self-start">
        <Reading label="Peak overall" value={Math.round(stats.overall.peak)} note={stats.overall.peakDate?.slice(0, 4)} emphasis />
        <Reading label="Latest overall" value={Math.round(stats.overall.latest)} note={stats.overall.latestDate?.slice(0, 4)} />
        {surfaces
          .filter((s) => s !== "overall")
          .map((s) => (
            <Reading key={s} label={`Peak ${SURFACE_LABEL[s]}`} value={Math.round(stats[s].peak)} note={stats[s].peakDate?.slice(0, 4)} />
          ))}
      </Readings>
    </div>
  );
}

// ---- Surface standing ----------------------------------------------------
// Where the player's current Elo ranks among active players on each surface.

const STANDING_LABEL = { overall: "Overall", Hard: "Hard", Clay: "Clay", Grass: "Grass" };

function SurfaceStanding({ standing, name }) {
  if (!standing.active) {
    return (
      <Plate title="Surface standing">
        <p className="text-sm leading-relaxed text-fog">
          {name} hasn’t played a tour-level match in the last 12 months, so they aren’t ranked against current
          players. The chart below still shows their full career.
        </p>
      </Plate>
    );
  }
  const ranked = standing.surfaces.filter((s) => s.surface !== "overall" && s.rank != null);
  // Compare by percentile, so #26 of 110 on grass weighs fairly against #53 of 173 on clay.
  const pctile = (s) => s.rank / s.of;
  const best = ranked.length ? ranked.reduce((a, b) => (pctile(a) <= pctile(b) ? a : b)) : null;
  const worst = ranked.length > 1 ? ranked.reduce((a, b) => (pctile(a) >= pctile(b) ? a : b)) : null;

  return (
    <Plate title="Surface standing" aside={`Active players · as of ${standing.as_of}`}>
      <div className="grid grid-cols-2 gap-px bg-rule-soft lg:grid-cols-4">
        {standing.surfaces.map((s) => (
          <StandingCell key={s.surface} s={s} best={best?.surface === s.surface} min={standing.min_matches} />
        ))}
      </div>
      {best && worst && best.surface !== worst.surface && (
        <p className="mt-4 text-sm leading-relaxed text-mist text-pretty">
          {worst.rank <= 10 ? (
            <>
              Top ten on every surface, best on {best.surface.toLowerCase()} (#{best.rank} of {best.of}).
            </>
          ) : (
            <>
              Strongest on {best.surface.toLowerCase()} (#{best.rank} of {best.of}), weakest on{" "}
              {worst.surface.toLowerCase()} (#{worst.rank} of {worst.of}).
            </>
          )}{" "}
          Surface ranks use a 50/50 blend of surface
          and overall Elo, which predicts real 2024–26 results better than surface Elo alone. They cover players active
          in the last 12 months with at least {standing.min_matches} matches on that surface.
        </p>
      )}
    </Plate>
  );
}

function StandingCell({ s, best, min }) {
  return (
    <div className="bg-plate px-4 py-4 sm:px-5">
      <div className="caps flex items-center gap-2 text-fog">
        <span className="size-2 rounded-full" style={{ background: SURFACE_COLORS[s.surface] }} aria-hidden="true" />
        {STANDING_LABEL[s.surface]}
      </div>
      {s.rank != null ? (
        <>
          <div className={`mt-2 text-4xl font-medium tabular-nums tracking-tight ${best ? "text-emerald" : "text-star"}`}>
            <span className="text-2xl text-fog">#</span>
            {s.rank}
          </div>
          <div className="mt-1 text-xs tabular-nums text-fog">
            of {s.of} · {s.surface === "overall" ? "Elo" : "rating"} {Math.round(s.elo)}
          </div>
        </>
      ) : (
        <>
          <div className="mt-2 text-4xl font-medium text-fog">—</div>
          <div className="mt-1 text-xs text-fog">
            {s.matches} {s.matches === 1 ? "match" : "matches"}; ranked from {min}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Leaderboard -----------------------------------------------------------

const TOP_N = 20;

function Leaderboard({ selectedId, onPick }) {
  const [surface, setSurface] = useState("overall");
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    api
      .getLeaderboard(surface)
      .then((d) => live && setBoard(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [surface, attempt]);

  const loading = !error && (!board || board.surface !== surface);
  const entries = board?.entries ?? [];
  const top = entries.slice(0, TOP_N);
  const selected = selectedId ? entries.find((e) => e.player_id === selectedId) : null;
  const extra = selected && selected.rank > TOP_N ? selected : null;
  const maxMatches = Math.max(1, ...top.map((e) => e.matches), extra?.matches ?? 0);
  const isSurface = surface !== "overall";

  return (
    <Plate title="Elo leaderboard" aside={board && !loading ? `${board.n_ranked} active players ranked` : null}>
      <div className="mb-5 max-w-md">
        <Segmented
          label="Surface"
          name="board-surface"
          value={surface}
          onChange={setSurface}
          options={["overall", "Hard", "Clay", "Grass"].map((s) => ({ value: s, label: STANDING_LABEL[s] }))}
        />
      </div>
      {error ? (
        <ErrorState title="Couldn't load the leaderboard" error={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : loading ? (
        <LoadingState label="Ranking active players" />
      ) : (
        <>
          <table className="w-full max-w-4xl text-sm tabular-nums">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="caps w-14 py-2 pr-3 font-semibold text-fog">#</th>
                <th className="caps py-2 pr-3 font-semibold text-fog">Player</th>
                <th className="caps py-2 pr-3 text-right font-semibold text-fog">{isSurface ? "Rating" : "Elo"}</th>
                {isSurface && (
                  <th className="caps hidden py-2 pr-3 text-right font-semibold text-fog md:table-cell">
                    {surface} Elo
                  </th>
                )}
                <th className="caps hidden py-2 pr-3 text-right font-semibold text-fog sm:table-cell">Matches</th>
                <th className="caps py-2 text-right font-semibold text-fog">ATP #</th>
              </tr>
            </thead>
            <tbody>
              {top.map((e) => (
                <BoardRow
                  key={e.player_id}
                  e={e}
                  selected={e.player_id === selectedId}
                  onPick={onPick}
                  maxMatches={maxMatches}
                  isSurface={isSurface}
                />
              ))}
              {extra && (
                <>
                  <tr aria-hidden="true">
                    <td colSpan={6} className="py-1 text-center text-fog">
                      ⋯
                    </td>
                  </tr>
                  <BoardRow e={extra} selected onPick={onPick} maxMatches={maxMatches} isSurface={isSurface} />
                </>
              )}
            </tbody>
          </table>
          <p className="mt-4 max-w-4xl text-sm leading-relaxed text-fog text-pretty">
            {isSurface ? (
              <>
                Ranked by a 50/50 blend of {surface.toLowerCase()}-court Elo and overall Elo. Scored on every 2024–26
                match, the blend predicted results better than surface Elo alone: surface ratings all start at 1500, so
                players with long careers on a short-season surface sit too high on surface Elo alone.{" "}
              </>
            ) : (
              "Current overall Elo. "
            )}
            Covers players active in the last 12 months with at least {board.min_matches} matches
            {isSurface ? " on the surface" : ""}. ATP # is the official ranking at the player’s most recent match. Dot
            size is matches played{isSurface ? " on this surface" : ""}.
          </p>
        </>
      )}
    </Plate>
  );
}

function BoardRow({ e, selected, onPick, maxMatches, isSurface }) {
  const r = 1.5 + 4.5 * Math.sqrt(e.matches / maxMatches);
  return (
    <tr className={`border-b border-rule-soft ${selected ? "bg-raised" : "hover:bg-raised/60"}`}>
      <td className={`py-2 pr-3 ${selected ? "text-emerald" : "text-mist"}`}>{e.rank}</td>
      <td className="py-2 pr-3">
        <button
          type="button"
          onClick={() => onPick({ player_id: e.player_id, name: e.name, ioc: e.ioc })}
          className={`flex items-center gap-2 text-left hover:text-emerald ${selected ? "text-emerald" : "text-star"}`}
        >
          <Flag ioc={e.ioc} size={10} />
          {e.name}
        </button>
      </td>
      <td className="py-2 pr-3 text-right text-star">{Math.round(e.elo)}</td>
      {isSurface && (
        <td className="hidden py-2 pr-3 text-right text-fog md:table-cell">
          {e.surface_elo != null ? Math.round(e.surface_elo) : "—"}
        </td>
      )}
      <td className="hidden py-2 pr-3 text-right text-fog sm:table-cell">
        <span className="inline-flex items-center justify-end gap-2">
          {e.matches}
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r={r} fill={INK.star} opacity="0.85" />
          </svg>
        </span>
      </td>
      <td className="py-2 text-right text-mist">{e.official_rank ? `#${e.official_rank}` : "—"}</td>
    </tr>
  );
}

// Direct label at the end of each line, so identity never rides on colour alone.
// Lines that finish at similar ratings would stack their end labels on top of
// each other. Push the labels of lines ending at the right edge apart so each
// sits at least LABEL_GAP px from the next, keeping their top-to-bottom order.
const PLOT_HEIGHT = 420 - 8 - 30; // chart height minus top margin and x-axis
const LABEL_GAP = 14;

function endLabelShifts(chartData, surfaces, stats, domain) {
  const tMin = chartData[0].t;
  const tMax = chartData[chartData.length - 1].t;
  const pxPerElo = PLOT_HEIGHT / (domain[1] - domain[0]);
  // Lines ending in the last 8% of the time axis have labels close enough on x to collide.
  const ends = surfaces
    .filter((s) => stats[s].lastIndex >= 0 && chartData[stats[s].lastIndex].t >= tMax - 0.08 * (tMax - tMin))
    .map((s) => ({ s, py: (domain[1] - chartData[stats[s].lastIndex][s]) * pxPerElo }))
    .sort((a, b) => a.py - b.py);
  const shifts = {};
  let prev = -Infinity;
  for (const e of ends) {
    const placed = Math.max(e.py, prev + LABEL_GAP);
    shifts[e.s] = placed - e.py;
    prev = placed;
  }
  return shifts;
}

function EndLabel({ x, y, index, lastIndex, text, color, dy = 0 }) {
  if (index !== lastIndex || x == null || y == null) return null;
  return (
    <text x={x + 8} y={y + 4 + dy} fontSize={12} fill={color} fontFamily="Barlow">
      {text}
    </text>
  );
}

function reshape(history) {
  const bySurface = {};
  for (const point of history) {
    if (!bySurface[point.surface]) bySurface[point.surface] = new Map();
    bySurface[point.surface].set(point.as_of_date, point.elo);
  }
  const surfaces = SURFACE_ORDER.filter((s) => bySurface[s]);
  const allDates = [...new Set(history.map((h) => h.as_of_date))].sort();

  // Downsample for chart readability on long careers.
  const dates = downsample(allDates);
  const chartData = dates.map((date) => {
    const row = { date, t: toTime(date) };
    for (const s of surfaces) row[s] = bySurface[s].get(date) ?? null;
    return row;
  });

  // Peaks and latest values come from the full history, not the downsampled one.
  const stats = {};
  for (const s of surfaces) {
    let peak = -Infinity;
    let peakDate = null;
    let latestDate = null;
    for (const [d, v] of bySurface[s]) {
      if (v > peak) {
        peak = v;
        peakDate = d;
      }
      if (!latestDate || d > latestDate) latestDate = d;
    }
    let lastIndex = -1;
    chartData.forEach((row, i) => {
      if (row[s] != null) lastIndex = i;
    });
    stats[s] = { peak, peakDate, latest: bySurface[s].get(latestDate), latestDate, lastIndex };
  }
  if (!stats.overall) stats.overall = { peak: NaN, latest: NaN, lastIndex: -1 };

  return { chartData, surfaces, stats };
}

function eloAxis(chartData, surfaces) {
  let min = Infinity;
  let max = -Infinity;
  for (const row of chartData) {
    for (const s of surfaces) {
      const v = row[s];
      if (typeof v === "number") {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return niceTicks(1400, 1600);
  return niceTicks(min - 20, max + 20);
}
