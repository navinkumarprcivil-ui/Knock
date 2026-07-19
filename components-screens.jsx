/*!
 * Kuboos — KNOCK card game
 * Copyright (c) 2026 Kuboos. All rights reserved.
 * Licensed for use only at https://knockgame.netlify.app
 *
 * Unauthorized reproduction, distribution, modification, or
 * deployment to other domains is prohibited.
 */

/* KNOCK — Setup + Pass screens */

const BOT_NAMES_EASY = ['Buddy', 'Pepper', 'Coco', 'Biscuit', 'Mango', 'Pickle', 'Noodle', 'Waffle'];
const BOT_NAMES_HARD = ['Vex', 'Specter', 'Onyx', 'Razor', 'Cipher', 'Talon', 'Nyx', 'Volt'];

function generateBots(n) {
  const easyPool = [...BOT_NAMES_EASY].sort(() => Math.random() - 0.5);
  const hardPool = [...BOT_NAMES_HARD].sort(() => Math.random() - 0.5);
  const out = [];
  for (let i = 0; i < n; i++) {
    const skill = i % 2 === 0 ? 'easy' : 'hard';
    const name = skill === 'easy' ? easyPool.pop() : hardPool.pop();
    out.push({ name: name || `Bot ${i+1}`, skill });
  }
  return out;
}

function SetupScreen({ onStart, mode = 'bots', onBack }) {
  const isBots = mode === 'bots';
  const [totalPlayers, setTotalPlayers] = React.useState(4);
  const [humanName, setHumanName] = React.useState('You');
  const [localNames, setLocalNames] = React.useState(['Alex','Sam','Riley','Jordan','Taylor','Morgan']);
  const [showHelp, setShowHelp] = React.useState(false);
  const [botRoster, setBotRoster] = React.useState(() => generateBots(totalPlayers - 1));

  React.useEffect(() => {
    if (isBots) setBotRoster(generateBots(totalPlayers - 1));
  }, [totalPlayers, isBots]);

  const handleStart = () => {
    const players = [];
    if (isBots) {
      players.push({ id: 0, name: humanName.trim() || 'You', isBot: false });
      botRoster.forEach((b, i) => {
        players.push({ id: i + 1, name: b.name, isBot: true, skill: b.skill });
      });
    } else {
      for (let i = 0; i < totalPlayers; i++) {
        players.push({ id: i, name: (localNames[i] || `Player ${i+1}`).trim() || `Player ${i+1}`, isBot: false });
      }
    }
    onStart(players);
  };

  return (
    <div className="screen" style={{ justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {onBack && <button className="icon-btn" onClick={onBack}>‹</button>}
        <SoundToggles compact />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ marginBottom: 24 }}>
          <div className="title-logo">KNOCK</div>
          <div className="title-sub">{isBots ? 'vs. bots' : 'pass-the-device'}</div>
        </div>
        {isBots ? (
          <>
            <div className="player-row" style={{ marginBottom: 16, background: 'rgba(245,200,66,0.12)', border: '2px solid var(--gold)' }}>
              <PlayerAvatar index={0} name={humanName} />
              <input className="player-input" value={humanName} placeholder="Your name" onChange={(e) => setHumanName(e.target.value)} maxLength={14} />
              <span style={{ fontSize: 10, color: 'var(--gold)', letterSpacing: 1 }}>HUMAN</span>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 8, fontSize: 12, letterSpacing: 2, color: 'var(--gold)', textTransform: 'uppercase' }}>Total players ({botRoster.length} bots)</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div className="count-stepper">
                <button onClick={() => setTotalPlayers(Math.max(3, totalPlayers - 1))} disabled={totalPlayers <= 3}>−</button>
                <span className="num">{totalPlayers}</span>
                <button onClick={() => setTotalPlayers(Math.min(6, totalPlayers + 1))} disabled={totalPlayers >= 6}>+</button>
              </div>
            </div>
            <div className="setup-list">
              {botRoster.map((b, i) => (
                <div key={i} className="player-row">
                  <PlayerAvatar index={i + 1} name={b.name} />
                  <span style={{ flex: 1, fontWeight: 900, fontSize: 16 }}>{b.name}</span>
                  <span style={{ fontSize: 10, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: b.skill === 'hard' ? 'var(--red)' : 'var(--blue)', color: 'white' }}>
                    {b.skill === 'hard' ? '🤖 HARD' : '🤖 EASY'}
                  </span>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setBotRoster(generateBots(totalPlayers - 1))}>🎲 Reroll bots</button>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 8, fontSize: 12, letterSpacing: 2, color: 'var(--gold)', textTransform: 'uppercase' }}>Players</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div className="count-stepper">
                <button onClick={() => setTotalPlayers(Math.max(2, totalPlayers - 1))} disabled={totalPlayers <= 2}>−</button>
                <span className="num">{totalPlayers}</span>
                <button onClick={() => setTotalPlayers(Math.min(6, totalPlayers + 1))} disabled={totalPlayers >= 6}>+</button>
              </div>
            </div>
            <div className="setup-list">
              {Array.from({ length: totalPlayers }).map((_, i) => (
                <div key={i} className="player-row">
                  <PlayerAvatar index={i} name={localNames[i]} />
                  <input className="player-input" value={localNames[i] || ''} placeholder={`Player ${i+1}`} onChange={(e) => { const n = localNames.slice(); n[i] = e.target.value; setLocalNames(n); }} maxLength={14} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <button className="btn btn-gold btn-block btn-lg" onClick={handleStart}>Deal Cards</button>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function CountdownRing({ secondsLeft, total, size = 60 }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, secondsLeft / total)) : 0;
  const offset = c * (1 - frac);
  const urgent = secondsLeft > 0 && secondsLeft <= 3;
  return (
    <div className={"countdown-ring" + (urgent ? ' urgent' : '')} style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--gold)" strokeWidth="3"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s linear' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bowlby One', sans-serif", color: 'var(--gold)', fontSize: size * 0.36 }}>
        {Math.max(0, secondsLeft)}
      </div>
    </div>
  );
}

