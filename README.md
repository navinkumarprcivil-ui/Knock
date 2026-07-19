# Kuboos — KNOCK 🂠

A real-time multiplayer card game (KNOCK). Static site: React + Babel transpiled
in the browser, with Firebase Realtime Database for online multiplayer.
No build step required.

**Live:** https://knockgame.netlify.app

---

## Project layout

- `index.html` — entry point, loads all scripts in order
- `app.jsx` — app router + domain lock
- `game-engine.jsx`, `bot-ai.jsx`, `game-table.jsx` — game logic
- `components-*.jsx`, `menu.jsx`, `tweaks-panel.jsx` — UI
- `online-multiplayer.jsx` — Firebase config + realtime sync
- `audio.js`, `voice.js`, `scoreboard.js`, `styles.css` — support
- `database.rules.json` — Firebase RTDB security rules
- `firebase.json` / `.firebaserc` — Firebase Hosting config
- `vercel.json` — Vercel config

---

## Deploy

The domain lock in `app.jsx` already allows `*.web.app`, `*.firebaseapp.com`,
`*.vercel.app`, and `*.github.io`. For a **custom domain**, add it to the
`ALLOWED` array near the top of `app.jsx`.

### GitHub

```bash
git init
git add .
git commit -m "Kuboos — KNOCK"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

**GitHub Pages:** repo Settings → Pages → Source: `main` / root. Site goes live at
`https://<you>.github.io/<repo>/`.

### Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase deploy                 # hosting + database rules
# or individually:
firebase deploy --only hosting
firebase deploy --only database
```

`.firebaserc` targets the `knock-954a0` project. Deploying also publishes
`database.rules.json`.

### Vercel

```bash
npm install -g vercel
vercel          # preview
vercel --prod   # production
```

Or import the GitHub repo at vercel.com — no framework preset, no build command,
output directory = root.

---

## Notes

- **Firebase config is public** — `apiKey` etc. in `online-multiplayer.jsx` are
  meant to be client-visible; the `database.rules.json` rules are what actually
  protect the database. Publish them.
- The domain lock is a client-side deterrent only. See `PROTECTION-README.md`.
