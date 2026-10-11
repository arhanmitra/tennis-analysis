import { useState } from "react";
import { api } from "../api";
import PlayerSearch from "../components/PlayerSearch";
import { usePlayerParams } from "../ui/usePlayerParam";
import { Button, EmptyState, ErrorState, LoadingState, PageHeading, Plate } from "../ui/atlas";
import { SURFACE_COLORS } from "../ui/chartTheme";
import { Flag } from "../ui/Flag";

const SURFACE_ORDER = ["Hard", "Clay", "Grass", "Carpet"];

export default function H2HExplorer() {
  const [playerA, setPlayerA] = useState(null);
  const [playerB, setPlayerB] = useState(null);
  const [data, setData] = useState(null);
  const [pair, setPair] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canLoad = playerA && playerB && playerA.player_id !== playerB.player_id;

  const persist = usePlayerParams(["a", "b"], (a, b) => {
    setPlayerA(a);
    setPlayerB(b);
    handleLoad(a, b);
  });

  async function handleLoad(a = playerA, b = playerB) {
    if (!a || !b || a.player_id === b.player_id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getH2H(a.player_id, b.player_id);
      setData(res);
      setPair({ a, b });
      persist(a, b);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeading title="Head to head">
        Every main-tour meeting between two players since 1968, with the record split by surface.
      </PageHeading>

      <div className="mb-8 grid items-end gap-4 md:grid-cols-[1fr_auto_1fr_auto]">
        <PlayerSearch key={`a-${playerA?.player_id ?? "none"}`} label="Player A" value={playerA} onChange={setPlayerA} excludeId={playerB?.player_id} />
        <span className="display hidden pb-2.5 text-lg text-fog md:block" aria-hidden="true">
          versus
        </span>
        <PlayerSearch key={`b-${playerB?.player_id ?? "none"}`} label="Player B" value={playerB} onChange={setPlayerB} excludeId={playerA?.player_id} />
        <Button onClick={() => handleLoad()} disabled={!canLoad || loading} className="h-11">
          {loading ? "Loading…" : "Compare"}
        </Button>
      </div>

      {error ? (
        <Plate>
          <ErrorState title="Couldn't load the head-to-head" error={error} onRetry={() => handleLoad()} />
        </Plate>
      ) : loading && !data ? (
        <Plate>
          <LoadingState label="Pulling the match record" />
        </Plate>
      ) : !data ? (
        <Plate title="Record">
          <EmptyState title="Choose two players">
            Retired players work here too, so you can try a rivalry from any era.
          </EmptyState>
        </Plate>
      ) : data.matches.length === 0 ? (
        <Plate title="Record">
          <EmptyState title="They never met">
            {pair.a.name} and {pair.b.name} have no main-tour matches against each other in the record.
          </EmptyState>
        </Plate>
      ) : (
        <Record data={data} a={pair.a} b={pair.b} dim={loading} />
      )}
    </>
  );
}

function Record({ data, a, b, dim }) {
  const total = data.player_a_wins + data.player_b_wins;
  const shareA = total ? data.player_a_wins / total : 0.5;
  const surfaces = SURFACE_ORDER.filter((s) => data.surface_breakdown[s]).concat(
    Object.keys(data.surface_breakdown).filter((s) => !SURFACE_ORDER.includes(s))
  );
  const maxMeetings = Math.max(
    1,
    ...surfaces.map((s) => data.surface_breakdown[s].player_a + data.surface_breakdown[s].player_b)
  );
  const matches = [...data.matches].sort((x, y) => (x.tourney_date < y.tourney_date ? 1 : -1));

  return (
    <div className={`space-y-8 transition-opacity ${dim ? "opacity-60" : ""}`}>
      <Plate title="Record" aside={`${total} meeting${total === 1 ? "" : "s"}`}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
          <div>
            <div className="display flex items-center gap-3 text-2xl leading-tight text-star sm:text-4xl">
              <Flag ioc={a.ioc} size={18} />
              <span className="min-w-0">{a.name}</span>
            </div>
            <div className="mt-2 text-5xl font-medium tabular-nums text-emerald sm:text-6xl">{data.player_a_wins}</div>
          </div>
          <span className="display pb-3 text-2xl text-fog">to</span>
          <div className="text-right">
            <div className="display flex items-center justify-end gap-3 text-2xl leading-tight text-star sm:text-4xl">
              <span className="min-w-0">{b.name}</span>
              <Flag ioc={b.ioc} size={18} />
            </div>
            <div className="mt-2 text-5xl font-medium tabular-nums text-star sm:text-6xl">{data.player_b_wins}</div>
          </div>
        </div>
        <div className="relative mt-6 flex h-2.5 border border-rule" aria-hidden="true">
          <div className="h-full bg-emerald/85" style={{ width: `${shareA * 100}%` }} />
          <div className="h-full flex-1 bg-star/25" />
          <span className="absolute -top-2 -bottom-2 left-1/2 w-px bg-mist/60" />
        </div>

        <h3 className="caps mt-8 mb-4 text-fog">By surface</h3>
        <ul className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {surfaces.map((s) => {
            const c = data.surface_breakdown[s];
            const n = c.player_a + c.player_b;
            return (
              <li key={s}>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-2 text-star">
                    <span className="size-2 rounded-full" style={{ background: SURFACE_COLORS[s] ?? "#8a95a8" }} />
                    {s}
                  </span>
                  <span className="tabular-nums">
                    <span className="text-emerald">{c.player_a}</span>
                    <span className="px-1.5 text-fog">–</span>
                    <span className="text-star">{c.player_b}</span>
                  </span>
                </div>
                {/* bar length is meetings on this surface; split shows who won them */}
                <div className="flex h-1.5 gap-0.5" style={{ width: `${(n / maxMeetings) * 100}%` }} aria-hidden="true">
                  {c.player_a > 0 && <span className="h-full bg-emerald/85" style={{ flex: c.player_a }} />}
                  {c.player_b > 0 && <span className="h-full bg-star/40" style={{ flex: c.player_b }} />}
                </div>
              </li>
            );
          })}
        </ul>
      </Plate>

      <Plate title="Match log" aside="newest first" bodyClassName="px-5 pb-5 pt-3 sm:px-6">
        {/* phones: each meeting as a short ruled entry, winner and score first */}
        <ol className="sm:hidden">
          {matches.map((m) => {
            const aWon = m.winner_id === a.player_id;
            return (
              <li key={m.match_id} className="border-b border-rule-soft py-3 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3 text-xs text-fog tabular-nums">
                  <span>{m.tourney_date}</span>
                  <span>
                    {m.surface} · {m.round}
                  </span>
                </div>
                <div className="mt-1 text-sm text-star">{m.tourney_name}</div>
                <div className="mt-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-star">
                    <span className={`size-1.5 rounded-full ${aWon ? "bg-emerald" : "bg-star"}`} aria-hidden="true" />
                    <Flag ioc={aWon ? a.ioc : b.ioc} size={10} />
                    {aWon ? a.name : b.name}
                  </span>
                  <span className="tabular-nums text-mist">{m.score}</span>
                </div>
              </li>
            );
          })}
        </ol>

        <table className="hidden w-full text-sm tabular-nums sm:table">
          <thead>
            <tr className="border-b border-rule text-left">
              {["Date", "Tournament", "Surface", "Round", "Winner", "Score"].map((h) => (
                <th key={h} className="caps py-2 pr-4 font-semibold text-fog">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => {
              const aWon = m.winner_id === a.player_id;
              return (
                <tr key={m.match_id} className="border-b border-rule-soft hover:bg-raised">
                  <td className="whitespace-nowrap py-2 pr-4 text-fog">{m.tourney_date}</td>
                  <td className="py-2 pr-4 text-star">{m.tourney_name}</td>
                  <td className="py-2 pr-4 text-mist">{m.surface}</td>
                  <td className="py-2 pr-4 text-mist">{m.round}</td>
                  <td className="whitespace-nowrap py-2 pr-4">
                    <span className="flex items-center gap-2">
                      <span className={`size-1.5 rounded-full ${aWon ? "bg-emerald" : "bg-star"}`} aria-hidden="true" />
                      <Flag ioc={aWon ? a.ioc : b.ioc} size={10} />
                      {aWon ? a.name : b.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-mist">{m.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Plate>
    </div>
  );
}
