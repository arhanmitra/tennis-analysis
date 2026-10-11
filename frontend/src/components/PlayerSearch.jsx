import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";
import { Flag } from "../ui/Flag";
import { CloseIcon, SearchIcon } from "../ui/icons";

// Debounced player search/autocomplete.
// The input is only ever a search field: the chosen player shows as a chip in
// the label row, so the box never reads as a select holding a value.
export default function PlayerSearch({ label, value, onChange, excludeId, activeOnly = false }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const debounceRef = useRef(null);
  const id = useId();
  const listId = `${id}-list`;

  useEffect(() => {
    if (!query) {
      setResults([]);
      setSearching(false);
      return;
    }
    clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const players = await api.searchPlayers(query, 8, activeOnly);
        setResults(players.filter((p) => p.player_id !== excludeId));
        setFailed(false);
      } catch {
        setResults([]);
        setFailed(true);
      } finally {
        setSearching(false);
        setHighlight(0);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, excludeId, activeOnly]);

  function choose(p) {
    onChange(p);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[highlight]);
    }
  }

  const showList = open && query;

  return (
    <div className="relative">
      <div className="mb-2 flex min-h-7 items-center justify-between gap-3">
        <label htmlFor={id} className="caps text-fog">
          {label}
        </label>
        {value && (
          <span className="flex min-w-0 items-center gap-2 border border-rule bg-raised py-0.5 pl-2 pr-0.5 text-sm text-star">
            <Flag ioc={value.ioc} size={10} />
            <span className="display truncate text-base leading-tight">{value.name}</span>
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={`Remove ${value.name} from ${label}`}
              className="grid size-6 shrink-0 place-items-center text-fog hover:text-star"
            >
              <CloseIcon size={12} />
            </button>
          </span>
        )}
      </div>
      <div className="relative">
        <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
        <input
          id={id}
          type="search"
          role="combobox"
          aria-expanded={Boolean(showList && results.length)}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={value ? "Search to change player" : "Type a player’s name"}
          className="h-11 w-full appearance-none border border-rule bg-night/60 pl-10 pr-9 text-[15px] text-star placeholder:text-fog hover:border-fog focus:border-emerald focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search text"
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-fog hover:text-star"
          >
            <CloseIcon size={14} />
          </button>
        )}
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto border border-rule bg-plate shadow-[0_12px_32px_rgb(0_0_0/0.5)]"
        >
          {results.length > 0 ? (
            results.map((p, i) => (
              <li
                key={p.player_id}
                role="option"
                aria-selected={i === highlight}
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2.5 ${
                  i === highlight ? "bg-raised text-star" : "text-mist"
                }`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={() => choose(p)}
              >
                <span className="display text-lg leading-none">{p.name}</span>
                {p.ioc && (
                  <span className="flex items-center gap-2">
                    <span className="caps text-fog">{p.ioc}</span>
                    <Flag ioc={p.ioc} size={12} />
                  </span>
                )}
              </li>
            ))
          ) : (
            <li className="px-3 py-3 text-sm text-fog">
              {searching
                ? "Searching…"
                : failed
                  ? "Search failed. Is the API running?"
                  : activeOnly
                    ? "No active player matches that name."
                    : "No player matches that name."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
