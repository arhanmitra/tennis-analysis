// Base URL derived from window.location.hostname (not a hardcoded localhost) so
// this works both in local dev and when accessed via the Pi's LAN IP.
const API_BASE = `http://${window.location.hostname}:8002/api`;

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

export const api = {
  searchPlayers: (search, limit = 20, activeOnly = false) =>
    request(
      `/players?search=${encodeURIComponent(search)}&limit=${limit}&active_only=${activeOnly}`
    ),
  getPlayer: (playerId) => request(`/players/${encodeURIComponent(playerId)}`),
  predict: (body) =>
    request(`/predict`, { method: "POST", body: JSON.stringify(body) }),
  getRatings: (playerId) => request(`/ratings/${encodeURIComponent(playerId)}`),
  getRatingsVsRank: (playerId) =>
    request(`/ratings/${encodeURIComponent(playerId)}/vs-rank`),
  getH2H: (playerAId, playerBId) =>
    request(
      `/h2h?player_a=${encodeURIComponent(playerAId)}&player_b=${encodeURIComponent(playerBId)}`
    ),
  getModelPerformance: () => request(`/model/performance`),
  getLeaderboard: (surface = "overall", limit = 200) =>
    request(`/leaderboard?surface=${encodeURIComponent(surface)}&limit=${limit}`),
  getStanding: (playerId) => request(`/ratings/${encodeURIComponent(playerId)}/standing`),
};