function PassScreen({ player, action = "take your turn", onReady }) {
  return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 18 }}>
      <div style={{ fontSize: 56 }}>📱➡️</div>
      <div className="title-sub" style={{ letterSpacing: 4, fontSize: 11 }}>PASS THE DEVICE TO</div>
      <div className="title-logo" style={{ fontSize: 44 }}>{player.name.toUpperCase()}</div>
      <div style={{ opacity: 0.7, fontSize: 13 }}>Tap when you're ready to {action}</div>
      <button className="btn btn-gold btn-lg" onClick={() => { AudioMgr.playSfx('click'); onReady(); }}>I am {player.name} →</button>
      <p style={{ maxWidth: 280, opacity: 0.5, fontSize: 11, marginTop: 12 }}>
        Don't let other players see your screen
      </p>
    </div>
  );
}

function PeekScreen({ player, hand, onDone }) {
  // Only the BASE (bottom) 2 cards are peekable. Indexes 2 and 3 of a 4-card hand.
  const baseIndices = hand.map((_, i) => i).filter(i => i >= 2);
  const [peeked, setPeeked] = React.useState({});
  const allPeeked = baseIndices.every(i => peeked[i]);
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  const doneRef = React.useRef(false);

  const finishOnce = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  // Hard failsafe: never freeze for more than 25s, auto-advance.
  React.useEffect(() => {
    const t = setTimeout(() => { finishOnce(); }, 25000);
    return () => clearTimeout(t);
  }, []);

  // Once all base cards peeked, start the 5s memorize countdown.
  React.useEffect(() => {
    if (!allPeeked) return;
    setSecondsLeft(5);
    let n = 5;
    const t = setInterval(() => {
      n -= 1;
      setSecondsLeft(n);
      if (n <= 0) { clearInterval(t); finishOnce(); }
    }, 1000);
    return () => clearInterval(t);
  }, [allPeeked]);

  return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 14 }}>
      <div className="title-sub" style={{ letterSpacing: 4, fontSize: 11 }}>PEEK PHASE</div>
      <div className="title-logo" style={{ fontSize: 32 }}>{player.name.toUpperCase()}</div>
      <div style={{ opacity: 0.75, fontSize: 13, maxWidth: 300 }}>
        Only your <b style={{ color: 'var(--gold)' }}>base cards</b> (bottom row) can be peeked. Tap each one to memorize.
      </div>
      <div className="hand-grid" style={{ gridTemplateColumns: 'repeat(2, auto)', gap: 12 }}>
        {hand.map((c, i) => {
          const isBase = i >= 2;
          return (
            <div
              key={c.id}
              className={"hand-slot " + (isBase ? 'selectable ' : 'dim ') + (isBase && !peeked[i] ? 'power-target ' : '')}
              onClick={isBase ? () => setPeeked(p => ({ ...p, [i]: true })) : undefined}
              style={{ cursor: isBase ? 'pointer' : 'not-allowed' }}
            >
              <Card card={c} faceUp={isBase && !!peeked[i]} size={{ w: 84, h: 118 }} positionLabel={positionLabelFor(i, hand.length)} />
            </div>
          );
        })}
      </div>
      {allPeeked ? (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <CountdownRing secondsLeft={secondsLeft || 0} total={5} size={50} />
            <button className="btn btn-gold btn-lg" onClick={finishOnce}>I'm ready →</button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Memorize their positions!</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, opacity: 0.6 }}>{baseIndices.filter(i => peeked[i]).length} / {baseIndices.length} base cards peeked</div>
          <button className="btn btn-ghost btn-sm" onClick={finishOnce}>Skip peek</button>
        </>
      )}
    </div>
  );
}

