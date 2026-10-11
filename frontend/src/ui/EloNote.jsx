import { Plate } from "./atlas";

// A two-column key that keeps this site's Elo rating apart from the official
// ATP ranking, shown wherever both appear side by side.
export function EloNote() {
  return (
    <Plate title="Elo is not the ATP ranking" bodyClassName="px-5 pb-5 pt-3 sm:px-6">
      <dl className="grid grid-cols-1 gap-x-10 gap-y-4 text-sm leading-relaxed md:grid-cols-2">
        <div>
          <dt className="mb-1 flex items-center gap-2 text-star">
            <span className="size-2 rounded-full bg-emerald" aria-hidden="true" />
            Elo rating <span className="text-fog">(this site’s model)</span>
          </dt>
          <dd className="text-mist text-pretty">
            A strength score built purely from match results. Beating a higher-rated player gains more than beating a
            lower-rated one, and losses work the same way in reverse. Everyone starts at 1500; around 1950 and up is
            top-ten level today. It never expires, so a long layoff leaves it frozen.
          </dd>
        </div>
        <div>
          <dt className="mb-1 flex items-center gap-2 text-star">
            <span className="size-2 rounded-full bg-star" aria-hidden="true" />
            ATP ranking <span className="text-fog">(official)</span>
          </dt>
          <dd className="text-mist text-pretty">
            A position (#1, #2, …) set by ranking points from tournaments in the last 52 weeks. Points depend on how far
            a player goes and the event’s level, not on who they beat, and they drop off after a year.
          </dd>
        </div>
      </dl>
      <p className="mt-4 border-t border-rule-soft pt-3 text-xs text-fog">
        A “#” in the surface standing and leaderboard is a position by Elo among active players. “ATP #” is the official
        ranking.
      </p>
    </Plate>
  );
}
