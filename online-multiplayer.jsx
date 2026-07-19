/*!
 * Kuboos — KNOCK card game
 * Copyright (c) 2026 Kuboos. All rights reserved.
 * Licensed for use only at https://knockgame.netlify.app
 *
 * Unauthorized reproduction, distribution, modification, or
 * deployment to other domains is prohibited.
 */

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
    phase:          'spin',
    playerOrder,
    currentIndex:   Math.floor(Math.random() * playerOrder.length),
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
    lastEvent:      null,
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

  // Presence: mark connected, set onDisconnect to flip to false + lastSeen
  React.useEffect(() => {
    if (!roomCode) return;
    const db = getDb();
    const myConnRef    = db.ref(`rooms/${roomCode}/players/${myUid}/connected`);
    const myLastSeenRef = db.ref(`rooms/${roomCode}/players/${myUid}/lastSeen`);
    myConnRef.set(true);
    myLastSeenRef.set(firebase.database.ServerValue.TIMESTAMP);
    // When tab closes / network drops, mark offline + stamp lastSeen
    myConnRef.onDisconnect().set(false);
    myLastSeenRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
    // Heartbeat: refresh lastSeen every 4s while alive
    const beat = setInterval(() => {
      myLastSeenRef.set(firebase.database.ServerValue.TIMESTAMP).catch(() => {});
    }, 4000);
    return () => {
      clearInterval(beat);
      // Cleanup the onDisconnect handlers so re-mount doesn't leave stale ones
      myConnRef.onDisconnect().cancel().catch(() => {});
      myLastSeenRef.onDisconnect().cancel().catch(() => {});
    };
  }, [roomCode, myUid]);

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
                    {p.connected === false && (
                      <span title="Disconnected" style={{ fontSize: 10, color: '#ff9999', marginLeft: 6 }}>● off</span>
                    )}
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
                disabled={playerList.length < 2 || !allNonHostReady}
                onClick={() => fbStartGame(roomCode, players)}
              >
                {playerList.length < 2
                  ? 'Waiting for players…'
                  : !allNonHostReady
                    ? `⏳ ${playerList.filter(([uid, p]) => uid !== room?.hostUid && !p.ready).length} player(s) not ready…`
                    : `▶ Start Game (${playerList.length} players)`}
              </button>
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
  SPIN:             'spin',
  PEEK:             'peek',
  TURN_START:       'turn-start',
  BUZZ:             'buzz',
  BUZZ_RESOLVE:     'buzz-resolve',
  POWER_PEEK_OWN:   'power-peek-own',
  POWER_PEEK_OTHER: 'power-peek-other',
  POWER_SWAP:       'power-swap',
  OVER:             'over',
};

const OG_BUZZ_SECS   = 8;   // matches offline buzz window (kid/elder-friendly pacing)
const OG_POWER_SECS  = 15;  // matches offline power window
const OG_DRAW_TIMEOUT = 20; // auto-draw if idle

// Tamil cheers — rotate for a correct discard; one phrase for a wrong discard
const OG_TAMIL_POSITIVE = ['Adichi Thooku', 'Pottu Thaaku', 'Vera Maari'];
const OG_TAMIL_FAIL = 'Vada Pochey';
function ogTamilCheer() { return OG_TAMIL_POSITIVE[Math.floor(Math.random() * OG_TAMIL_POSITIVE.length)]; }
const OG_BUZZ_RESOLVE_SECS = 12; // buzz winner must pick slot within this
const OG_WATCHDOG_GRACE_MS = 3500; // any client can advance after expiry + grace
const OG_DISCONNECT_GRACE_MS = 8000; // active player considered gone after this