function HelpModal({ onClose }) {
  const sampleCard = (rank, suit) => ({
    id: 'help-' + rank, rank, suit,
    value: rank === 'K' ? 0 : rank === 'A' ? 13 : rank === 'Q' ? 12 : rank === 'J' ? 11 : +rank,
    power: (rank === '7' || rank === '8') ? 'peek-own' :
           (rank === '9' || rank === '10') ? 'peek-other' :
           (rank === 'J' || rank === 'Q' || rank === 'A') ? 'swap' : 'none',
  });
  const rule = (rank, suit, label, sub) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px' }}>
      <Card card={sampleCard(rank, suit)} faceUp size={{ w: 44, h: 62 }} />
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontWeight: 900, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>{sub}</div>
      </div>
    </div>
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'left', maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-title">How to play KNOCK</div>
        <div className="modal-body" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
          <p style={{ marginTop: 0 }}><b>Goal:</b> Have the lowest card-sum at the end.</p>
          <p><b>Peek:</b> Memorize your 2 base (bottom) cards before the game starts.</p>
          <p><b>Turn:</b> Drawer flips top of deck — visible to everyone.</p>
          <p><b>Buzz:</b> Anyone but the drawer races to claim the drawn card and swap it into one of their own slots.</p>
          <div style={{ marginTop: 8, marginBottom: 8, padding: '8px 8px', borderRadius: 12, background: 'rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'var(--gold)', marginBottom: 4 }}>POWER CARDS</div>
            {rule('7', '♥', 'Peek your own', '7 or 8 — Peek any one of your own cards')}
            {rule('9', '♠', 'Peek opponent', '9 or 10 — Peek any one opponent card')}
            {rule('J', '♦', 'Swap', 'J, Q, or A — Swap one of your cards with an opponent')}
            {rule('K', '♣', 'Zero', 'K = 0 points (the best card!)')}
          </div>
          <p><b>Discard:</b> Anyone can claim one OR more of their cards match the drawn rank. All right → all removed. Any wrong → no removal, +2 penalty cards.</p>
          <p><b>Knock:</b> On your turn, with ≤2 cards. Lowest sum wins. Wrong knock → +1 penalty card, game continues.</p>
        </div>
        <button className="btn btn-gold btn-block" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

function Fireworks() {
  const bursts = React.useMemo(() => {
    const colors = ['#f5c842', '#e63946', '#2563eb', '#16a34a', '#a855f7', '#ec4899'];
    const arr = [];
    for (let i = 0; i < 14; i++) {
      arr.push({
        id: i,
        left: 10 + Math.random() * 80 + '%',
        rise: -(120 + Math.random() * 300) + 'px',
        color: colors[i % colors.length],
        delay: Math.random() * 1.6,
      });
    }
    return arr;
  }, []);
  return (
    <div className="fireworks">
      {bursts.map(b => (
        <span
          key={b.id}
          className="firework"
          style={{ left: b.left, bottom: 0, background: b.color, boxShadow: `0 0 0 0 ${b.color}`, '--rise': b.rise, '--col': b.color, animationDelay: `${b.delay}s, ${b.delay + 1.2}s` }}
        />
      ))}
    </div>
  );
}

function GameOverScreen({ ranking, players, knockerId, knockSuccess, onReplay, onMenu }) {
  React.useEffect(() => {
    AudioMgr.playSfx('win');
    if (window.Voice) window.Voice.say(`${ranking[0].player.name} wins the match!`, { cooldown: 0 });
  }, []);
  const winner = ranking[0];
  // Update scoreboard once
  const [room, setRoom] = React.useState(() => Scoreboard.recordMatch(Scoreboard.load(players || ranking.map(r => r.player)), ranking));
  const standings = Scoreboard.standings(room, players || ranking.map(r => r.player));
  const hostName = room.host;
  // Identify who is the device-user: in bots mode it's player id 0; in local hot-seat anyone can press reset
  const canReset = true; // device-holder; host name is shown next to it for clarity

  function handleReset() {
    if (!confirm(`Reset the scoreboard? Only ${hostName} (host) should do this.`)) return;
    setRoom(Scoreboard.reset(room));
  }

  return (
    <div className="screen" style={{ justifyContent: 'flex-start', textAlign: 'center', gap: 12, overflowY: 'auto' }}>
      <Fireworks />
      <div style={{ fontSize: 48 }}>🏆</div>
      <div className="title-logo" style={{ fontSize: 32 }}>{winner.player.name.toUpperCase()} WINS</div>
      {knockerId != null && (
        <div className="title-sub" style={{ fontSize: 11 }}>
          {knockSuccess ? `KNOCK SUCCESS · ${ranking.find(r => r.player.id === knockerId)?.player.name}` : `BAD KNOCK · +1 penalty`}
        </div>
      )}

      {/* This match results */}
      <div style={{ width: '100%', maxWidth: 360, marginTop: 4 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: 'var(--gold)', marginBottom: 6 }}>THIS MATCH</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ranking.map((r, i) => (
            <div key={r.player.id} className="player-row" style={{ padding: '8px 10px', background: i === 0 ? 'rgba(245,200,66,0.18)' : 'rgba(0,0,0,0.25)' }}>
              <span style={{ fontSize: 14, opacity: 0.6, width: 22 }}>{i + 1}</span>
              <PlayerAvatar index={r.player.id} name={r.player.name} size={28} />
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 900, fontSize: 14 }}>{r.player.name}{r.player.isBot ? ' 🤖' : ''}</span>
              <span style={{ fontSize: 11, opacity: 0.6, marginRight: 6 }}>sum {r.sum}</span>
              <span style={{ fontWeight: 900, color: 'var(--gold)' }}>+{ranking.length - i}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scoreboard standings */}
      <div style={{ width: '100%', maxWidth: 360, marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: 'var(--gold)' }}>SCOREBOARD · MATCH {room.matches}</div>
          <div style={{ fontSize: 10, opacity: 0.55 }}>👑 host: {hostName}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {standings.map((s, i) => (
            <div key={s.player.id} className="player-row" style={{ padding: '8px 10px', background: i === 0 ? 'rgba(245,200,66,0.12)' : 'rgba(0,0,0,0.25)' }}>
              <span style={{ fontSize: 14, opacity: 0.6, width: 22 }}>{i + 1}</span>
              <PlayerAvatar index={s.player.id} name={s.player.name} size={26} />
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 900, fontSize: 14 }}>
                {s.player.name}{s.player.name === hostName ? ' 👑' : ''}
              </span>
              <span style={{ fontSize: 10, opacity: 0.55, marginRight: 8 }}>{s.wins}W · {s.matches}M</span>
              <span style={{ fontWeight: 900, color: 'var(--gold)' }}>{s.points} pts</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={onMenu}>Main menu</button>
        {canReset && <button className="btn btn-ghost btn-sm" onClick={handleReset}>Reset (host only)</button>}
        <button className="btn btn-gold" onClick={onReplay}>Next match →</button>
      </div>
    </div>
  );
}

function SpinScreen({ players, onDone, forcedWinner }) {
  const [spinIdx, setSpinIdx] = React.useState(0);
  const [phase, setPhase] = React.useState('spinning'); // spinning | slowdown | reveal
  const [winner, setWinner] = React.useState(null);
  const pickedRef = React.useRef(forcedWinner != null ? forcedWinner : Math.floor(Math.random() * players.length));

  React.useEffect(() => {
    let interval = 120;
    let ticks = 0;
    const totalFast = 14;
    const totalSlow = 10;
    let cur = Math.floor(Math.random() * players.length);

    const spin = () => {
      cur = (cur + 1) % players.length;
      setSpinIdx(cur);
      ticks++;
      if (ticks < totalFast) {
        setTimeout(spin, interval);
      } else if (ticks < totalFast + totalSlow) {
        interval = 120 + (ticks - totalFast) * 80;
        setTimeout(spin, interval);
      } else {
        // Land on the pre-picked winner
        const target = pickedRef.current;
        setSpinIdx(target);
        setWinner(target);
        setPhase('reveal');
        AudioMgr.playSfx('win');
        if (window.Voice) window.Voice.say(`${players[target].name} goes first!`, { cooldown: 0 });
        setTimeout(() => onDone(target), 3500); // longer reveal so user sees clearly
      }
    };
    setTimeout(spin, 200);
  }, []);

  return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 20 }}>
      <div className="title-sub" style={{ letterSpacing: 4, fontSize: 11 }}>WHO GOES FIRST?</div>
      <div style={{ position: 'relative', width: 220, height: 220 }}>
        {/* Circular arrangement of player avatars */}
        {players.map((p, i) => {
          const angle = (i / players.length) * 2 * Math.PI - Math.PI / 2;
          const r = 85;
          const x = Math.cos(angle) * r + 110;
          const y = Math.sin(angle) * r + 110;
          const isActive = spinIdx === i;
          const isWinner = phase === 'reveal' && winner === i;
          return (
            <div key={p.id} style={{
              position: 'absolute',
              left: x - 24, top: y - 24,
              width: 48, height: 48,
              borderRadius: '50%',
              background: isWinner ? 'var(--gold)' : isActive ? PLAYER_COLORS[i % PLAYER_COLORS.length] : 'rgba(0,0,0,0.3)',
              border: isActive ? '3px solid white' : '3px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.1s',
              transform: isWinner ? 'scale(1.3)' : isActive ? 'scale(1.1)' : 'scale(1)',
              boxShadow: isActive ? '0 0 16px rgba(255,255,255,0.7)' : 'none',
              fontFamily: "'Bowlby One', sans-serif",
              fontSize: 16, color: 'white', fontWeight: 900,
              zIndex: isActive ? 2 : 1,
            }}>
              {p.name.charAt(0).toUpperCase()}
            </div>
          );
        })}
        {/* Center arrow */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: `translate(-50%, -50%) rotate(${(spinIdx / players.length) * 360 - 90}deg)`,
          transition: phase === 'reveal' ? 'transform 0.6s ease-out' : 'transform 0.1s',
          width: 70, height: 4, background: 'var(--gold)',
          borderRadius: 2, transformOrigin: 'left center',
          marginLeft: -2,
        }} />
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 12, height: 12, borderRadius: '50%',
          background: 'white', boxShadow: '0 0 8px white',
        }} />
      </div>
      {phase === 'reveal' && winner !== null && (
        <div style={{ animation: 'fade-in 0.3s ease' }}>
          <div className="title-logo" style={{ fontSize: 36 }}>{players[winner].name.toUpperCase()}</div>
          <div className="title-sub" style={{ marginTop: 4 }}>draws first!</div>
        </div>
      )}
      {phase === 'spinning' && (
        <div style={{ opacity: 0.5, fontSize: 12 }}>Spinning…</div>
      )}
    </div>
  );
}

Object.assign(window, { SetupScreen, PassScreen, PeekScreen, HelpModal, GameOverScreen, CountdownRing, SpinScreen });
