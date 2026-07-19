/* KNOCK — App entry — main menu router */

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
      {body}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
