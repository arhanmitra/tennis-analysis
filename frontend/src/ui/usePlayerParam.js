import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";

// Keeps selected player ids in the URL (?p=…, or ?a=…&b=…) so a view can be
// shared or re-opened, and restores them once on first load.
export function usePlayerParams(keys, onRestore) {
  const [params, setParams] = useSearchParams();
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const ids = keys.map((k) => params.get(k));
    if (ids.some((id) => !id)) return;
    Promise.all(ids.map((id) => api.getPlayer(id)))
      .then((players) => onRestore(...players))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return function persist(...players) {
    const next = {};
    keys.forEach((k, i) => {
      if (players[i]) next[k] = players[i].player_id;
    });
    setParams(next, { replace: true });
  };
}
