/* ============================================================
   KNOCK — Online Multiplayer via Firebase Realtime Database
   ============================================================

   SETUP (one-time, ~3 min):
   1. Go to https://console.firebase.google.com
   2. Click "Add project" → give it a name → Continue
   3. Skip Google Analytics → Create project
   4. Left sidebar → "Realtime Database" → Create database
      → Choose any region → Start in TEST MODE → Enable
   5. Left sidebar → ⚙ Project settings → "Your apps" section
      → Click </> (Web) → Register app → copy the firebaseConfig
   6. Paste your values into FIREBASE_CONFIG below

   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC85gsph4ZJf_LTK6i7ekPnT_gBauzyIes",
  authDomain:        "knock-954a0.firebaseapp.com",
  databaseURL:       "https://knock-954a0-default-rtdb.firebaseio.com",
  projectId:         "knock-954a0",
  storageBucket:     "knock-954a0.firebasestorage.app",
  messagingSenderId: "349921874873",
  appId:             "1:349921874873:web:197cb4febf2c99eea71c68"
};

// ─────────────────────────────────────────
// Firebase init (lazy, once)
// ─────────────────────────────────────────
let _fbApp = null;
function getDb() {
  if (!_fbApp) {
    if (!firebase?.apps?.length) {
      _fbApp = firebase.initializeApp(FIREBASE_CONFIG);
    } else {
      _fbApp = firebase.apps[0];
    }
  }
  return firebase.database();
}

// ─────────────────────────────────────────
// Player identity — survives page refresh
// ─────────────────────────────────────────
function getMyUid() {
  let uid = sessionStorage.getItem('knock-uid');
  if (!uid) {
    uid = 'u' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    sessionStorage.setItem('knock-uid', uid);
  }
  return uid;
}

// ─────────────────────────────────────────
// Room helpers
// ─────────────────────────────────────────
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 confusion
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function fbCreateRoom(myName) {
  const db  = getDb();
  const uid = getMyUid();
  let code  = generateRoomCode();
  for (let i = 0; i < 5; i++) {          // ensure unique code
    const snap = await db.ref('rooms/' + code).once('value');
    if (!snap.exists()) break;
    code = generateRoomCode();
  }
  await db.ref('rooms/' + code).set({
    code,
    hostUid:   uid,
    status:    'lobby',
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    players:   { [uid]: { name: myName, ready: false, order: 0 } }
  });
  return code;
}

async function fbJoinRoom(code, myName) {
  const db  = getDb();
  const uid = getMyUid();
  const snap = await db.ref('rooms/' + code).once('value');
  if (!snap.exists())               throw new Error('Room not found — check the code.');
  const room    = snap.val();
  if (room.status !== 'lobby')      throw new Error('Game already started.');
  const existing = room.players || {};
  if (uid in existing) return room;                            // already in room (rejoin)
  if (Object.keys(existing).length >= 6) throw new Error('Room is full (max 6 players).');
  const order = Object.keys(existing).length;
  await db.ref(`rooms/${code}/players/${uid}`).set({ name: myName, ready: false, order });
  return room;
}

async function fbSetReady(code, ready) {
  await getDb().ref(`rooms/${code}/players/${getMyUid()}/ready`).set(ready);
}

async function fbKickPlayer(code, targetUid) {
  await getDb().ref(`rooms/${code}/players/${targetUid}`).remove();
}

async function fbLeaveRoom(code) {
  await getDb().ref(`rooms/${code}/players/${getMyUid()}`).remove();
}

// ─────────────────────────────────────────
// Chat helpers
// ─────────────────────────────────────────
async function fbSendChat(code, name, text) {
  if (!text.trim()) return;
  await getDb().ref(`rooms/${code}/chat`).push({
    name,
    text: text.trim().slice(0, 200),
    at: firebase.database.ServerValue.TIMESTAMP,
  });
}

function useChat(code) {
  const [msgs, setMsgs] = React.useState([]);
  React.useEffect(() => {
    if (!code) return;
    const ref = getDb().ref(`rooms/${code}/chat`).limitToLast(50);
    const h   = ref.on('value', snap => {
      const val = snap.val();
      if (!val) { setMsgs([]); return; }
      setMsgs(Object.entries(val).map(([id, m]) => ({ id, ...m })).sort((a, b) => a.at - b.at));
    });
    return () => ref.off('value', h);
  }, [code]);
  return msgs;
}

// ─────────────────────────────────────────
// Chat panel component (used in lobby)
// ─────────────────────────────────────────
function LobbyChat({ roomCode, myName }) {
  const msgs        = useChat(roomCode);
  const [text, setText] = React.useState('');
  const bottomRef   = React.useRef(null);

  // Auto-scroll to latest message
  React.useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  const send = () => {
    if (!text.trim()) return;
    fbSendChat(roomCode, myName, text);
    setText('');
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 12, overflow: 'hidden',
      background: 'rgba(0,0,0,0.25)',
      marginTop: 10, flexShrink: 0,
    }}>
      {/* Title bar */}
      <div style={{ fontSize: 10, letterSpacing: 2, color: 'var(--gold)', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        💬 LOBBY CHAT
      </div>

      {/* Messages */}
      <div style={{ height: 130, overflowY: 'auto', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {msgs.length === 0 && (
          <div style={{ fontSize: 11, opacity: 0.35, textAlign: 'center', marginTop: 20 }}>No messages yet. Say hi! 👋</div>
        )}
        {msgs.map(m => (
          <div key={m.id} style={{ fontSize: 12, lineHeight: 1.4 }}>
            <span style={{ fontWeight: 900, color: m.name === myName ? 'var(--gold)' : 'rgba(255,255,255,0.75)' }}>
              {m.name === myName ? 'You' : m.name}:
            </span>
            {' '}
            <span style={{ opacity: 0.9 }}>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <input
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'white', fontSize: 13, padding: '8px 10px',
            fontFamily: 'inherit',
          }}
          value={text}
          placeholder="Type a message…"
          maxLength={200}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
        />
        <button
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: text.trim() ? 'var(--gold)' : 'rgba(255,255,255,0.25)',
            fontSize: 18, padding: '0 12px',
          }}
          onClick={send}
        >➤</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Game start — host builds initial state
// ─────────────────────────────────────────
async function fbStartGame(code, playersMap) {
  const ordered = Object.entries(playersMap)
    .sort((a, b) => a[1].order - b[1].order);
  const playerOrder = ordered.map(([uid]) => uid);
  const n = playerOrder.length;

  const deck0   = makeDeck();
  const dealt   = dealInitialHands(deck0, n);
  const hands   = {};
  playerOrder.forEach((uid, i) => { hands[uid] = dealt.hands[i]; });

  const gs = {
    phase:          'peek',
    playerOrder,
    currentIndex:   0,
    drawnCard:      null,
    deck:           dealt.deck,
    discard:        [],
    hands,
    peekReady:      Object.fromEntries(playerOrder.map(uid => [uid, false])),
    buzzWinnerUid:  null,
    knockerUid:     null,
    knockSuccess:   null,
    scores:         null,
    buzzOpenAt:     null,
  };

  await getDb().ref(`rooms/${code}`).update({ status: 'playing', gameState: gs });
}

async function fbUpdateGame(code, gs) {
  await getDb().ref(`rooms/${code}/gameState`).set(gs);
}

// ─────────────────────────────────────────
// Hook — subscribe to full room
// ─────────────────────────────────────────
function useRoom(code) {
  const [room, setRoom] = React.useState(null);
  React.useEffect(() => {
    if (!code) return;
    const ref  = getDb().ref('rooms/' + code);
    const h    = ref.on('value', snap => setRoom(snap.val()));
    return () => ref.off('value', h);
  }, [code]);
  return room;
}

// ─────────────────────────────────────────
// ■ ONLINE LOBBY SCREEN
// ─────────────────────────────────────────
function OnlineLobby({ onBack, onGameStart }) {
  const [view,     setView]     = React.useState('home'); // home | join | room
  const [myName,   setMyName]   = React.useState(() => localStorage.getItem('knock-name') || '');
  const [joinCode, setJoinCode] = React.useState('');
  const [roomCode, setRoomCode] = React.useState(null);
  const [isHost,   setIsHost]   = React.useState(false);
  const [error,    setError]    = React.useState('');
  const [loading,  setLoading]  = React.useState(false);

  const room  = useRoom(roomCode);
  const myUid = getMyUid();

  React.useEffect(() => {
    if (myName) localStorage.setItem('knock-name', myName);
  }, [myName]);

  // Game started → launch game
  React.useEffect(() => {
    if (!room || room.status !== 'playing' || !room.gameState) return;
    const players = room.players || {};
    const playerList = Object.entries(players)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([uid, p]) => ({ uid, name: p.name, order: p.order }));
    onGameStart({ roomCode, isHost, myUid, playerList });
  }, [room?.status]);

  // Kicked detection
  React.useEffect(() => {
    if (!roomCode || !room || room.status !== 'lobby') return;
    if (!(myUid in (room.players || {}))) {
      setError('You were removed from the room.');
      setRoomCode(null);
      setView('home');
    }
  }, [room?.players]);

  const saveName = () => {
    if (!myName.trim()) { setError('Enter your name first.'); return false; }
    setError(''); return true;
  };

  const handleCreate = async () => {
    if (!saveName()) return;
    setLoading(true);
    try {
      const code = await fbCreateRoom(myName.trim());
      setRoomCode(code); setIsHost(true); setView('room');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!saveName()) return;
    if (!joinCode.trim()) { setError('Enter a room code.'); return; }
    setLoading(true);
    try {
      await fbJoinRoom(joinCode.trim().toUpperCase(), myName.trim());
      setRoomCode(joinCode.trim().toUpperCase());
      setIsHost(false); setView('room');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleLeave = async () => {
    if (roomCode) await fbLeaveRoom(roomCode).catch(() => {});
    setRoomCode(null); setView('home');
  };

  // ── HOME ──
  if (view === 'home') return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
        <SoundToggles compact />
      </div>
      <div style={{ fontSize: 52 }}>🌐</div>
      <div className="title-logo" style={{ fontSize: 36 }}>ONLINE</div>

      <div style={{ width: '100%', maxWidth: 320 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: 'var(--gold)', marginBottom: 6 }}>YOUR NAME</div>
        <input
          className="player-input"
          style={{ width: '100%', fontSize: 18, padding: '10px 14px', boxSizing: 'border-box' }}
          value={myName}
          placeholder="Enter your name…"
          maxLength={14}
          onChange={e => { setMyName(e.target.value); setError(''); }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 }}>
        <button className="menu-card gold" onClick={handleCreate} disabled={loading}>
          <span className="menu-emoji">🏠</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div className="menu-label">Create Room</div>
            <div className="menu-sub">Host a game · get a room code</div>
          </div>
          <span className="menu-arrow">›</span>
        </button>
        <button className="menu-card blue" onClick={() => { if (saveName()) setView('join'); }}>
          <span className="menu-emoji">🚪</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div className="menu-label">Join Room</div>
            <div className="menu-sub">Enter a room code from your host</div>
          </div>
          <span className="menu-arrow">›</span>
        </button>
      </div>

      {error && <div style={{ color: '#ff9999', fontSize: 13, textAlign: 'center' }}>{error}</div>}
      <button className="btn btn-ghost" onClick={onBack}>← Back to menu</button>
    </div>
  );

  // ── JOIN ──
  if (view === 'join') return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      <div style={{ fontSize: 48 }}>🚪</div>
      <div className="title-logo" style={{ fontSize: 32 }}>JOIN ROOM</div>

      <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: 'var(--gold)', marginBottom: 6 }}>YOUR NAME</div>
          <input
            className="player-input"
            style={{ width: '100%', fontSize: 16, padding: '10px 14px', boxSizing: 'border-box' }}
            value={myName} placeholder="Your name…" maxLength={14}
            onChange={e => { setMyName(e.target.value); setError(''); }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: 'var(--gold)', marginBottom: 6 }}>ROOM CODE</div>
          <input
            className="player-input"
            style={{ width: '100%', fontSize: 28, padding: '10px 14px', letterSpacing: 10, textTransform: 'uppercase', textAlign: 'center', boxSizing: 'border-box' }}
            value={joinCode} placeholder="XXXXX" maxLength={5}
            onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
        </div>
      </div>

      {error && <div style={{ color: '#ff9999', fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-ghost" onClick={() => setView('home')}>← Back</button>
        <button className="btn btn-gold btn-lg" onClick={handleJoin} disabled={loading}>
          {loading ? 'Joining…' : 'Join Game →'}
        </button>
      </div>
    </div>
  );

  // ── ROOM LOBBY ──
  if (view === 'room') {
    const players    = room?.players || {};
    const playerList = Object.entries(players).sort((a, b) => a[1].order - b[1].order);
    const myData     = players[myUid];
    const myReady    = myData?.ready;
    const allNonHostReady = playerList
      .filter(([uid]) => uid !== room?.hostUid)
      .every(([, p]) => p.ready);

    return (
      <div className="screen" style={{ justifyContent: 'space-between' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="icon-btn" onClick={handleLeave} title="Leave room">‹</button>
          <SoundToggles compact />
        </div>

        {/* Room code */}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--gold)', marginBottom: 4 }}>ROOM CODE</div>
          <div className="title-logo" style={{ fontSize: 52, letterSpacing: 14 }}>{roomCode}</div>
          <div style={{ fontSize: 11, opacity: 0.55 }}>Share this code with friends</div>
        </div>

        {/* Player list */}
        <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {playerList.map(([uid, p], i) => {
            const isMe         = uid === myUid;
            const isPlayerHost = uid === room?.hostUid;
            return (
              <div
                key={uid}
                className="player-row"
                style={{
                  background: isMe ? 'rgba(245,200,66,0.12)' : 'rgba(0,0,0,0.25)',
                  border: isMe ? '2px solid var(--gold)' : '2px solid transparent'
                }}
              >
                <PlayerAvatar index={i} name={p.name} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 900, fontSize: 15 }}>
                    {p.name}
                    {isMe && ' (you)'}
                    {isPlayerHost && ' 👑'}
                  </span>
                </div>

                {/* Ready badge */}
                {!isPlayerHost && (
                  <span style={{
                    fontSize: 10, letterSpacing: 1, padding: '3px 8px', borderRadius: 999,
                    background: p.ready ? '#16a34a' : 'rgba(255,255,255,0.13)',
                    color: 'white', marginRight: isHost && !isMe ? 6 : 0
                  }}>
                    {p.ready ? '✓ READY' : 'WAITING'}
                  </span>
                )}
                {isPlayerHost && (
                  <span style={{ fontSize: 10, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: 'rgba(245,200,66,0.3)', color: 'var(--gold)' }}>
                    HOST
                  </span>
                )}

                {/* Kick button (host only, not on yourself) */}
                {isHost && !isMe && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 6, padding: '2px 8px', fontSize: 11, color: '#ff9999', border: '1px solid rgba(255,100,100,0.3)' }}
                    onClick={() => fbKickPlayer(roomCode, uid)}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}

          {playerList.length < 6 && (
            <div style={{ textAlign: 'center', fontSize: 12, opacity: 0.4, padding: 8, border: '2px dashed rgba(255,255,255,0.15)', borderRadius: 10 }}>
              Waiting for more players ({playerList.length}/6)…
            </div>
          )}
        </div>

        {/* Chat */}
        <LobbyChat roomCode={roomCode} myName={myName} />

        {error && <div style={{ color: '#ff9999', fontSize: 12, textAlign: 'center', marginTop: 4 }}>{error}</div>}

        {/* Bottom CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {!isHost && (
            <button
              className={'btn btn-lg ' + (myReady ? 'btn-ghost' : 'btn-gold')}
              onClick={() => fbSetReady(roomCode, !myReady)}
            >
              {myReady ? '✓ Ready — tap to cancel' : '✓ Click Ready'}
            </button>
          )}
          {isHost && (
            <>
              <button
                className="btn btn-gold btn-lg"
                disabled={playerList.length < 2}
                onClick={() => {
                  if (playerList.length < 2) { setError('Need at least 2 players to start.'); return; }
                  fbStartGame(roomCode, players);
                }}
              >
                {playerList.length < 2 ? 'Waiting for players…' : `▶ Start Game  (${playerList.length} players)`}
              </button>
              {playerList.length >= 2 && !allNonHostReady && (
                <div style={{ textAlign: 'center', fontSize: 11, opacity: 0.5 }}>
                  {playerList.filter(([uid, p]) => uid !== room?.hostUid && !p.ready).length} player(s) not ready · you can still start
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ─────────────────────────────────────────
// ■ ONLINE GAME TABLE
// ─────────────────────────────────────────
/*
  playerList: [{ uid, name, order }]  — stable from lobby
  isHost / myUid — from lobby
  Game state lives in Firebase: rooms/{roomCode}/gameState
  Active player writes the next state; all clients subscribe and re-render.
  Buzz winner is claimed atomically via Firebase transaction.
*/

const OG_PHASES = {
  PEEK:             'peek',
  TURN_START:       'turn-start',
  BUZZ:             'buzz',
  BUZZ_RESOLVE:     'buzz-resolve',
  POWER_PEEK_OWN:   'power-peek-own',
  POWER_PEEK_OTHER: 'power-peek-other',
  POWER_SWAP:       'power-swap',
  OVER:             'over',
};

const OG_BUZZ_SECS   = 6;
const OG_POWER_SECS  = 12;
const OG_DRAW_TIMEOUT = 20; // auto-draw if idle

function OnlineGameTable({ roomCode, isHost, myUid, playerList, onBack }) {
  const [gs,             setGs]             = React.useState(null);
  const [localPeeked,    setLocalPeeked]    = React.useState({});
  const [peekFlash,      setPeekFlash]      = React.useState(null); // { uid, slot, card }
  const [swapMine,       setSwapMine]       = React.useState(null);
  const [discardOpen,    setDiscardOpen]    = React.useState(false);
  const [buzzSecs,       setBuzzSecs]       = React.useState(OG_BUZZ_SECS);
  const [powerSecs,      setPowerSecs]      = React.useState(OG_POWER_SECS);
  const [toasts,         setToasts]         = React.useState([]);
  const gsRef = React.useRef(null);    // latest gs without stale closure

  const toastId = React.useRef(0);
  function toast(msg) {
    const id = ++toastId.current;
    setToasts(ts => [...ts, { id, msg }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 2400);
  }

  // ── Subscribe to game state ──
  React.useEffect(() => {
    const ref = getDb().ref(`rooms/${roomCode}/gameState`);
    const h   = ref.on('value', snap => {
      const val = snap.val();
      if (!val) return;
      gsRef.current = val;
      setGs(val);
      // Reset local UI when phase changes
      setSwapMine(null);
      setDiscardOpen(false);
    });
    return () => ref.off('value', h);
  }, [roomCode]);

  // ── Watch peek-ready — host advances when all done ──
  React.useEffect(() => {
    if (!gs || !isHost || gs.phase !== OG_PHASES.PEEK) return;
    const all = (gs.playerOrder || []).every(uid => (gs.peekReady || {})[uid]);
    if (all) fbUpdateGame(roomCode, { ...gs, phase: OG_PHASES.TURN_START });
  }, [JSON.stringify(gs?.peekReady), gs?.phase]);

  // ── Buzz countdown (drawer runs the clock) ──
  React.useEffect(() => {
    if (!gs || gs.phase !== OG_PHASES.BUZZ) return;
    const currentUid = gs.playerOrder[gs.currentIndex];
    if (currentUid !== myUid) return; // only drawer runs this
    setBuzzSecs(OG_BUZZ_SECS);
    const tick = setInterval(() => setBuzzSecs(s => s - 1), 1000);
    const expire = setTimeout(() => {
      clearInterval(tick);
      const latest = gsRef.current;
      if (!latest || latest.phase !== OG_PHASES.BUZZ || latest.buzzWinnerUid) return;
      fbUpdateGame(roomCode, advanceAfterNoBuzz(latest));
    }, OG_BUZZ_SECS * 1000);
    return () => { clearInterval(tick); clearTimeout(expire); };
  }, [gs?.phase, gs?.currentIndex]);

  // ── Power countdown (active player runs the clock) ──
  React.useEffect(() => {
    if (!gs) return;
    const isPower = [OG_PHASES.POWER_PEEK_OWN, OG_PHASES.POWER_PEEK_OTHER, OG_PHASES.POWER_SWAP].includes(gs.phase);
    if (!isPower) return;
    if (gs.playerOrder[gs.currentIndex] !== myUid) return;
    setPowerSecs(OG_POWER_SECS);
    const tick = setInterval(() => setPowerSecs(s => s - 1), 1000);
    const expire = setTimeout(() => {
      clearInterval(tick);
      const latest = gsRef.current;
      if (!latest || !isPowerPhase(latest.phase)) return;
      toast('⏰ Time up!');
      fbUpdateGame(roomCode, discardDrawnAndAdvance(latest));
    }, OG_POWER_SECS * 1000);
    return () => { clearInterval(tick); clearTimeout(expire); };
  }, [gs?.phase, gs?.currentIndex]);

  // ── Auto-draw idle timer (active player) ──
  React.useEffect(() => {
    if (!gs || gs.phase !== OG_PHASES.TURN_START) return;
    if (gs.playerOrder[gs.currentIndex] !== myUid) return;
    const t = setTimeout(() => {
      toast('⏰ Auto-drawing…');
      doDrawAndBuzz(gsRef.current);
    }, OG_DRAW_TIMEOUT * 1000);
    return () => clearTimeout(t);
  }, [gs?.phase, gs?.currentIndex]);

  // ── Helpers ──
  function isPowerPhase(phase) {
    return [OG_PHASES.POWER_PEEK_OWN, OG_PHASES.POWER_PEEK_OTHER, OG_PHASES.POWER_SWAP].includes(phase);
  }

  function drawOne(gs) {
    let deck    = [...(gs.deck    || [])];
    let discard = [...(gs.discard || [])];
    if (deck.length === 0) {
      if (discard.length === 0) return { gs, card: null };
      deck    = shuffle(discard);
      discard = [];
      toast('Deck reshuffled!');
    }
    const card = deck.shift();
    return { gs: { ...gs, deck, discard }, card };
  }

  function advanceTurn(gs) {
    const n = gs.playerOrder.length;
    return {
      ...gs,
      phase:        OG_PHASES.TURN_START,
      currentIndex: (gs.currentIndex + 1) % n,
      drawnCard:    null,
      buzzWinnerUid: null,
    };
  }

  function discardDrawnAndAdvance(gs) {
    const discard = gs.drawnCard ? [gs.drawnCard, ...(gs.discard || [])] : gs.discard || [];
    return advanceTurn({ ...gs, discard, drawnCard: null });
  }

  function advanceAfterNoBuzz(gs) {
    const card = gs.drawnCard;
    if (!card) return advanceTurn(gs);
    if (card.power === 'peek-own')   return { ...gs, phase: OG_PHASES.POWER_PEEK_OWN };
    if (card.power === 'peek-other') return { ...gs, phase: OG_PHASES.POWER_PEEK_OTHER };
    if (card.power === 'swap')       return { ...gs, phase: OG_PHASES.POWER_SWAP };
    return discardDrawnAndAdvance(gs);
  }

  function computeScores(hands) {
    const scores = {};
    for (const [uid, hand] of Object.entries(hands)) scores[uid] = handSum(hand || []);
    return scores;
  }

  // ── Actions ──
  function doDrawAndBuzz(gs) {
    if (!gs || gs.phase !== OG_PHASES.TURN_START) return;
    const { gs: gs2, card } = drawOne(gs);
    if (!card) { fbUpdateGame(roomCode, { ...gs2, phase: OG_PHASES.OVER, scores: computeScores(gs2.hands) }); return; }
    AudioMgr.playSfx('flip');
    toast(`You drew ${card.rank}${card.suit}`);
    fbUpdateGame(roomCode, { ...gs2, drawnCard: card, phase: OG_PHASES.BUZZ, buzzOpenAt: Date.now(), buzzWinnerUid: null });
  }

  function doKnock(gs) {
    const myHand = (gs.hands || {})[myUid] || [];
    if (myHand.length > 2) { toast('Can only knock with ≤2 cards!'); return; }
    AudioMgr.playSfx('knock');
    const scores      = computeScores(gs.hands || {});
    const myScore     = scores[myUid] || 0;
    const othersMin   = Math.min(...Object.entries(scores).filter(([uid]) => uid !== myUid).map(([, s]) => s));
    const knockSuccess = myScore <= othersMin;
    fbUpdateGame(roomCode, { ...gs, phase: OG_PHASES.OVER, knockerUid: myUid, knockSuccess, scores });
  }

  function doBuzz() {
    if (!gs || gs.phase !== OG_PHASES.BUZZ) return;
    if (gs.playerOrder[gs.currentIndex] === myUid) return; // drawer can't buzz
    if (gs.buzzWinnerUid) return;
    AudioMgr.playSfx('buzz');
    // Atomic claim: only first player to write wins
    getDb().ref(`rooms/${roomCode}/gameState/buzzWinnerUid`)
      .transaction(cur => (cur === null ? myUid : undefined))
      .then(({ committed }) => {
        if (committed) fbUpdateGame(roomCode, { ...gsRef.current, buzzWinnerUid: myUid, phase: OG_PHASES.BUZZ_RESOLVE });
      });
  }

  function doBuzzResolve(slot) {
    if (!gs || gs.buzzWinnerUid !== myUid) return;
    const hand     = [...((gs.hands || {})[myUid] || [])];
    const oldCard  = hand[slot];
    hand[slot]     = gs.drawnCard;
    const discard  = [oldCard, ...(gs.discard || [])];
    AudioMgr.playSfx('swap');
    fbUpdateGame(roomCode, advanceTurn({ ...gs, hands: { ...gs.hands, [myUid]: hand }, discard }));
  }

  function doDiscardClaim(slots) {
    if (!gs || !gs.drawnCard) return;
    setDiscardOpen(false);
    const hand    = [...((gs.hands || {})[myUid] || [])];
    const claimed = slots.map(s => hand[s]);
    const allMatch = claimed.every(c => c.rank === gs.drawnCard.rank);

    if (allMatch) {
      const sorted  = [...slots].sort((a, b) => b - a);
      const newHand = [...hand];
      sorted.forEach(s => newHand.splice(s, 1));
      const discard  = [...claimed, gs.drawnCard, ...(gs.discard || [])];
      AudioMgr.playSfx('discard-good');
      toast('✓ Match! Cards removed');
      if (newHand.length === 0) {
        const scores = computeScores({ ...gs.hands, [myUid]: newHand });
        fbUpdateGame(roomCode, { ...gs, hands: { ...gs.hands, [myUid]: newHand }, discard, drawnCard: null, phase: OG_PHASES.OVER, knockerUid: myUid, knockSuccess: true, scores });
      } else {
        fbUpdateGame(roomCode, advanceTurn({ ...gs, hands: { ...gs.hands, [myUid]: newHand }, discard, drawnCard: null }));
      }
    } else {
      // +2 penalty cards
      let deck    = [...(gs.deck || [])];
      let discard = [...(gs.discard || [])];
      const pen   = [];
      for (let i = 0; i < 2 && deck.length > 0; i++) pen.push(deck.shift());
      if (pen.length === 0 && discard.length > 0) {
        deck    = shuffle(discard); discard = [];
        for (let i = 0; i < 2 && deck.length > 0; i++) pen.push(deck.shift());
      }
      const newHand = [...pen, ...hand];
      AudioMgr.playSfx('discard-bad');
      toast('✗ Wrong guess! +' + pen.length + ' penalty cards');
      fbUpdateGame(roomCode, { ...gs, hands: { ...gs.hands, [myUid]: newHand }, deck, discard });
    }
  }

  function doPeekOwn(slot) {
    if (!gs) return;
    const hand = (gs.hands || {})[myUid] || [];
    const card = hand[slot];
    if (!card) return;
    AudioMgr.playSfx('peek');
    setPeekFlash({ uid: myUid, slot, card });
    setTimeout(() => {
      setPeekFlash(null);
      fbUpdateGame(roomCode, discardDrawnAndAdvance(gsRef.current));
    }, 3500);
  }

  function doPeekOther(targetUid, slot) {
    if (!gs) return;
    const card = ((gs.hands || {})[targetUid] || [])[slot];
    if (!card) return;
    AudioMgr.playSfx('peek');
    setPeekFlash({ uid: targetUid, slot, card });
    setTimeout(() => {
      setPeekFlash(null);
      fbUpdateGame(roomCode, discardDrawnAndAdvance(gsRef.current));
    }, 3500);
  }

  function doSwapMine(slot) {
    setSwapMine(slot);
    AudioMgr.playSfx('click');
  }

  function doSwapTheirs(targetUid, theirSlot) {
    if (swapMine === null || !gs) return;
    const myHands    = [...((gs.hands || {})[myUid] || [])];
    const theirHands = [...((gs.hands || {})[targetUid] || [])];
    const myCard     = myHands[swapMine];
    const theirCard  = theirHands[theirSlot];
    myHands[swapMine]     = theirCard;
    theirHands[theirSlot] = myCard;
    AudioMgr.playSfx('swap');
    setSwapMine(null);
    fbUpdateGame(roomCode, discardDrawnAndAdvance({ ...gs, hands: { ...gs.hands, [myUid]: myHands, [targetUid]: theirHands } }));
  }

  // ── Guard: loading ──
  if (!gs) return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <div style={{ fontSize: 40 }}>⏳</div>
      <div className="title-sub">Loading game…</div>
    </div>
  );

  const currentUid = (gs.playerOrder || [])[gs.currentIndex];
  const isMyTurn   = currentUid === myUid;
  const myHand     = (gs.hands || {})[myUid] || [];
  const opponents  = playerList.filter(p => p.uid !== myUid);
  const drawer     = playerList.find(p => p.uid === currentUid);

  // ── PEEK phase ──
  if (gs.phase === OG_PHASES.PEEK) {
    const peekReadyMe = (gs.peekReady || {})[myUid];
    const readyCount  = Object.values(gs.peekReady || {}).filter(Boolean).length;

    if (!peekReadyMe) {
      const baseIdx  = myHand.map((_, i) => i).filter(i => i >= 2);
      const allPeeked = baseIdx.every(i => localPeeked[i]);
      return (
        <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 14 }}>
          <div className="title-sub" style={{ letterSpacing: 4, fontSize: 11 }}>PEEK PHASE</div>
          <div className="title-logo" style={{ fontSize: 30 }}>YOUR CARDS</div>
          <div style={{ opacity: 0.75, fontSize: 13 }}>Tap your <b style={{ color: 'var(--gold)' }}>base cards</b> (bottom row) to memorize them</div>

          <div className="hand-grid" style={{ gridTemplateColumns: 'repeat(2, auto)', gap: 12 }}>
            {myHand.map((c, i) => {
              const isBase = i >= 2;
              const peeked = !!localPeeked[i];
              return (
                <div
                  key={c.id || i}
                  className={'hand-slot ' + (isBase && !peeked ? 'selectable power-target ' : isBase ? 'selectable ' : 'dim ')}
                  onClick={isBase ? () => { AudioMgr.playSfx('peek'); setLocalPeeked(p => ({ ...p, [i]: true })); } : undefined}
                >
                  <Card card={isBase && peeked ? c : null} faceUp={isBase && peeked} size={{ w: 84, h: 118 }} positionLabel={positionLabelFor(i, myHand.length)} />
                </div>
              );
            })}
          </div>

          {allPeeked ? (
            <button className="btn btn-gold btn-lg" onClick={() => {
              getDb().ref(`rooms/${roomCode}/gameState/peekReady/${myUid}`).set(true);
            }}>I'm ready →</button>
          ) : (
            <div style={{ fontSize: 11, opacity: 0.6 }}>{baseIdx.filter(i => localPeeked[i]).length}/{baseIdx.length} base cards peeked</div>
          )}

          <div style={{ fontSize: 11, opacity: 0.45 }}>{readyCount}/{(gs.playerOrder || []).length} players ready</div>
        </div>
      );
    }

    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 44 }}>⏳</div>
        <div className="title-logo" style={{ fontSize: 28 }}>WAITING…</div>
        <div style={{ opacity: 0.7 }}>{readyCount}/{(gs.playerOrder || []).length} players ready</div>
      </div>
    );
  }

  // ── GAME OVER ──
  if (gs.phase === OG_PHASES.OVER) {
    const scores  = gs.scores || computeScores(gs.hands || {});
    const ranking = (gs.playerOrder || [])
      .map(uid => ({ uid, name: playerList.find(p => p.uid === uid)?.name || uid, score: scores[uid] ?? 0 }))
      .sort((a, b) => a.score - b.score);
    const winner = ranking[0];
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <div style={{ fontSize: 56 }}>🏆</div>
        <div className="title-logo" style={{ fontSize: 38 }}>{winner.name.toUpperCase()} WINS!</div>
        {gs.knockerUid && (
          <div className="title-sub" style={{ fontSize: 10 }}>
            {gs.knockSuccess ? `KNOCK SUCCESS · ${playerList.find(p => p.uid === gs.knockerUid)?.name}` : `BAD KNOCK · ${playerList.find(p => p.uid === gs.knockerUid)?.name}`}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320, marginTop: 8 }}>
          {ranking.map((r, i) => (
            <div key={r.uid} className="player-row" style={{ background: i === 0 ? 'rgba(245,200,66,0.18)' : 'rgba(0,0,0,0.25)' }}>
              <span style={{ fontSize: 18, opacity: 0.6, width: 24 }}>{i + 1}</span>
              <PlayerAvatar index={playerList.findIndex(p => p.uid === r.uid)} name={r.name} />
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 900 }}>{r.name}{r.uid === myUid ? ' (you)' : ''}</span>
              <span style={{ fontWeight: 900, color: 'var(--gold)' }}>{r.score}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-gold btn-lg" onClick={onBack}>Back to Menu</button>
      </div>
    );
  }

  // ── MAIN GAME VIEW ──
  const discardTop = (gs.discard || [])[0] || null;

  // Determine interactive slots
  const canPickOwnSlot  = isMyTurn && (gs.phase === OG_PHASES.POWER_PEEK_OWN || (gs.phase === OG_PHASES.POWER_SWAP && swapMine === null));
  const canPickTheirSlot = isMyTurn && (gs.phase === OG_PHASES.POWER_PEEK_OTHER || (gs.phase === OG_PHASES.POWER_SWAP && swapMine !== null));
  const isBuzzPhase      = gs.phase === OG_PHASES.BUZZ;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6, padding: '8px 10px', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* ─ Header ─ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <SoundToggles compact onExit={onBack} />
        <div style={{ fontSize: 11, color: isMyTurn ? 'var(--gold)' : 'rgba(255,255,255,0.6)', letterSpacing: 1, fontWeight: 900 }}>
          {isMyTurn ? '⚡ YOUR TURN' : `${drawer?.name || '?'}'s turn`}
        </div>
      </div>

      {/* ─ Opponents ─ */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        {opponents.map(p => {
          const theirHand   = (gs.hands || {})[p.uid] || [];
          const isActive    = p.uid === currentUid;
          const theirIdx    = playerList.findIndex(pl => pl.uid === p.uid);
          const selectTheirSlots = canPickTheirSlot ? theirHand.map((_, i) => i) : [];
          const theirPeekSlot = peekFlash?.uid === p.uid ? peekFlash.slot : null;
          return (
            <div
              key={p.uid}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '6px 10px', borderRadius: 12,
                background: isActive ? 'rgba(245,200,66,0.2)' : 'rgba(0,0,0,0.2)',
                border: isActive ? '2px solid var(--gold)' : '2px solid transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <PlayerAvatar index={theirIdx} name={p.name} size={20} />
                <span style={{ fontWeight: 900, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ opacity: 0.5 }}>·{theirHand.length}</span>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                {theirHand.map((c, i) => {
                  const isRevealed  = theirPeekSlot === i;
                  const isSelectable = selectTheirSlots.includes(i);
                  return (
                    <div
                      key={c.id || i}
                      className={'hand-slot ' + (isSelectable ? 'selectable power-target ' : '') + (isRevealed ? 'peek-flash ' : '')}
                      onClick={isSelectable ? () => {
                        if (gs.phase === OG_PHASES.POWER_PEEK_OTHER) doPeekOther(p.uid, i);
                        else if (gs.phase === OG_PHASES.POWER_SWAP)  doSwapTheirs(p.uid, i);
                      } : undefined}
                      style={{ cursor: isSelectable ? 'pointer' : 'default' }}
                    >
                      <Card card={isRevealed ? c : null} faceUp={isRevealed} size={{ w: 44, h: 62 }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─ Center: deck + drawn card + status ─ */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20, padding: '6px 0', flexShrink: 0 }}>
        {/* Deck */}
        <div style={{ textAlign: 'center' }}>
          <Card
            card={null} faceUp={false} size={{ w: 64, h: 90 }}
            className={isMyTurn && gs.phase === OG_PHASES.TURN_START ? 'selectable lifted' : ''}
            onClick={isMyTurn && gs.phase === OG_PHASES.TURN_START ? () => doDrawAndBuzz(gs) : undefined}
          />
          <div style={{ fontSize: 10, opacity: 0.45, marginTop: 2 }}>{(gs.deck || []).length} left</div>
        </div>

        {/* Center status */}
        <div style={{ textAlign: 'center', minWidth: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          {gs.drawnCard && <Card card={gs.drawnCard} faceUp size={{ w: 64, h: 90 }} />}
          {!gs.drawnCard && discardTop && <Card card={discardTop} faceUp size={{ w: 64, h: 90 }} style={{ opacity: 0.45 }} />}
          {!gs.drawnCard && !discardTop && <div style={{ width: 64, height: 90, border: '2px dashed rgba(255,255,255,0.18)', borderRadius: 8 }} />}

          {isBuzzPhase && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <CountdownRing secondsLeft={buzzSecs} total={OG_BUZZ_SECS} size={40} />
            </div>
          )}
          {isPowerPhase(gs.phase) && isMyTurn && (
            <CountdownRing secondsLeft={powerSecs} total={OG_POWER_SECS} size={40} />
          )}
        </div>
      </div>

      {/* ─ Action area ─ */}
      <div style={{ textAlign: 'center', flexShrink: 0, minHeight: 70 }}>

        {gs.phase === OG_PHASES.TURN_START && isMyTurn && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-gold btn-lg" onClick={() => doDrawAndBuzz(gs)}>Draw Card</button>
            {myHand.length <= 2 && (
              <button className="btn btn-danger" onClick={() => doKnock(gs)}>🤛 Knock!</button>
            )}
          </div>
        )}

        {gs.phase === OG_PHASES.TURN_START && !isMyTurn && (
          <div style={{ opacity: 0.6, fontSize: 13 }}>Waiting for {drawer?.name} to draw…</div>
        )}

        {isBuzzPhase && !isMyTurn && !gs.buzzWinnerUid && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-gold btn-lg" style={{ fontSize: 18 }} onClick={doBuzz}>🔔 BUZZ!</button>
            {gs.drawnCard && (
              <button className="btn btn-ghost btn-sm" onClick={() => setDiscardOpen(true)}>Discard Claim</button>
            )}
          </div>
        )}

        {isBuzzPhase && !isMyTurn && gs.buzzWinnerUid && gs.buzzWinnerUid !== myUid && (
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            {playerList.find(p => p.uid === gs.buzzWinnerUid)?.name} buzzed!
          </div>
        )}

        {isBuzzPhase && !isMyTurn && gs.buzzWinnerUid === myUid && (
          <div style={{ color: 'var(--gold)', fontWeight: 900 }}>You buzzed! Pick a card below to swap ↓</div>
        )}

        {isBuzzPhase && isMyTurn && (
          <div style={{ opacity: 0.55, fontSize: 12 }}>
            {gs.buzzWinnerUid
              ? `${playerList.find(p => p.uid === gs.buzzWinnerUid)?.name} buzzed!`
              : 'Buzz window open… (you drew, can\'t buzz)'}
          </div>
        )}

        {gs.phase === OG_PHASES.BUZZ_RESOLVE && gs.buzzWinnerUid !== myUid && (
          <div style={{ opacity: 0.6, fontSize: 13 }}>
            {playerList.find(p => p.uid === gs.buzzWinnerUid)?.name} is picking their swap…
          </div>
        )}

        {gs.phase === OG_PHASES.POWER_PEEK_OWN && (
          <div style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 900 }}>
            {isMyTurn ? '7/8 — Tap one of YOUR cards to peek ↓' : `${drawer?.name} is peeking their card…`}
          </div>
        )}

        {gs.phase === OG_PHASES.POWER_PEEK_OTHER && (
          <div style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 900 }}>
            {isMyTurn ? '9/10 — Tap an opponent\'s card ↑ to peek' : `${drawer?.name} is peeking your card…`}
          </div>
        )}

        {gs.phase === OG_PHASES.POWER_SWAP && (
          <div style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 900 }}>
            {isMyTurn
              ? (swapMine === null ? 'J/Q/A — Pick YOUR card to give away ↓' : 'Now tap an opponent\'s card ↑ to receive')
              : `${drawer?.name} is swapping cards…`}
          </div>
        )}
      </div>

      {/* ─ My hand ─ */}
      <div style={{ marginTop: 'auto', flexShrink: 0 }}>
        <div style={{ fontSize: 10, textAlign: 'center', letterSpacing: 2, opacity: 0.5, marginBottom: 4 }}>YOUR HAND</div>
        <div className="hand-grid" style={{ gridTemplateColumns: `repeat(${Math.min(myHand.length, 4)}, auto)`, justifyContent: 'center' }}>
          {myHand.map((c, i) => {
            const selectable   = canPickOwnSlot;
            const selected     = swapMine === i;
            const isBuzzWinner = gs.phase === OG_PHASES.BUZZ_RESOLVE && gs.buzzWinnerUid === myUid;
            const myPeekFlash  = peekFlash?.uid === myUid && peekFlash?.slot === i;
            return (
              <div
                key={c.id || i}
                className={
                  'hand-slot ' +
                  (selectable || isBuzzWinner ? 'selectable power-target ' : '') +
                  (selected ? 'selected ' : '') +
                  (myPeekFlash ? 'peek-flash ' : '')
                }
                onClick={() => {
                  if (isBuzzWinner)                  { doBuzzResolve(i); return; }
                  if (gs.phase === OG_PHASES.POWER_PEEK_OWN && isMyTurn) { doPeekOwn(i); return; }
                  if (gs.phase === OG_PHASES.POWER_SWAP && isMyTurn && swapMine === null) { doSwapMine(i); return; }
                }}
              >
                <Card
                  card={myPeekFlash ? c : null}
                  faceUp={myPeekFlash}
                  size={{ w: 64, h: 90 }}
                  positionLabel={positionLabelFor(i, myHand.length)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ─ Peek flash overlay ─ */}
      {peekFlash && (
        <div className="modal-backdrop" style={{ pointerEvents: 'none' }}>
          <div className="modal" style={{ gap: 12, textAlign: 'center' }}>
            <div className="modal-title" style={{ fontSize: 14 }}>
              {peekFlash.uid === myUid ? 'Your card' : `${playerList.find(p => p.uid === peekFlash.uid)?.name}'s card`}
            </div>
            <Card card={peekFlash.card} faceUp size={{ w: 84, h: 118 }} />
            <div style={{ fontSize: 12, opacity: 0.6 }}>Memorize it…</div>
          </div>
        </div>
      )}

      {/* ─ Buzz resolve modal ─ */}
      {gs.phase === OG_PHASES.BUZZ_RESOLVE && gs.buzzWinnerUid === myUid && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-title">You buzzed! Pick a card to swap</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ textAlign: 'center', fontSize: 11, opacity: 0.7 }}>
                <div>You'll receive</div>
                <Card card={gs.drawnCard} faceUp size={{ w: 56, h: 80 }} />
              </div>
            </div>
            <div className="hand-grid" style={{ gridTemplateColumns: `repeat(${Math.min(myHand.length, 4)}, auto)` }}>
              {myHand.map((c, i) => (
                <div key={c.id || i} className="hand-slot selectable power-target" onClick={() => doBuzzResolve(i)}>
                  <Card card={null} faceUp={false} size={{ w: 56, h: 80 }} positionLabel={positionLabelFor(i, myHand.length)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─ Discard claim modal ─ */}
      {discardOpen && gs.drawnCard && (
        <OnlineDiscardModal
          hand={myHand}
          drawnCard={gs.drawnCard}
          onPick={doDiscardClaim}
          onCancel={() => setDiscardOpen(false)}
        />
      )}

      {/* ─ Toasts ─ */}
      <ToastStack toasts={toasts} />
    </div>
  );
}

// ─────────────────────────────────────────
// Discard claim modal (self-contained)
// ─────────────────────────────────────────
function OnlineDiscardModal({ hand, drawnCard, onPick, onCancel }) {
  const [picked, setPicked] = React.useState({});
  const pickedSlots = Object.keys(picked).filter(k => picked[k]).map(Number);
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-title">Discard all {drawnCard.rank}s</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <div style={{ textAlign: 'center', fontSize: 11, opacity: 0.7 }}>
            <div>Match this</div>
            <Card card={drawnCard} faceUp size={{ w: 48, h: 68 }} />
          </div>
        </div>
        <div className="modal-body" style={{ fontSize: 12 }}>
          Tap cards you think match. All must be the same rank.<br />
          <span style={{ color: '#ff9999' }}>Any wrong → +2 penalty cards.</span>
        </div>
        <div className="hand-grid" style={{ gridTemplateColumns: `repeat(${Math.min(hand.length, 4)}, auto)` }}>
          {hand.map((c, i) => (
            <div
              key={c.id || i}
              className={'hand-slot selectable ' + (picked[i] ? 'selected' : '')}
              onClick={() => setPicked(p => ({ ...p, [i]: !p[i] }))}
            >
              <Card card={null} faceUp={false} size={{ w: 52, h: 74 }} positionLabel={positionLabelFor(i, hand.length)} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-gold"
            style={{ flex: 2 }}
            disabled={pickedSlots.length === 0}
            onClick={() => onPick(pickedSlots)}
          >
            Discard {pickedSlots.length || ''} card{pickedSlots.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OnlineLobby, OnlineGameTable });
