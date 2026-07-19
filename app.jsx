/*!
 * Kuboos — KNOCK card game
 * Copyright (c) 2026 Kuboos. All rights reserved.
 * Licensed for use only at https://knockgame.netlify.app
 *
 * Unauthorized reproduction, distribution, modification, or
 * deployment to other domains is prohibited.
 */

/* KNOCK — App entry — main menu router */

// ─── Domain lock ─────────────────────────────────────────────
// This game is licensed for use only on the domains listed below.
// Note: this is a client-side deterrent only; a determined attacker
// can disable it via DevTools. Legal protection comes from the
// copyright headers + Firebase security rules.
(function domainLock() {
  const ALLOWED = [
    'knockgame.netlify.app',
    'localhost',
    '127.0.0.1',
    '', // some sandbox iframes have empty hostname
  ];
  const host = (window.location.hostname || '').toLowerCase();
  // Allow Netlify deploy previews (deploy-preview-N--knockgame.netlify.app)
  const isNetlifyPreview = /^(deploy-preview-\d+--|[a-z0-9-]+--)knockgame\.netlify\.app$/i.test(host);
  // Allow Claude/Anthropic sandboxed preview iframes used during development
  const isClaudeSandbox = /\.claudeusercontent\.com$/i.test(host) || /\.anthropic\.com$/i.test(host);
  // Allow the platforms this repo can be deployed to:
  //   Firebase Hosting  → *.web.app / *.firebaseapp.com
  //   Vercel            → *.vercel.app
  //   GitHub Pages      → *.github.io
  const isDeployHost = /\.web\.app$/i.test(host) || /\.firebaseapp\.com$/i.test(host) || /\.vercel\.app$/i.test(host) || /\.github\.io$/i.test(host);
  if (!ALLOWED.includes(host) && !isNetlifyPreview && !isClaudeSandbox && !isDeployHost) {
    document.body.innerHTML = '<div style="padding:60px 20px;text-align:center;font-family:system-ui,sans-serif;color:#aaa;background:#0d2818;min-height:100vh;box-sizing:border-box"><h1 style="color:#f5c842;font-size:48px;margin:0 0 16px">Unauthorized</h1><p style="font-size:16px;max-width:480px;margin:0 auto 24px;line-height:1.5">This copy of <b>Kuboos — KNOCK</b> is not licensed for this domain.</p><p style="font-size:14px;opacity:0.6">Play the official version at <a href="https://knockgame.netlify.app" style="color:#f5c842">knockgame.netlify.app</a></p></div>';
    throw new Error('Unauthorized domain: ' + host);
  }
})();

function App() {
  const [screen,          setScreen]          = React.useState('menu');
  const [players,         setPlayers]         = React.useState([]);
  const [gameKey,         setGameKey]         = React.useState(0);
  const [showHelp,        setShowHelp]        = React.useState(false);
  const [onlineGameConfig, setOnlineGameConfig] = React.useState(null);

  React.useEffect(() => {
    AudioMgr.init();
    const startMusicOnce = () => {
      AudioMgr.resume();
      if (AudioMgr.musicOn) AudioMgr.startMusic();
      window.removeEventListener('pointerdown', startMusicOnce);
    };
    window.addEventListener('pointerdown', startMusicOnce);
    const onHelp = () => setShowHelp(true);
    window.addEventListener('show-help', onHelp);
    return () => {
      window.removeEventListener('pointerdown', startMusicOnce);
      window.removeEventListener('show-help', onHelp);
    };
  }, []);

  const goMenu = () => { setScreen('menu'); setGameKey(k => k + 1); setOnlineGameConfig(null); };

  let body;

  if (screen === 'menu') {
    body = <MainMenu onPick={(id) => {
      if (id === 'bots')   setScreen('bots');
      else if (id === 'local')  setScreen('local');
      else if (id === 'online') setScreen('online');
    }} />;

  } else if (screen === 'online') {
    body = <OnlineLobby
      onBack={goMenu}
      onGameStart={(config) => {
        setOnlineGameConfig(config);
        setScreen('online-game');
      }}
    />;

  } else if (screen === 'online-game' && onlineGameConfig) {
    body = <OnlineGameTable
      key={gameKey}
      roomCode={onlineGameConfig.roomCode}
      isHost={onlineGameConfig.isHost}
      myUid={onlineGameConfig.myUid}
      playerList={onlineGameConfig.playerList}
      onBack={goMenu}
    />;

  } else if (screen === 'bots') {
    body = <SetupScreen onStart={(p) => { setPlayers(p); setScreen('game-bots'); }} mode="bots" onBack={goMenu} />;

  } else if (screen === 'local') {
    body = <SetupScreen onStart={(p) => { setPlayers(p); setScreen('game-local'); }} mode="local" onBack={goMenu} />;

  } else if (screen === 'game-bots' || screen === 'game-local') {
    body = <GameTable
      key={gameKey}
      players={players}
      mode={screen === 'game-local' ? 'local' : 'bots'}
      onGameOver={() => { setGameKey(k => k + 1); }}
      onMenu={goMenu}
    />;
  }

  return (
    <div className="app">
      <div className="bg-orbs" aria-hidden="true">
        <div className="bg-orb o1"></div>
        <div className="bg-orb o2"></div>
        <div className="bg-orb o3"></div>
        <div className="bg-orb o4"></div>
        <div className="bg-orb o5"></div>
        <div className="bg-orb o6"></div>
      </div>
      {body}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
