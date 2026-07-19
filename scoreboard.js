/*!
 * Kuboos — KNOCK card game
 * Copyright (c) 2026 Kuboos. All rights reserved.
 * Licensed for use only at https://knockgame.netlify.app
 *
 * Unauthorized reproduction, distribution, modification, or
 * deployment to other domains is prohibited.
 */

/* KNOCK — Scoreboard persistence (per room) */

const Scoreboard = {
  // Build a stable room id from the player names (sorted). Same players => same room.
  roomIdFor(players) {
    const names = players.map(p => p.name).sort();
    return 'knock-room::' + names.join('::').toLowerCase();
  },

  load(players) {
    const id = this.roomIdFor(players);
    try {
      const raw = localStorage.getItem(id);
      if (!raw) return this._empty(players);
      const data = JSON.parse(raw);
      // Make sure every current player has an entry (in case lineup changes)
      const scores = {};
      for (const p of players) {
        scores[p.name] = data.scores?.[p.name] || { points: 0, wins: 0, matches: 0 };
      }
      return {
        id,
        host: data.host || players[0].name,
        matches: data.matches || 0,
        scores,
      };
    } catch (e) {
      return this._empty(players);
    }
  },

  _empty(players) {
    const scores = {};
    for (const p of players) scores[p.name] = { points: 0, wins: 0, matches: 0 };
    return {
      id: this.roomIdFor(players),
      host: players[0].name,
      matches: 0,
      scores,
    };
  },

  save(state) {
    try {
      localStorage.setItem(state.id, JSON.stringify({
        host: state.host, matches: state.matches, scores: state.scores
      }));
    } catch (e) {}
  },

  reset(state) {
    const fresh = { ...state, matches: 0, scores: {} };
    for (const name of Object.keys(state.scores)) {
      fresh.scores[name] = { points: 0, wins: 0, matches: 0 };
    }
    this.save(fresh);
    return fresh;
  },

  // Award points after a match. ranking is [{ player, sum }, ...] sorted by sum asc.
  recordMatch(state, ranking) {
    const next = { ...state, matches: state.matches + 1, scores: { ...state.scores } };
    const n = ranking.length;
    ranking.forEach((row, idx) => {
      const name = row.player.name;
      const points = n - idx; // 1st = n points, 2nd = n-1, ... last = 1
      const prev = next.scores[name] || { points: 0, wins: 0, matches: 0 };
      next.scores[name] = {
        points: prev.points + points,
        wins: prev.wins + (idx === 0 ? 1 : 0),
        matches: prev.matches + 1,
      };
    });
    this.save(next);
    return next;
  },

  // Standings sorted by total points desc
  standings(state, players) {
    return players
      .map(p => ({ player: p, ...(state.scores[p.name] || { points: 0, wins: 0, matches: 0 }) }))
      .sort((a, b) => b.points - a.points || b.wins - a.wins);
  },
};

window.Scoreboard = Scoreboard;
