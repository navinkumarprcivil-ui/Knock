# Kuboos — Protection Setup

Copyright © 2026 Kuboos. All rights reserved.
Live site: https://knockgame.netlify.app

## What's been added

### 1. Copyright headers (✅ all files)
Every `.js`, `.jsx`, `.css`, and `.html` file now starts with a copyright notice. This gives you legal standing to file DMCA takedowns if someone redeploys your code.

To change the copyright holder, do a project-wide find-and-replace of `Copyright (c) 2026 Kuboos` with your name/company.

### 2. Domain lock (✅ in `app.jsx`)
The game refuses to run unless `window.location.hostname` matches one of:
- `knockgame.netlify.app` (production)
- `localhost` / `127.0.0.1` (local dev)
- Netlify deploy previews (`deploy-preview-N--knockgame.netlify.app`)
- Anthropic/Claude sandboxed iframes (for ongoing development)

To add more allowed domains (e.g. a custom domain), edit the `ALLOWED` array near the top of `app.jsx`.

⚠️ **A determined attacker can disable this in 30 seconds via browser DevTools.** It only stops zero-effort copy-paste piracy.

### 3. Firebase security rules (✅ in `FIREBASE-RULES.json`)
**This is the most important protection.** Right now your Firebase Realtime Database is in test mode — anyone can read, write, or wipe everything.

**To apply:**
1. Open https://console.firebase.google.com
2. Pick your `knock-954a0` project
3. Left sidebar → **Realtime Database** → **Rules** tab
4. Replace the existing rules with the contents of `FIREBASE-RULES.json`
5. Click **Publish**

These rules:
- Block anyone from reading/writing outside `/rooms`
- Limit chat to 200 chars, names to 14 chars
- Only the host can delete a room or kick players
- Only players in a room can write chat
- Block oversized or malformed writes

## What this does NOT protect against

- Someone copying your JS code, removing the domain lock, and self-hosting
- Someone reverse-engineering your Firebase config and creating rooms on your project
- Someone griefing rooms they're inside (writing bad gameState)

For full protection you'd need:
- Firebase Anonymous Auth + tighter rules using `auth.uid`
- Server-authoritative state (Cloud Functions) instead of client-writes
- A real build step with bundling + minification (esbuild / Vite / Webpack)

## Quick checks

After deploying:
- [ ] Visit https://knockgame.netlify.app → game loads
- [ ] Visit any other domain hosting the same files → "Unauthorized" page
- [ ] Open Firebase console → DB Rules tab → confirm new rules are published
- [ ] Test online multiplayer end-to-end on production