function OnlineGameTable({ roomCode, isHost, myUid, playerList, onBack }) {
  const [gs,             setGs]             = React.useState(null);
  const [presence,       setPresence]       = React.useState({}); // { uid: { connected, lastSeen } }
  const [localPeeked,    setLocalPeeked]    = React.useState({});
  const [peekFlash,      setPeekFlash]      = React.useState(null); // { uid, slot, card }
  const [swapMine,       setSwapMine]       = React.useState(null);
  const [discardOpen,    setDiscardOpen]    = React.useState(false);
  const [, forceTick]    = React.useReducer(x => (x + 1) % 1000000, 0);
  const [toasts,         setToasts]         = React.useState([]);
  const [chatOpen,       setChatOpen]       = React.useState(false);
  const [chatUnread,     setChatUnread]     = React.useState(0);
  const [achievement,    setAchievement]    = React.useState(null);
  const [confirmModal,   setConfirmModal]   = React.useState(null);
  const myName = playerList.find(p => p.uid === myUid)?.name || 'Me';

  // Local phase-start stamp → drives clock-independent countdown rings on EVERY client
  const phaseStartRef  = React.useRef(0);
  const lastEventIdRef = React.useRef(null); // de-dupe broadcast events
  const seenSnapRef    = React.useRef(false); // suppress replay of the snapshot present at mount
  // Compute live seconds-left for a timed phase. Prefer the authoritative phaseExpiresAt
  // (shared in gameState → identical on every client); fall back to local entry stamp.
  function secsLeft(totalSecs) {
    const exp = gsRef.current?.phaseExpiresAt;
    if (exp) return Math.max(0, Math.min(totalSecs, Math.ceil((exp - Date.now()) / 1000)));
    const elapsed = (Date.now() - phaseStartRef.current) / 1000;
    return Math.max(0, Math.ceil(totalSecs - elapsed));
  }

  function showAchievement(kind, title, sub, ms = 1600) {
    setAchievement({ kind, title, sub });
    setTimeout(() => setAchievement(null), ms);
  }
  const gsRef = React.useRef(null);    // latest gs without stale closure

  const toastId = React.useRef(0);
  function toast(msg) {
    const id = ++toastId.current;
    setToasts(ts => [...ts, { id, msg }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 2400);
  }

  const phaseRef = React.useRef(null); // track previous phase for selective UI resets

  // ── Subscribe to game state ──
  React.useEffect(() => {
    const ref = getDb().ref(`rooms/${roomCode}/gameState`);
    const h   = ref.on('value', snap => {
      const val = snap.val();
      if (!val) return;
      gsRef.current = val;
      setGs(val);
      // Only reset local UI when PHASE changes (not on every heartbeat / timer tick)
      if (val.phase !== phaseRef.current) {
        phaseRef.current = val.phase;
        phaseStartRef.current = Date.now(); // restart this client's countdown clock
        setSwapMine(null);
        setDiscardOpen(false); // safe to close modal on phase change
      }
      // Shared feedback: replay broadcast events (buzz/discard/knock/peek/swap) on EVERY screen.
      const ev   = val.lastEvent;
      const evId = ev ? ev.id : null;
      if (!seenSnapRef.current) {
        seenSnapRef.current = true;
        lastEventIdRef.current = evId; // adopt the current event without replaying it
      } else if (evId && evId !== lastEventIdRef.current) {
        lastEventIdRef.current = evId;
        if (ev.ach)   showAchievement(ev.ach.kind, ev.ach.title, ev.ach.sub);
        if (ev.toast) toast(ev.toast);
      }
    });
    return () => ref.off('value', h);
  }, [roomCode]);

  // Build a gameState carrying a broadcast event everyone will see.
  function withEvent(gsObj, ev) {
    const id = Date.now() + '-' + Math.floor(Math.random() * 100000);
    return { ...gsObj, lastEvent: { id, ...ev } };
  }

  // ── Subscribe to players' presence (connected + lastSeen) ──
  React.useEffect(() => {
    const ref = getDb().ref(`rooms/${roomCode}/players`);
    const h   = ref.on('value', snap => {
      const val = snap.val() || {};
      const map = {};
      for (const [uid, p] of Object.entries(val)) {
        map[uid] = { connected: p.connected !== false, lastSeen: p.lastSeen || 0 };
      }
      setPresence(map);
    });
    return () => ref.off('value', h);
  }, [roomCode]);

  // ── Presence: mark self connected with onDisconnect cleanup ──
  React.useEffect(() => {
    const db = getDb();
    const myConnRef    = db.ref(`rooms/${roomCode}/players/${myUid}/connected`);
    const myLastSeenRef = db.ref(`rooms/${roomCode}/players/${myUid}/lastSeen`);
    myConnRef.set(true);
    myLastSeenRef.set(firebase.database.ServerValue.TIMESTAMP);
    myConnRef.onDisconnect().set(false);
    myLastSeenRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
    const beat = setInterval(() => {
      myLastSeenRef.set(firebase.database.ServerValue.TIMESTAMP).catch(() => {});
    }, 4000);
    return () => {
      clearInterval(beat);
      myConnRef.onDisconnect().cancel().catch(() => {});
      myLastSeenRef.onDisconnect().cancel().catch(() => {});
    };
  }, [roomCode, myUid]);

  // ── Watchdog: any client can force-advance if phase has expired ──
  // This protects against active player ghosting (closed tab, dead battery, network drop)
  React.useEffect(() => {
    const tick = setInterval(() => {
      const latest = gsRef.current;
      if (!latest || !latest.phaseExpiresAt) return;
      // Don't touch terminal phases
      if (latest.phase === OG_PHASES.OVER || latest.phase === OG_PHASES.PEEK) return;
      const now = Date.now();
      const activeUid = latest.playerOrder?.[latest.currentIndex];
      const activeConnected = activeUid ? (presence[activeUid]?.connected !== false) : true;
      const expired = now > latest.phaseExpiresAt + OG_WATCHDOG_GRACE_MS;
      const activeGoneAwhile = activeUid && !activeConnected
        && (presence[activeUid]?.lastSeen || 0) > 0
        && (now - (presence[activeUid]?.lastSeen || 0)) > OG_DISCONNECT_GRACE_MS;
      if (!expired && !activeGoneAwhile) return;

      // Use a transaction so only ONE client succeeds
      const ref = getDb().ref(`rooms/${roomCode}/gameState`);
      ref.transaction(curr => {
        if (!curr || !curr.phaseExpiresAt) return; // abort
        if (curr.phase === OG_PHASES.OVER || curr.phase === OG_PHASES.PEEK) return;
        const stillExpired = Date.now() > curr.phaseExpiresAt + OG_WATCHDOG_GRACE_MS;
        if (!stillExpired && !activeGoneAwhile) return;
        // Build next state based on phase
        return computeForcedAdvance(curr);
      }).catch(() => {});
    }, 1500);
    return () => clearInterval(tick);
  }, [roomCode, JSON.stringify(presence)]);

  // ── Watch peek-ready — host advances when all done ──
  React.useEffect(() => {
    if (!gs || !isHost || gs.phase !== OG_PHASES.PEEK) return;
    const all = (gs.playerOrder || []).every(uid => (gs.peekReady || {})[uid]);
    if (all) fbUpdateGame(roomCode, { ...gs, phase: OG_PHASES.TURN_START });
  }, [JSON.stringify(gs?.peekReady), gs?.phase]);

  // ── Universal ticker: re-render countdown rings on EVERY client during timed phases ──
  React.useEffect(() => {
    if (!gs) return;
    const timed = gs.phase === OG_PHASES.BUZZ || isPowerPhase(gs.phase) || gs.phase === OG_PHASES.BUZZ_RESOLVE;
    if (!timed) return;
    const t = setInterval(() => forceTick(), 250);
    return () => clearInterval(t);
  }, [gs?.phase]);

  // ── Buzz window: everyone hears the call; the drawer owns the authoritative expiry ──
  React.useEffect(() => {
    if (!gs || gs.phase !== OG_PHASES.BUZZ) return;
    if (window.Voice) window.Voice.say('Buzz now!', { key: 'buzz', cooldown: 5000 });
    const currentUid = gs.playerOrder[gs.currentIndex];
    if (currentUid !== myUid) return; // only drawer drives the advance
    const ms = Math.max(0, (gs.phaseExpiresAt || Date.now()) - Date.now());
    const expire = setTimeout(() => {
      const latest = gsRef.current;
      if (!latest || latest.phase !== OG_PHASES.BUZZ || latest.buzzWinnerUid) return;
      fbUpdateGame(roomCode, advanceAfterNoBuzz(latest));
    }, ms);
    return () => clearTimeout(expire);
  }, [gs?.phase, gs?.currentIndex]);

  React.useEffect(() => {
    if (!gs) return;
    const isPower = [OG_PHASES.POWER_PEEK_OWN, OG_PHASES.POWER_PEEK_OTHER, OG_PHASES.POWER_SWAP].includes(gs.phase);
    if (!isPower) return;
    if (gs.playerOrder[gs.currentIndex] !== myUid) return;
    if (window.Voice) {
      if (gs.phase === OG_PHASES.POWER_PEEK_OWN) window.Voice.say('Peek your own card', { key: 'p-own', cooldown: 6000 });
      else if (gs.phase === OG_PHASES.POWER_PEEK_OTHER) window.Voice.say('Peek an opponent card', { key: 'p-other', cooldown: 6000 });
      else window.Voice.say('Swap a card', { key: 'p-swap', cooldown: 6000 });
    }
  }, [gs?.phase, gs?.currentIndex]);

  React.useEffect(() => {
    if (!gs || gs.phase !== OG_PHASES.TURN_START) return;
    if (gs.playerOrder[gs.currentIndex] !== myUid) return;
    if (window.Voice) window.Voice.say(`${myName}, your turn`, { key: 'turn', cooldown: 0 });
  }, [gs?.phase, gs?.currentIndex]);

  // ── Power window: active player owns expiry → AUTO-USE the power (parity with offline) ──
  React.useEffect(() => {
    if (!gs) return;
    if (!isPowerPhase(gs.phase)) return;
    if (gs.playerOrder[gs.currentIndex] !== myUid) return;
    const ms = Math.max(0, (gs.phaseExpiresAt || Date.now()) - Date.now());
    const expire = setTimeout(() => {
      const latest = gsRef.current;
      if (!latest || !isPowerPhase(latest.phase)) return;
      if (latest.playerOrder[latest.currentIndex] !== myUid) return;
      autoUsePower(latest);
    }, ms);
    return () => clearTimeout(expire);
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
      swapAnim:     null,
      peekAnim:     null,
      phase:        OG_PHASES.TURN_START,
      currentIndex: (gs.currentIndex + 1) % n,
      drawnCard:    null,
      buzzWinnerUid: null,
      phaseExpiresAt: Date.now() + OG_DRAW_TIMEOUT * 1000,
    };
  }

  function discardDrawnAndAdvance(gs) {
    // If drawn card was already consumed (e.g. taken by a buzz winner), don't re-discard it
    const consumed = gs.drawnConsumed === true;
    const discard = (gs.drawnCard && !consumed) ? [gs.drawnCard, ...(gs.discard || [])] : (gs.discard || []);
    return advanceTurn({ ...gs, discard, drawnCard: null, drawnConsumed: false });
  }

  function advanceAfterNoBuzz(gs) {
    const card = gs.drawnCard;
    if (!card) return advanceTurn(gs);
    if (card.power === 'peek-own')   return { ...gs, phase: OG_PHASES.POWER_PEEK_OWN, phaseExpiresAt: Date.now() + OG_POWER_SECS * 1000 };
    if (card.power === 'peek-other') return { ...gs, phase: OG_PHASES.POWER_PEEK_OTHER, phaseExpiresAt: Date.now() + OG_POWER_SECS * 1000 };
    if (card.power === 'swap')       return { ...gs, phase: OG_PHASES.POWER_SWAP, phaseExpiresAt: Date.now() + OG_POWER_SECS * 1000 };
    return discardDrawnAndAdvance(gs);
  }

  function computeScores(hands) {
    const scores = {};
    for (const [uid, hand] of Object.entries(hands)) scores[uid] = handSum(hand || []);
    return scores;
  }

  // Compute the next state when the watchdog detects an expired phase.
  // Returns the new gameState OR undefined to abort.
  // ── Random-pick helper for auto-power ──
  function rSlot(hand) { return Math.floor(Math.random() * Math.max(1, (hand || []).length)); }

  function computeForcedAdvance(curr) {
    const p = curr.phase;
    if (p === OG_PHASES.TURN_START) {
      // Active player didn't draw → draw for them
      let deck    = [...(curr.deck    || [])];
      let discard = [...(curr.discard || [])];
      if (deck.length === 0) {
        if (discard.length === 0) {
          return { ...curr, phase: OG_PHASES.OVER, scores: computeScores(curr.hands || {}) };
        }
        deck    = shuffle(discard);
        discard = [];
      }
      const card = deck.shift();
      return {
        ...curr,
        deck,
        discard,
        drawnCard: card,
        phase: OG_PHASES.BUZZ,
        buzzOpenAt: Date.now(),
        buzzWinnerUid: null,
        phaseExpiresAt: Date.now() + OG_BUZZ_SECS * 1000,
      };
    }
    if (p === OG_PHASES.BUZZ) {
      // No buzz → power or discard
      const card = curr.drawnCard;
      if (!card) return advanceTurn(curr);
      if (card.power === 'peek-own')   return { ...curr, phase: OG_PHASES.POWER_PEEK_OWN, phaseExpiresAt: Date.now() + OG_POWER_SECS * 1000 };
      if (card.power === 'peek-other') return { ...curr, phase: OG_PHASES.POWER_PEEK_OTHER, phaseExpiresAt: Date.now() + OG_POWER_SECS * 1000 };
      if (card.power === 'swap')       return { ...curr, phase: OG_PHASES.POWER_SWAP, phaseExpiresAt: Date.now() + OG_POWER_SECS * 1000 };
      return discardDrawnAndAdvance(curr);
    }
    if (p === OG_PHASES.BUZZ_RESOLVE) {
      // Buzz winner ghosted → discard drawn card, lose their swap chance, advance
      return discardDrawnAndAdvance({ ...curr, buzzWinnerUid: null });
    }
    if (p === OG_PHASES.POWER_PEEK_OWN || p === OG_PHASES.POWER_PEEK_OTHER) {
      // Drawer ghosted mid-power — a peek reveals nothing public, so just end the turn
      return discardDrawnAndAdvance(curr);
    }
    if (p === OG_PHASES.POWER_SWAP) {
      const drawerUid = curr.playerOrder[curr.currentIndex];
      const others    = curr.playerOrder.filter(uid => uid !== drawerUid);
      if (others.length > 0) {
        const myH = [...(curr.hands[drawerUid] || [])];
        const targetUid = others[Math.floor(Math.random() * others.length)];
        const thH = [...(curr.hands[targetUid] || [])];
        const ms = rSlot(myH), ts = rSlot(thH);
        if (myH[ms] && thH[ts]) {
          const tmp = myH[ms]; myH[ms] = thH[ts]; thH[ts] = tmp;
          return discardDrawnAndAdvance({ ...curr, hands: { ...curr.hands, [drawerUid]: myH, [targetUid]: thH }, swapAnim: { kind: 'swap', fromUid: drawerUid, fromSlot: ms, toUid: targetUid, toSlot: ts, at: Date.now() } });
        }
      }
      return discardDrawnAndAdvance(curr);
    }
    return undefined;
  }

  // ── Actions ──
  function doDrawAndBuzz(gs) {
    if (!gs || gs.phase !== OG_PHASES.TURN_START) return;
    const { gs: gs2, card } = drawOne(gs);
    if (!card) { fbUpdateGame(roomCode, { ...gs2, phase: OG_PHASES.OVER, scores: computeScores(gs2.hands) }); return; }
    AudioMgr.playSfx('flip');
    // Broadcast the draw so EVERY player sees who drew what (parity with single-device offline)
    fbUpdateGame(roomCode, withEvent({
      ...gs2,
      drawnCard: card,
      phase: OG_PHASES.BUZZ,
      buzzOpenAt: Date.now(),
      buzzWinnerUid: null,
      swapAnim: null,
      peekAnim: null,
      phaseExpiresAt: Date.now() + OG_BUZZ_SECS * 1000,
    }, { toast: `${myName} drew ${card.rank}${card.suit}` }));
  }

  // Knock opens a confirmation first (parity with offline) — no accidental knocks
  function doKnock(gs) {
    const myHand = (gs.hands || {})[myUid] || [];
    if (myHand.length > 2) { toast('Can only knock with ≤2 cards!'); return; }
    setConfirmModal({
      title: '🤜 KNOCK',
      body: `End the round now? You'll only win if you have the lowest sum.`,
      confirmLabel: 'KNOCK',
      gold: true,
      onConfirm: () => { setConfirmModal(null); doKnockConfirmed(gsRef.current); },
      onCancel: () => setConfirmModal(null),
    });
  }

  function doKnockConfirmed(gs) {
    if (!gs) return;
    const myHand = (gs.hands || {})[myUid] || [];
    if (myHand.length > 2) { toast('Can only knock with ≤2 cards!'); return; }
    AudioMgr.playSfx('knock');
    if (window.Voice) window.Voice.say('Knock!', { cooldown: 0 });
    const scores   = computeScores(gs.hands || {});
    const myScore  = scores[myUid] || 0;
    const allScores = Object.values(scores);
    const minS     = Math.min(...allScores);
    // Success only if knocker has the SOLE lowest sum (matches bots mode rule)
    const success  = myScore === minS && allScores.filter(s => s === minS).length === 1;
    if (success) {
      fbUpdateGame(roomCode, withEvent({ ...gs, phase: OG_PHASES.OVER, knockerUid: myUid, knockSuccess: true, scores },
        { ach: { kind: 'win', title: `🏆 ${myName} KNOCKED!`, sub: 'Lowest sum — round over' } }));
    } else {
      // Wrong knock: +1 penalty card, game CONTINUES
      let deck    = [...(gs.deck || [])];
      let discard = [...(gs.discard || [])];
      const pen = [];
      if (deck.length > 0) { pen.push(deck.shift()); }
      else if (discard.length > 0) { deck = shuffle(discard); discard = []; pen.push(deck.shift()); }
      const newHands = { ...gs.hands, [myUid]: [...(gs.hands[myUid] || []), ...pen] };
      fbUpdateGame(roomCode, withEvent(advanceTurn({ ...gs, hands: newHands, deck, discard, knockerUid: myUid, knockSuccess: false }),
        { ach: { kind: 'fail', title: `💥 ${myName} BAD KNOCK`, sub: '+1 penalty card — game continues' } }));
    }
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
        if (committed) fbUpdateGame(roomCode, {
          ...gsRef.current,
          buzzWinnerUid: myUid,
          phase: OG_PHASES.BUZZ_RESOLVE,
          phaseExpiresAt: Date.now() + OG_BUZZ_RESOLVE_SECS * 1000,
        });
      });
  }

  function doBuzzResolve(slot) {
    if (!gs || gs.buzzWinnerUid !== myUid) return;
    const hand     = [...((gs.hands || {})[myUid] || [])];
    const oldCard  = hand[slot];
    const drawn    = gs.drawnCard;
    const drawnPower = drawn?.power;
    hand[slot]     = drawn;
    const discard  = [oldCard, ...(gs.discard || [])];
    AudioMgr.playSfx('swap');
    // Broadcast swap animation (timestamped so every client glow-flashes the slot)
    const swapAnim = { kind: 'buzz', toUid: myUid, toSlot: slot, at: Date.now() };
    const ach = { kind: 'win', title: `🔔 ${myName} BUZZED!`, sub: `Swapped in the ${drawn.rank}` };
    const base = withEvent({ ...gs, hands: { ...gs.hands, [myUid]: hand }, discard, buzzWinnerUid: null, swapAnim }, { ach });
    if (drawnPower === 'peek-own') {
      fbUpdateGame(roomCode, { ...base, drawnConsumed: true, phase: OG_PHASES.POWER_PEEK_OWN, phaseExpiresAt: Date.now() + OG_POWER_SECS * 1000 });
    } else if (drawnPower === 'peek-other') {
      fbUpdateGame(roomCode, { ...base, drawnConsumed: true, phase: OG_PHASES.POWER_PEEK_OTHER, phaseExpiresAt: Date.now() + OG_POWER_SECS * 1000 });
    } else if (drawnPower === 'swap') {
      fbUpdateGame(roomCode, { ...base, drawnConsumed: true, phase: OG_PHASES.POWER_SWAP, phaseExpiresAt: Date.now() + OG_POWER_SECS * 1000 });
    } else {
      fbUpdateGame(roomCode, advanceTurn({ ...base, drawnConsumed: false }));
    }
  }

  // DISCARD is a SIDE-ACTION (parity with offline): it removes matching cards but does
  // NOT end the turn, consume the drawn card, or change phase. Run as a transaction so a
  // concurrent buzz/expire write from the drawer is never clobbered.
  function doDiscardClaim(slots) {
    const live = gsRef.current;
    if (!live || !live.drawnCard) return;
    setDiscardOpen(false);
    const ref = getDb().ref(`rooms/${roomCode}/gameState`);
    ref.transaction(curr => {
      if (!curr || !curr.drawnCard) return; // card no longer live → abort
      const hand    = [...((curr.hands || {})[myUid] || [])];
      const claimed = slots.map(s => hand[s]);
      if (claimed.some(c => !c)) return; // stale indices → abort
      const allMatch = claimed.every(c => c.rank === curr.drawnCard.rank);
      const id = Date.now() + '-' + Math.floor(Math.random() * 100000);
      if (allMatch) {
        const sorted  = [...slots].sort((a, b) => b - a);
        const newHand = [...hand];
        sorted.forEach(s => newHand.splice(s, 1));
        const discard = [...claimed, ...(curr.discard || [])];
        return {
          ...curr,
          hands: { ...curr.hands, [myUid]: newHand },
          discard,
          lastEvent: { id, ach: { kind: 'win', title: `🎉 ${myName} — ${ogTamilCheer()}!`, sub: `Removed ${slots.length} card${slots.length > 1 ? 's' : ''}` } },
        };
      } else {
        // Wrong: +2 penalty (one on top, one on the base — same shape as offline)
        let deck    = [...(curr.deck || [])];
        let discard = [...(curr.discard || [])];
        const pen   = [];
        for (let i = 0; i < 2 && deck.length > 0; i++) pen.push(deck.shift());
        if (pen.length < 2 && discard.length > 0) {
          deck = shuffle(discard); discard = [];
          while (pen.length < 2 && deck.length > 0) pen.push(deck.shift());
        }
        const newHand = pen.length === 2 ? [pen[0], ...hand, pen[1]] : [...pen, ...hand];
        return {
          ...curr,
          hands: { ...curr.hands, [myUid]: newHand },
          deck, discard,
          lastEvent: { id, ach: { kind: 'fail', title: `💥 ${myName} — ${OG_TAMIL_FAIL}!`, sub: 'No cards removed — +2 penalty' } },
        };
      }
    }).then(({ committed, snapshot }) => {
      if (!committed) return;
      const after = snapshot.val();
      const myLen = ((after.hands || {})[myUid] || []).length;
      const myPrev = ((live.hands || {})[myUid] || []).length;
      if (myLen < myPrev) { AudioMgr.playSfx('discard-good'); if (window.Voice) window.Voice.say('Great discard!', { cooldown: 0 }); }
      else                { AudioMgr.playSfx('discard-bad');  if (window.Voice) window.Voice.say('Wrong card! Penalty!', { cooldown: 0 }); }
    }).catch(() => {});
  }

  function doPeekOwn(slot) {
    const live = gsRef.current;
    if (!live) return;
    const card = ((live.hands || {})[myUid] || [])[slot];
    if (!card) return;
    AudioMgr.playSfx('peek');
    setPeekFlash({ uid: myUid, slot, card }); // private reveal to peeker only
    // Broadcast WHICH slot is peeked (not the value) + a public toast; hold off the watchdog during the reveal
    fbUpdateGame(roomCode, withEvent({ ...live, peekAnim: { drawerUid: myUid, targetUid: myUid, slot }, phaseExpiresAt: Date.now() + 4000 },
      { toast: `${myName} peeked at their own card` }));
    setTimeout(() => {
      setPeekFlash(null);
      fbUpdateGame(roomCode, discardDrawnAndAdvance({ ...gsRef.current, peekAnim: null }));
    }, 3500);
  }

  function doPeekOther(targetUid, slot) {
    const live = gsRef.current;
    if (!live) return;
    const card = ((live.hands || {})[targetUid] || [])[slot];
    if (!card) return;
    const targetName = playerList.find(p => p.uid === targetUid)?.name || 'opponent';
    AudioMgr.playSfx('peek');
    setPeekFlash({ uid: targetUid, slot, card }); // private reveal to peeker only
    fbUpdateGame(roomCode, withEvent({ ...live, peekAnim: { drawerUid: myUid, targetUid, slot }, phaseExpiresAt: Date.now() + 4000 },
      { toast: `${myName} peeked at ${targetName}'s card` }));
    setTimeout(() => {
      setPeekFlash(null);
      fbUpdateGame(roomCode, discardDrawnAndAdvance({ ...gsRef.current, peekAnim: null }));
    }, 3500);
  }

  function doSwapMine(slot) {
    setSwapMine(slot);
    AudioMgr.playSfx('click');
  }

  function doSwapTheirs(targetUid, theirSlot) {
    if (swapMine === null) return;
    doSwapResolve(swapMine, targetUid, theirSlot, gsRef.current);
    setSwapMine(null);
  }

  // Shared swap core — used by manual swap and by auto-use-on-timeout
  function doSwapResolve(mySlot, targetUid, theirSlot, live) {
    if (!live) return;
    const myHands    = [...((live.hands || {})[myUid] || [])];
    const theirHands = [...((live.hands || {})[targetUid] || [])];
    if (!myHands[mySlot] || !theirHands[theirSlot]) { fbUpdateGame(roomCode, discardDrawnAndAdvance(live)); return; }
    const myCard     = myHands[mySlot];
    const theirCard  = theirHands[theirSlot];
    myHands[mySlot]       = theirCard;
    theirHands[theirSlot] = myCard;
    AudioMgr.playSfx('swap');
    const targetName = playerList.find(p => p.uid === targetUid)?.name || 'opponent';
    const swapAnim = { kind: 'swap', fromUid: myUid, fromSlot: mySlot, toUid: targetUid, toSlot: theirSlot, at: Date.now() };
    fbUpdateGame(roomCode, withEvent(
      discardDrawnAndAdvance({ ...live, hands: { ...live.hands, [myUid]: myHands, [targetUid]: theirHands }, swapAnim }),
      { ach: { kind: 'win', title: `🔁 ${myName} SWAPPED`, sub: `Traded a card with ${targetName}` } }
    ));
  }

  // Auto-use the drawer's power when their timer runs out (parity with offline auto-pick)
  function autoUsePower(live) {
    if (!live) return;
    const drawerUid = live.playerOrder[live.currentIndex];
    const others    = live.playerOrder.filter(uid => uid !== drawerUid);
    toast('⏰ Time up — auto-using power');
    if (live.phase === OG_PHASES.POWER_PEEK_OWN) {
      doPeekOwn(0);
    } else if (live.phase === OG_PHASES.POWER_PEEK_OTHER && others.length > 0) {
      doPeekOther(others[0], 0);
    } else if (live.phase === OG_PHASES.POWER_SWAP && others.length > 0) {
      doSwapResolve(0, others[0], 0, live);
    } else {
      fbUpdateGame(roomCode, discardDrawnAndAdvance(live));
    }
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
  const peekAnim   = gs.peekAnim || null; // { drawerUid, targetUid, slot } — visible to all

  // ── SPIN phase: synced "who goes first" wheel (parity with offline) ──
  if (gs.phase === OG_PHASES.SPIN) {
    return (
      <SpinScreen
        players={playerList.map((p, i) => ({ id: i, name: p.name }))}
        forcedWinner={gs.currentIndex}
        onDone={() => {
          // Idempotent: every client lands on the same winner, then moves to peek.
          getDb().ref(`rooms/${roomCode}/gameState/phase`).set(OG_PHASES.PEEK).catch(() => {});
        }}
      />
    );
  }

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

  // ── MAIN GAME VIEW ── mirrors game-table.jsx exactly
  const discardTop   = (gs.discard || [])[0] || null;
  const drawnCard    = gs.drawnCard || null;
  const swapAnim    = gs.swapAnim || null;
  // Live countdowns, computed from this client's phase-entry stamp → ticks on EVERY screen
  const buzzSecs  = secsLeft(OG_BUZZ_SECS);
  const powerSecs = secsLeft(OG_POWER_SECS);
  // A swap/buzz glow is "live" for ~1.1s after it was broadcast (timestamp-gated, no extra writes)
  const swapGlowOn = !!(swapAnim && swapAnim.at && (Date.now() - swapAnim.at) < 1100);
  function isSwapGlow(uid, slot) {
    if (!swapGlowOn) return false;
    return (swapAnim.toUid === uid && swapAnim.toSlot === slot) ||
           (swapAnim.fromUid === uid && swapAnim.fromSlot === slot);
  }
  const isBuzzPhase  = gs.phase === OG_PHASES.BUZZ;
  const buzzCanFire  = isBuzzPhase && currentUid !== myUid && !gs.buzzWinnerUid;
  const discardEnabled = !!drawnCard;
  const knockEnabled = isMyTurn && gs.phase === OG_PHASES.TURN_START && myHand.length <= 2;
  const canPickOwnSlot   = isMyTurn && (gs.phase === OG_PHASES.POWER_PEEK_OWN || (gs.phase === OG_PHASES.POWER_SWAP && swapMine === null));
  const canPickTheirSlot = isMyTurn && (gs.phase === OG_PHASES.POWER_PEEK_OTHER || (gs.phase === OG_PHASES.POWER_SWAP && swapMine !== null));

  return (
    <div className="screen">

      {/* HUD — identical to bots mode */}
      <div className="hud">
        <div className="hud-pill">
          <span className="dot" />
          <span>Deck {(gs.deck || []).length}</span>
        </div>
        <div className="hud-pill" style={{ background: isMyTurn ? 'var(--gold)' : 'rgba(0,0,0,0.4)', color: isMyTurn ? '#000' : 'white' }}>
          <PlayerAvatar index={playerList.findIndex(p => p.uid === currentUid)} name={drawer?.name || '?'} size={20} />
          <span style={{ fontWeight: 900 }}>{drawer?.name || '?'}'s turn</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="icon-btn" style={{ position: 'relative' }} onClick={() => { setChatOpen(o => !o); setChatUnread(0); }} title="Chat">
            💬
            {chatUnread > 0 && !chatOpen && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--red)', color: 'white', borderRadius: '50%', fontSize: 9, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>{chatUnread}</span>
            )}
          </button>
          <SoundToggles compact onExit={onBack} />
        </div>
      </div>

      {/* Opponents row — same OpponentMini style as bots mode */}
      <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {opponents.map(p => {
          const theirHand      = (gs.hands || {})[p.uid] || [];
          const theirIdx       = playerList.findIndex(pl => pl.uid === p.uid);
          const isActive       = p.uid === currentUid;
          const isSelectable   = canPickTheirSlot;
          const isSwapSelected = isMyTurn && gs.phase === OG_PHASES.POWER_SWAP && swapMine !== null;
          return (
            <div key={p.uid} className={isActive ? 'opp-active' : ''} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '6px 10px', borderRadius: 12,
              background: isActive ? 'rgba(245,200,66,0.2)' : 'rgba(0,0,0,0.2)',
              border: isActive ? '2px solid var(--gold)' : '2px solid transparent',
              transition: 'all 0.2s'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <PlayerAvatar index={theirIdx} name={p.name} size={20} />
                <span style={{ fontWeight: 900, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                {presence[p.uid]?.connected === false && <span style={{ fontSize: 9, color: '#ff9999' }}>● off</span>}
                <span style={{ opacity: 0.5 }}>·{theirHand.length}</span>
              </div>
              <div className="hand-grid" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 180 }}>
                {theirHand.map((c, i) => {
                  const isPeekAnim   = peekAnim?.targetUid === p.uid && peekAnim?.slot === i;
                  const isRevealed   = peekFlash?.uid === p.uid && peekFlash?.slot === i;
                  const selectable   = isSelectable;
                  return (
                    <div key={c.id || i}
                      className={'hand-slot ' + (selectable ? 'selectable power-target ' : '') + ((isPeekAnim || isSwapGlow(p.uid, i)) ? 'glow-flash ' : '') + (isRevealed ? 'peek-flash ' : '')}
                      onClick={selectable ? () => {
                        if (gs.phase === OG_PHASES.POWER_PEEK_OTHER) doPeekOther(p.uid, i);
                        else if (gs.phase === OG_PHASES.POWER_SWAP && swapMine !== null) doSwapTheirs(p.uid, i);
                      } : undefined}
                    >
                      <Card card={isRevealed ? c : null} faceUp={isRevealed} size={{ w: 52, h: 72 }} positionLabel={positionLabelFor(i, theirHand.length)} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Center — deck / drawn / discard */}
      <div className="center-area">
        <div className="deck-row">
          <div className="deck-stack">
            <Card faceUp={false} size={{ w: 56, h: 80 }} />
            <Card faceUp={false} size={{ w: 56, h: 80 }} />
            {isMyTurn && gs.phase === OG_PHASES.TURN_START
              ? <Card faceUp={false} size={{ w: 56, h: 80 }} onClick={() => doDrawAndBuzz(gs)} className="pulse-gold" style={{ cursor: 'pointer' }} />
              : <Card faceUp={false} size={{ w: 56, h: 80 }} />
            }
            <span className="deck-label">DECK · {(gs.deck || []).length}</span>
          </div>

          <div style={{ position: 'relative', minWidth: 64, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {drawnCard
              ? <Card key={drawnCard.id} card={drawnCard} faceUp size={{ w: 64, h: 90 }} className="drawn-pop" />
              : <div style={{ width: 64, height: 90, border: '2px dashed rgba(255,255,255,0.2)', borderRadius: 10 }} />
            }
            <span className="deck-label">DRAWN</span>
          </div>

          <div className="discard-stack">
            {discardTop
              ? <Card key={discardTop.id} card={discardTop} faceUp size={{ w: 56, h: 80 }} className="discard-drop" />
              : <div style={{ width: 56, height: 80, border: '2px dashed rgba(255,255,255,0.2)', borderRadius: 10 }} />
            }
            <span className="deck-label">DISCARD · {(gs.discard || []).length}</span>
          </div>
        </div>

        {/* Phase banner + countdown — mirrors PhaseIndicator in bots mode */}
        {gs.phase === OG_PHASES.TURN_START && (
          <div className="power-banner">{isMyTurn ? 'Your turn — tap deck to draw' : `${drawer?.name} is thinking...`}</div>
        )}
        {isBuzzPhase && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <CountdownRing secondsLeft={buzzSecs} total={OG_BUZZ_SECS} size={60} />
            <div style={{ fontSize: 12, color: 'var(--gold)', letterSpacing: 1 }}>🔔 BUZZ to claim!</div>
          </div>
        )}
        {gs.phase === OG_PHASES.BUZZ_RESOLVE && (
          <div className="power-banner">
            {gs.buzzWinnerUid === myUid ? 'You buzzed! Pick a card below ↓' : `${playerList.find(p => p.uid === gs.buzzWinnerUid)?.name} is swapping...`}
          </div>
        )}
        {gs.phase === OG_PHASES.POWER_PEEK_OWN && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <CountdownRing secondsLeft={powerSecs} total={OG_POWER_SECS} size={60} />
            <div className="power-banner">{isMyTurn ? '7/8 — Tap your own card ↓' : `${drawer?.name} is peeking their own card`}</div>
          </div>
        )}
        {gs.phase === OG_PHASES.POWER_PEEK_OTHER && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <CountdownRing secondsLeft={powerSecs} total={OG_POWER_SECS} size={60} />
            <div className="power-banner">{isMyTurn ? '9/10 — Tap an opponent card ↑' : `${drawer?.name} is peeking an opponent`}</div>
          </div>
        )}
        {gs.phase === OG_PHASES.POWER_SWAP && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <CountdownRing secondsLeft={powerSecs} total={OG_POWER_SECS} size={60} />
            <div className="power-banner">
              {isMyTurn
                ? (swapMine === null ? 'J/Q/A — Pick YOUR card to give away ↓' : 'Now tap an opponent card ↑')
                : `${drawer?.name} is swapping cards`}
            </div>
          </div>
        )}
      </div>

      {/* My hand */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: 2, opacity: 0.7, marginBottom: 6 }}>
          YOUR HAND · {myHand.length} card{myHand.length === 1 ? '' : 's'}
        </div>
        <div className="hand-grid" style={{ gridTemplateColumns: `repeat(${Math.min(myHand.length, 4)}, auto)` }}>
          {myHand.map((c, i) => {
            const isBuzzWinner  = gs.phase === OG_PHASES.BUZZ_RESOLVE && gs.buzzWinnerUid === myUid;
            const isPickOwn     = canPickOwnSlot;
            const selectable    = isPickOwn || isBuzzWinner;
            const selected      = swapMine === i;
            const myPeekFlash   = peekFlash?.uid === myUid && peekFlash?.slot === i;
            const myPeekAnim    = peekAnim?.targetUid === myUid && peekAnim?.slot === i;
            const isDiscardPick = discardOpen && gs.drawnCard;
            return (
              <div key={c.id || i}
                className={'hand-slot ' +
                  (selectable || isDiscardPick ? 'selectable ' : '') +
                  (selectable ? 'power-target ' : '') +
                  (selected ? 'selected ' : '') +
                  ((myPeekAnim && !myPeekFlash) || isSwapGlow(myUid, i) ? 'glow-flash ' : '') +
                  (myPeekFlash ? 'peek-flash ' : '')
                }
                onClick={() => {
                  if (isBuzzWinner)   { doBuzzResolve(i); return; }
                  if (gs.phase === OG_PHASES.POWER_PEEK_OWN && isMyTurn)  { doPeekOwn(i); return; }
                  if (gs.phase === OG_PHASES.POWER_SWAP && isMyTurn && swapMine === null) { doSwapMine(i); return; }
                }}
              >
                <Card card={myPeekFlash ? c : null} faceUp={myPeekFlash} size={{ w: 64, h: 90 }} positionLabel={positionLabelFor(i, myHand.length)} />
              </div>
            );
          })}
        </div>

        {/* Always-visible action bar — exactly like bots mode */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
          <button
            className={"buzz-action-btn " + (buzzCanFire ? 'active' : 'inactive')}
            disabled={!buzzCanFire}
            onClick={() => buzzCanFire && doBuzz()}
          >
            <span className="buzz-emoji">🔔</span>
            BUZZ
          </button>
          <button
            className={"btn " + (discardEnabled ? 'btn-danger' : 'btn-ghost')}
            disabled={!discardEnabled}
            onClick={() => discardEnabled && setDiscardOpen(true)}
          >
            🗑️ DISCARD
          </button>
          <button
            className={"btn " + (knockEnabled ? 'btn-success' : 'btn-ghost')}
            disabled={!knockEnabled}
            onClick={() => knockEnabled && doKnock(gs)}
          >
            🤜 KNOCK
          </button>
        </div>

        {/* Confirm swap */}
        {gs.phase === OG_PHASES.POWER_SWAP && swapMine !== null && isMyTurn && (
          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            Tap an opponent card ↑ to complete the swap
          </div>
        )}
      </div>

      {/* Buzz resolve modal */}
      {gs.phase === OG_PHASES.BUZZ_RESOLVE && gs.buzzWinnerUid === myUid && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-title">You buzzed! Pick a card to swap</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <div style={{ textAlign: 'center', fontSize: 11, opacity: 0.7 }}>
                <div>You'll receive</div>
                <Card card={drawnCard} faceUp size={{ w: 56, h: 80 }} />
              </div>
            </div>
            <div className="modal-body">Tap a card from memory.</div>
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

      {/* Discard select modal */}
      {discardOpen && drawnCard && (
        <OnlineDiscardModal
          hand={myHand}
          drawnCard={drawnCard}
          onPick={doDiscardClaim}
          onCancel={() => setDiscardOpen(false)}
        />
      )}

      {/* Peek flash overlay — only peeker sees actual card */}
      {peekFlash && (
        <div className="modal-backdrop" style={{ pointerEvents: 'none' }}>
          <div className="modal" style={{ gap: 12, textAlign: 'center', pointerEvents: 'none' }}>
            <div className="modal-title" style={{ fontSize: 14 }}>
              {peekFlash.uid === myUid ? '👀 Your card' : `👀 ${playerList.find(p => p.uid === peekFlash.uid)?.name}'s card`}
            </div>
            <Card card={peekFlash.card} faceUp size={{ w: 84, h: 118 }} />
            <div style={{ fontSize: 12, opacity: 0.6 }}>Memorize it!</div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} />
      {achievement && (
        <div className={'achievement-banner ' + achievement.kind}>
          {achievement.title}
          {achievement.sub && <span className="sub">{achievement.sub}</span>}
        </div>
      )}
      {chatOpen && <InGameChat roomCode={roomCode} myName={myName} onClose={() => setChatOpen(false)} />}
      {confirmModal && <ConfirmModal {...confirmModal} />}
    </div>
  );
}

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

// ─────────────────────────────────────────
// Offensive word filter (basic)
// ─────────────────────────────────────────
const BAD_WORDS = ['fuck','shit','ass','bitch','bastard','damn','crap','piss','cunt','dick','cock','pussy','whore','slut','idiot','stupid','moron','retard','hate','kill','die'];
function filterChat(text) {
  let t = text;
  for (const w of BAD_WORDS) {
    const re = new RegExp(w, 'gi');
    t = t.replace(re, '*'.repeat(w.length));
  }
  return t;
}

// ─────────────────────────────────────────
// In-game chat panel (collapsible overlay)
// ─────────────────────────────────────────
function InGameChat({ roomCode, myName, onClose }) {
  const msgs       = useChat(roomCode);
  const [text, setText] = React.useState('');
  const [unread, setUnread] = React.useState(0);
  const bottomRef  = React.useRef(null);
  const prevLen    = React.useRef(msgs.length);

  React.useEffect(() => {
    if (msgs.length > prevLen.current) setUnread(u => u + msgs.length - prevLen.current);
    prevLen.current = msgs.length;
    if (bottomRef.current) {
      const el = bottomRef.current.parentElement;
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs.length]);

  const send = () => {
    if (!text.trim()) return;
    fbSendChat(roomCode, myName, filterChat(text.trim()));
    setText('');
    setUnread(0);
  };

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'rgba(13,30,30,0.97)', backdropFilter: 'blur(6px)',
      borderRadius: '18px 18px 0 0', padding: '12px 14px',
      zIndex: 95, display: 'flex', flexDirection: 'column', gap: 8,
      maxHeight: '55vh',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: 'var(--gold)' }}>💬 GAME CHAT</div>
        <button className="icon-btn" onClick={onClose} style={{ width: 28, height: 28, fontSize: 14 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 80, maxHeight: '40vh' }}>
        {msgs.length === 0 && <div style={{ fontSize: 11, opacity: 0.35, textAlign: 'center', marginTop: 20 }}>No messages yet 👋</div>}
        {msgs.map(m => (
          <div key={m.id} style={{ fontSize: 12.5, lineHeight: 1.4 }}>
            <span style={{ fontWeight: 900, color: m.name === myName ? 'var(--gold)' : 'rgba(255,255,255,0.75)' }}>
              {m.name === myName ? 'You' : m.name}:
            </span>{' '}
            <span style={{ opacity: 0.9 }}>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
        <input
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: 13, fontFamily: 'inherit', padding: '4px 0' }}
          value={text} placeholder="Type a message…" maxLength={120}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
        />
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: text.trim() ? 'var(--gold)' : 'rgba(255,255,255,0.25)', fontSize: 18, padding: '0 8px' }}
          onClick={send}
        >➤</button>
      </div>
    </div>
  );
}

Object.assign(window, { OnlineLobby, OnlineGameTable });
