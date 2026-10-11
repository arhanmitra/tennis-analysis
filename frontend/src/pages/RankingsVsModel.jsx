import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import PlayerSearch from "../components/PlayerSearch";
import { usePlayerParams } from "../ui/usePlayerParam";
import { Flag } from "../ui/Flag";
import { EloNote } from "../ui/EloNote";
import { EmptyState, ErrorState, LoadingState, PageHeading, Plate, Reading, Readings } from "../ui/atlas";
import { AtlasTooltip, INK, axisProps, dateLabel, downsample, gridProps, niceTicks, toTime, yearTick, yearTicks } from "../ui/chartTheme";

const RANK_OFFICIAL = INK.star;
const RANK_IMPLIED = INK.emerald;

export default function RankingsVsModel() {
  const [player, setPlayer] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const persist = usePlayerParams(["p"], (p) => loadPlayer(p));

  async function loadPlayer(p) {
    setPlayer(p);
    persist(p);
    setData(null);
    setError(null);
    if (!p) return;
    setLoading(true);
    try {
      setData(await api.getRatingsVsRank(p.player_id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const rows = data
    ? downsample(
        data.history.map((h) => ({
          date: h.as_of_date,
          t: toTime(h.as_of_date),
          elo: h.elo,
          official_rank: h.official_rank,
          predicted_rank: h.predicted_rank == null ? null : Math.max(1, h.predicted_rank),
        }))
      )
    : [];

  return (
    <>
      <PageHeading title="Rankings against the model">
        The official ATP ranking counts points from the last 52 weeks. Elo weighs who you beat. Where the two lines
        part, one system is seeing something the other isn’t.
      </PageHeading>

      <div className="mb-8">
        <EloNote />
      </div>

      <div className="mb-8 max-w-md">
        <PlayerSearch key={player?.player_id ?? "none"} label="Player" value={player} onChange={loadPlayer} />
      </div>

      {error ? (
        <Plate>
          <ErrorState title="Couldn't load the ranking history" error={error} onRetry={() => loadPlayer(player)} />
        </Plate>
      ) : loading ? (
        <Plate>
          <LoadingState label="Lining up rank and Elo" />
        </Plate>
      ) : !data ? (
        <Plate title="Official rank vs Elo-implied rank">
          <EmptyState title="Search a player to compare">
            Players whose results outrun their schedule, such as returners from injury, tend to show the widest gap.
          </EmptyState>
        </Plate>
      ) : rows.length === 0 ? (
        <Plate>
          <EmptyState title="No ranking history">There are no ranked matches for this player in the record.</EmptyState>
        </Plate>
      ) : (
        <Comparison rows={rows} history={data.history} name={player.name} ioc={player.ioc} />
      )}
    </>
  );
}

function Comparison({ rows, history, name, ioc }) {
  const latest = [...history].reverse().find((h) => h.official_rank != null && h.predicted_rank != null);
  const bestOfficial = history.reduce((m, h) => (h.official_rank != null && h.official_rank < m ? h.official_rank : m), Infinity);
  const gap = latest ? Math.round(latest.official_rank - latest.predicted_rank) : null;
  const maxRank = Math.max(
    10,
    ...rows.flatMap((r) => [r.official_rank, r.predicted_rank]).filter((v) => typeof v === "number")
  );
  // Log ticks up to the first one at or beyond the worst rank, so nothing clips.
  const allRankTicks = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  const ceilIndex = allRankTicks.findIndex((t) => t >= maxRank);
  const rankTicks = allRankTicks.slice(0, (ceilIndex === -1 ? allRankTicks.length - 1 : ceilIndex) + 1);
  const eloVals = rows.map((r) => r.elo).filter((v) => typeof v === "number");
  const eloAxis = niceTicks(Math.min(...eloVals) - 20, Math.max(...eloVals) + 20, 4);
  const tMin = rows[0].t;
  const tMax = rows[rows.length - 1].t;
  const xAxis = (
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
  );

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-8">
        <Plate
          title={
            <span className="flex items-center gap-2">
              Ranking · {name}
              <Flag ioc={ioc} size={10} />
            </span>
          }
          aside={
            <span className="flex items-center gap-4">
              <Key color={RANK_OFFICIAL} label="Official" />
              <Key color={RANK_IMPLIED} label="Elo-implied" dashed />
            </span>
          }
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={rows} syncId="rank-vs-elo" margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} vertical={false} />
              {xAxis}
              <YAxis
                {...axisProps}
                scale="log"
                domain={[1, rankTicks[rankTicks.length - 1]]}
                interval={0}
                ticks={rankTicks}
                reversed
                allowDataOverflow
                width={48}
                tickFormatter={(v) => `#${v}`}
              />
              <Tooltip
                cursor={{ stroke: INK.mist, strokeOpacity: 0.4 }}
                content={
                  <AtlasTooltip
                    title={dateLabel}
                    rows={(p) => [
                      ["Official", fmtRank(p[0]?.payload.official_rank), RANK_OFFICIAL],
                      ["Elo-implied", fmtRank(p[0]?.payload.predicted_rank), RANK_IMPLIED],
                    ]}
                  />
                }
              />
              <Line dataKey="official_rank" name="Official" stroke={RANK_OFFICIAL} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line
                dataKey="predicted_rank"
                name="Elo-implied"
                stroke={RANK_IMPLIED}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-3 text-xs leading-relaxed text-fog text-pretty">
            Log scale, #1 at the top. The Elo-implied rank comes from a curve fitted to about 350k historical (Elo,
            rank) pairs. It is a typical rank for that Elo, not a same-day leaderboard position.
          </p>
        </Plate>

        <Plate title="Overall Elo" aside={<Key color={INK.emerald} label="Elo" />}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={rows} syncId="rank-vs-elo" margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} vertical={false} />
              {xAxis}
              <YAxis {...axisProps} domain={eloAxis.domain} ticks={eloAxis.ticks} interval={0} allowDecimals={false} width={48} />
              <Tooltip
                cursor={{ stroke: INK.mist, strokeOpacity: 0.4 }}
                content={<AtlasTooltip title={dateLabel} rows={(p) => [["Elo", p[0]?.value == null ? null : Math.round(p[0].value), INK.emerald]]} />}
              />
              <Line dataKey="elo" stroke={INK.emerald} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Plate>
      </div>

      <Plate title="Latest reading" className="self-start" bodyClassName="px-5 pb-5 pt-2 sm:px-6">
        {latest ? (
          <>
            <Readings>
              <Reading label="Official" value={fmtRank(latest.official_rank)} />
              <Reading label="Elo-implied" value={fmtRank(latest.predicted_rank)} emphasis />
              <Reading label="Best official" value={fmtRank(bestOfficial)} />
              <Reading label="As of" value={latest.as_of_date} />
            </Readings>
            <p className="mt-4 text-sm leading-relaxed text-mist text-pretty">
              {Math.abs(gap) < 3
                ? "The ranking and the model agree on this player."
                : gap > 0
                  ? `Elo rates this player about ${gap} places higher than the official ranking does.`
                  : `The official ranking places this player about ${-gap} places higher than Elo would.`}
            </p>
          </>
        ) : (
          <p className="py-4 text-sm text-fog">No dated pair of official and Elo-implied rank to compare.</p>
        )}
      </Plate>
    </div>
  );
}

function Key({ color, label, dashed = false }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="16" height="2" aria-hidden="true">
        <line x1="0" x2="16" y1="1" y2="1" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "5 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}

function fmtRank(v) {
  return v == null || !Number.isFinite(v) ? null : `#${Math.round(v)}`;
}
