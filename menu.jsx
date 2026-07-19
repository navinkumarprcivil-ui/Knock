/*!
 * Kuboos — KNOCK card game
 * Copyright (c) 2026 Kuboos. All rights reserved.
 * Licensed for use only at https://knockgame.netlify.app
 *
 * Unauthorized reproduction, distribution, modification, or
 * deployment to other domains is prohibited.
 */

/* KNOCK — Main menu */

function MainMenu({ onPick }) {
  const modes = [
    { id: 'bots',   label: 'Play vs Bots',              sub: 'Single player against AI',                  emoji: '🤖', tint: 'gold', enabled: true  },
    { id: 'local',  label: 'Single Device Multiplayer', sub: 'Pass the phone around — 2 to 6 players',    emoji: '📱', tint: 'blue', enabled: true  },
    { id: 'online', label: 'Online Multiplayer',         sub: 'Play with friends · room code',             emoji: '🌐', tint: 'red',  enabled: true  }
  ];
  return (
    <div className="screen" style={{ justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SoundToggles compact />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
        <div>
          <div className="title-logo">KNOCK</div>
          <div className="title-sub">A memory card game</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {modes.map(m => (
            <button
              key={m.id}
              className={"menu-card " + m.tint + (m.enabled ? '' : ' disabled')}
              onClick={() => { if (!m.enabled) return; AudioMgr.playSfx('click'); onPick(m.id); }}
            >
              <span className="menu-emoji">{m.emoji}</span>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div className="menu-label">{m.label}</div>
                <div className="menu-sub">{m.sub}</div>
              </div>
              <span className="menu-arrow">›</span>
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => window.dispatchEvent(new CustomEvent('show-help'))}>How to play</button>
    </div>
  );
}

function SoundToggles({ compact, onExit, onPause, mode }) {
  const [music, setMusic] = React.useState(AudioMgr.musicOn);
  const [sfx,   setSfx]   = React.useState(AudioMgr.sfxOn);
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button className="icon-btn" onClick={() => { AudioMgr.resume(); AudioMgr.setMusic(!music); setMusic(!music); }} title="Music">
        {music ? '🎵' : '🔇'}
      </button>
      <button className="icon-btn" onClick={() => { AudioMgr.resume(); AudioMgr.setSfx(!sfx); setSfx(!sfx); AudioMgr.playSfx('click'); }} title="Sound">
        {sfx ? '🔊' : '🔈'}
      </button>
      {mode === 'bots' && onPause && (
        <button className="icon-btn" onClick={() => { AudioMgr.playSfx('click'); onPause(); }} title="Pause">⏸</button>
      )}
      {onExit && (
        <button className="icon-btn" onClick={() => { AudioMgr.playSfx('click'); onExit(); }} title="Exit to menu">✕</button>
      )}
      <button className="icon-btn" onClick={() => window.dispatchEvent(new CustomEvent('show-help'))} title="How to play">?</button>
    </div>
  );
}

// NOTE: OnlineLobby is now defined in online-multiplayer.jsx (loaded after this file)
// and exported to window.OnlineLobby there — no stub needed here.

Object.assign(window, { MainMenu, SoundToggles });
