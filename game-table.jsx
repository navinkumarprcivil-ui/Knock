/*!
 * Kuboos — KNOCK card game
 * Copyright (c) 2026 Kuboos. All rights reserved.
 * Licensed for use only at https://knockgame.netlify.app
 *
 * Unauthorized reproduction, distribution, modification, or
 * deployment to other domains is prohibited.
 */

/* KNOCK — Main game table (single-player vs bots)
   New turn flow:
   1. Highlight whose turn
   2. Drawer taps deck (or auto if bot) — card flips, visible to all
   3. Buzz race opens (4s) — non-drawers race
   4. If buzz winner: they pick own slot to swap; turn ends
   5. If no buzz AND power card: drawer has 7s to use power; if not used, turn ends
   6. If no buzz AND no power: turn ends, card discards
   7. DISCARD button always visible; usable while drawn card is "live" (until next turn)
   8. KNOCK button always visible; only enabled on your turn with ≤2 cards
*/

const PHASES = {
  SPIN: 'spin',
  PEEK: 'peek',
  TURN_START: 'turn-start',     // before drawing
  DRAWING: 'drawing',           // animating draw
  BUZZ: 'buzz',                 // buzz race window
  BUZZ_RESOLVE: 'buzz-resolve', // human picks slot to swap
  POWER_PEEK_OWN: 'power-peek-own',
  POWER_PEEK_OTHER: 'power-peek-other',
  POWER_SWAP: 'power-swap',
  POWER_DONE: 'power-done',     // brief pause before next turn
  DISCARD_SELECT: 'discard-select', // human picking which card to discard
  DISCARD_ROUND: 'discard-round',   // shared opt-in discard window
  TURN_END: 'turn-end',         // brief animation before next turn
  OVER: 'over'
};

// Bot pacing — slower so kids/elders can follow what's happening
const BOT_DELAY = {
  thinkStart: 4600,    // bot decides whether to knock / draws
  buzzPickSlot: 4000,  // bot picks slot after winning buzz
  powerOwn: 5200,      // bot peeks own card
  powerOther: 5400,    // bot peeks other
  powerSwap: 6000,     // bot performs swap
  buzzMin: 2000,       // earliest a bot can buzz (ms after window opens)
};
const POWER_SECONDS = 16;
const BUZZ_SECONDS = 10;
const DISCARD_ROUND_SECONDS = 9; // shared opt-in discard window

// Tamil cheers — rotate for a correct discard; one phrase for a wrong discard
const TAMIL_POSITIVE = ['Adichi Thooku', 'Pottu Thaaku', 'Vera Maari'];
const TAMIL_FAIL = 'Vada Pochey';
function tamilCheer() { return TAMIL_POSITIVE[Math.floor(Math.random() * TAMIL_POSITIVE.length)]; }

function GameTable({ players, onGameOver, onMenu, mode = 'bots' }) {
  const isLocal = mode === 'local';
  // Initial deal
  const initial = React.useMemo(() => {
    const deck0 = makeDeck();
    const dealt = dealInitialHands(deck0, players.length);
    return { hands: dealt.hands.reduce((acc, h, i) => { acc[i] = h; return acc; }, {}), deck: dealt.deck, discard: [] };
  }, []);

  const [hands, setHands] = React.useState(initial.hands);
  const [deck, setDeck] = React.useState(initial.deck);
  const [discard, setDiscard] = React.useState(initial.discard);

  const [phase, setPhase] = React.useState(PHASES.SPIN); // start with spin to pick first drawer
  const [currentPlayer, setCurrentPlayer] = React.useState(0);
  const [drawnCard, setDrawnCard] = React.useState(null);

  // Bot memories — one per bot
  const botMemoriesRef = React.useRef(null);
  if (botMemoriesRef.current === null) {
    const mem = {};
    for (const p of players) {
      if (p.isBot) mem[p.id] = makeBotMemory(p.id, initial.hands);
    }
    botMemoriesRef.current = mem;
  }

  const [drawnConsumed, setDrawnConsumed] = React.useState(false); // true when buzz winner took the drawn card
  const [peekTarget, setPeekTarget] = React.useState(null); // { playerId, slot, until }
  const [swapMine, setSwapMine] = React.useState(null);
  const [swapTheirs, setSwapTheirs] = React.useState(null);
  const [powerSecondsLeft, setPowerSecondsLeft] = React.useState(0);

  // Buzz
  const [buzzWinner, setBuzzWinner] = React.useState(null);
  const [buzzSecondsLeft, setBuzzSecondsLeft] = React.useState(0);

  // Discard claim (human-driven)
  const [discardingPlayer, setDiscardingPlayer] = React.useState(null);
  // Shared opt-in discard round
  const [optedIn, setOptedIn] = React.useState({});       // pid -> decision ({slot} for bots, true for human)
  const [discardSecondsLeft, setDiscardSecondsLeft] = React.useState(0);
  const optedInRef = React.useRef({});
  const committedDiscardRef = React.useRef(false);        // true while human resolves their in-round discard

  // Knock
  const [knockerId, setKnockerId] = React.useState(null);
  const [knockSuccess, setKnockSuccess] = React.useState(null);

  // UI
  const [toasts, setToasts] = React.useState([]);
  const [showHelp, setShowHelp] = React.useState(false);
  const [confirmModal, setConfirmModal] = React.useState(null);
  const [achievement, setAchievement] = React.useState(null); // { kind: 'win'|'fail', title, sub }
  const [paused, setPaused] = React.useState(false);
  const [needPass, setNeedPass] = React.useState(false); // local mode hand-off screen
  const [peekIndex, setPeekIndex] = React.useState(0); // local mode: which player's peek
  const [animation, setAnimation] = React.useState(null); // { kind:'swap'|'peek', from, to, card }

  function showAchievement(kind, title, sub, ms = 2800) {
    setAchievement({ kind, title, sub });
    setTimeout(() => setAchievement(null), ms);
  }

  const toastIdRef = React.useRef(1);
  function toast(msg) {
    const id = toastIdRef.current++;
    setToasts(ts => [...ts, { id, msg }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 2200);
  }

  // ======= Helpers =======
  function drawFromDeck(currentDeck, currentDiscard, n = 1) {
    let d = currentDeck.slice();
    let disc = currentDiscard.slice();
    const drawn = [];
    for (let i = 0; i < n; i++) {
      if (d.length === 0) {
        if (disc.length === 0) break;
        d = shuffle(disc);
        disc = [];
        toast('Deck reshuffled');
      }
      drawn.push(d.shift());
    }
    return { drawn, deck: d, discard: disc };
  }

  function updateBotMemoryOnSwap(swappingPlayerId, slot, oldCard, newCard) {
    // Every bot that "saw" this swap (all bots see drawn card) updates: that slot now holds newCard
    for (const p of players) {
      if (!p.isBot) continue;
      const mem = botMemoriesRef.current[p.id];
      // Bots see new card (it was the publicly-drawn card)
      botRememberCard(mem, swappingPlayerId, slot, newCard);
    }
  }

  function updateBotMemoryOnDiscardSuccess(playerId, removedSlot) {
    for (const p of players) {
      if (!p.isBot) continue;
      botShiftAfterRemove(botMemoriesRef.current[p.id], playerId, removedSlot);
    }
  }

  function updateBotMemoryOnPenaltyAdd(playerId, oldHand, newHand) {
    // Bots don't know the new cards
    // But the slot indices shift: penalty adds to top + bottom
    // We added 1 card to position 0 and 1 to end. So all old slots shift up by 1.
    for (const p of players) {
      if (!p.isBot) continue;
      const mem = botMemoriesRef.current[p.id];
      const newMem = {};
      for (const key of Object.keys(mem)) {
        const [pid, slot] = key.split('-').map(Number);
        if (pid !== playerId) { newMem[key] = mem[key]; continue; }
        if (slot < oldHand.length) {
          newMem[`${pid}-${slot + 1}`] = mem[key]; // shift up
        }
      }
      for (const k of Object.keys(mem)) delete mem[k];
      Object.assign(mem, newMem);
    }
  }

  // ======= Peek phase (only human) =======
  // Moved below all hooks to comply with Rules of Hooks.
  // (early returns now happen at the very end of the component)

  // ======= Active turn =======
  // In local mode, the "viewing human" is always whoever's turn it is.
  // In bots mode, it's player 0.
  const meId = isLocal ? currentPlayer : 0;
  const me = players[meId];
  const isMyTurn = currentPlayer === meId;
  const drawer = players[currentPlayer];

  // ----- Auto-draw if human idles at turn-start (15s) -----
  React.useEffect(() => {
    if (phase !== PHASES.TURN_START) return;
    if (paused) return;
    if (drawer.isBot) return;
    if (isLocal && needPass) return; // pass-the-device screen is up — don't draw behind it
    if (window.Voice) window.Voice.say(`${drawer.name}, your turn`, { key: 'turn-' + currentPlayer, cooldown: 0 });
    const t = setTimeout(() => {
      toast(`⏰ Auto-drawing for ${drawer.name}`);
      handleDraw();
    }, 15000);
    return () => clearTimeout(t);
  }, [phase, currentPlayer, paused, needPass]);
  React.useEffect(() => {
    if (phase !== PHASES.TURN_START) return;
    if (paused) return;
    if (!drawer.isBot) return;
    // Bot decides whether to knock first
    const t = setTimeout(() => {
      if (botShouldKnock(drawer, hands, botMemoriesRef.current[drawer.id])) {
        toast(`${drawer.name} knocks!`);
        AudioMgr.playSfx('knock');
        doKnock();
        return;
      }
      // Otherwise draw
      handleDraw();
    }, BOT_DELAY.thinkStart);
    return () => clearTimeout(t);
  }, [phase, currentPlayer, paused]);

  // ----- Local-mode pass-the-device: between turns, show pass screen for next human -----
  React.useEffect(() => {
    if (!isLocal) return;
    if (phase !== PHASES.TURN_START) return;
    if (drawer.isBot) return;
    // need a pass screen between human turns (but not on the very first turn coming out of peek)
    setNeedPass(true);
  }, [phase, currentPlayer, isLocal]);

  // ----- Buzz race timer + bot buzz scheduling -----
  React.useEffect(() => {
    if (phase !== PHASES.BUZZ) return;
    if (paused) return;
    if (window.Voice) window.Voice.say('Buzz now!', { key: 'buzz', cooldown: 5000 });
    setBuzzSecondsLeft(BUZZ_SECONDS);
    const tick = setInterval(() => setBuzzSecondsLeft(s => s - 1), 1000);

    // Schedule bot buzzers
    const timers = [];
    let resolved = false;
    for (const p of players) {
      if (!p.isBot || p.id === currentPlayer) continue;
      let decision = botBuzzDecision(p, drawnCard, hands, botMemoriesRef.current[p.id]);
      if (decision == null) continue;
      // Slow bots down: ensure decision >= BOT_DELAY.buzzMin and stretch out a bit
      decision = Math.max(BOT_DELAY.buzzMin, decision * 1.6);
      const t = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        timers.forEach(clearTimeout);
        clearInterval(tick);
        handleBuzzWinner(p.id);
      }, decision);
      timers.push(t);
    }

    // Timeout
    const timeoutT = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      timers.forEach(clearTimeout);
      clearInterval(tick);
      handleBuzzTimeout();
    }, BUZZ_SECONDS * 1000);
    timers.push(timeoutT);

    return () => { resolved = true; timers.forEach(clearTimeout); clearInterval(tick); };
  }, [phase, paused]);

  // ----- Discard round: countdown + bots opt in if they hold a match -----
  React.useEffect(() => {
    if (phase !== PHASES.DISCARD_ROUND) return;
    if (paused) return;
    if (window.Voice) window.Voice.say('Discard round! Opt in if you have a match', { key: 'discard-round', cooldown: 3000 });
    setDiscardSecondsLeft(DISCARD_ROUND_SECONDS);
    const tick = setInterval(() => setDiscardSecondsLeft(s => s - 1), 1000);
    const botTimers = [];
    for (const p of players) {
      if (!p.isBot) continue;
      const dec = botDiscardDecision(p, drawnCard, hands, botMemoriesRef.current[p.id]);
      if (!dec) continue;
      const when = 700 + Math.random() * (DISCARD_ROUND_SECONDS * 1000 - 1800);
      const t = setTimeout(() => optIn(p.id, { slot: dec.slot }), when);
      botTimers.push(t);
    }
    const end = setTimeout(() => { clearInterval(tick); processDiscardRound(); }, DISCARD_ROUND_SECONDS * 1000);
    return () => { clearInterval(tick); botTimers.forEach(clearTimeout); clearTimeout(end); };
  }, [phase, paused]);

  // ----- Power 7s timer (with auto-pick fallback for human) -----
  React.useEffect(() => {
    if (phase !== PHASES.POWER_PEEK_OWN && phase !== PHASES.POWER_PEEK_OTHER && phase !== PHASES.POWER_SWAP) return;
    if (paused) return;
    if (drawer.isBot) return; // bots have their own effect
    if (window.Voice) {
      if (phase === PHASES.POWER_PEEK_OWN) window.Voice.say('Peek your own card', { key: 'p-own', cooldown: 6000 });
      else if (phase === PHASES.POWER_PEEK_OTHER) window.Voice.say('Peek an opponent card', { key: 'p-other', cooldown: 6000 });
      else window.Voice.say('Swap a card', { key: 'p-swap', cooldown: 6000 });
    }
    setPowerSecondsLeft(POWER_SECONDS);
    const tick = setInterval(() => setPowerSecondsLeft(s => {
      if (s <= 1) {
        clearInterval(tick);
        setTimeout(() => autoUsePowerForHuman(), 200);
        return 0;
      }
      return s - 1;
    }), 1000);
    return () => clearInterval(tick);
  }, [phase, drawer, paused]);

  function autoUsePowerForHuman() {
    const rand = (n) => Math.floor(Math.random() * Math.max(1, n));
    if (phase === PHASES.POWER_PEEK_OWN) {
      const slot = rand(hands[meId].length);
      powerPeekOwn(slot);
      toast('⏰ Time up — peeked a random card');
    } else if (phase === PHASES.POWER_PEEK_OTHER) {
      const opps = players.filter(p => p.id !== meId);
      const opp = opps[rand(opps.length)];
      if (opp) {
        const slot = rand(hands[opp.id].length);
        powerPeekOther(opp.id, slot);
        toast(`⏰ Time up — peeked ${opp.name}'s card`);
      }
    } else if (phase === PHASES.POWER_SWAP) {
      // Auto-swap a RANDOM card of mine with a RANDOM opponent card
      const opps = players.filter(p => p.id !== meId);
      const opp = opps[rand(opps.length)];
      if (opp) {
        const mySlot = rand(hands[meId].length);
        const theirSlot = rand(hands[opp.id].length);
        const myCard = hands[meId][mySlot];
        const theirCard = hands[opp.id][theirSlot];
        const newHands = { ...hands };
        newHands[meId] = newHands[meId].map((c, i) => i === mySlot ? theirCard : c);
        newHands[opp.id] = newHands[opp.id].map((c, i) => i === theirSlot ? myCard : c);
        setHands(newHands);
        for (const p of players) {
          if (!p.isBot) continue;
          const m = botMemoriesRef.current[p.id];
          const wasMine = botKnowsCard(m, meId, mySlot);
          const wasTheirs = botKnowsCard(m, opp.id, theirSlot);
          if (wasMine) botRememberCard(m, opp.id, theirSlot, wasMine); else botForgetSlot(m, opp.id, theirSlot);
          if (wasTheirs) botRememberCard(m, meId, mySlot, wasTheirs); else botForgetSlot(m, meId, mySlot);
        }
        AudioMgr.playSfx('swap');
        triggerSwapAnim(meId, mySlot, opp.id, theirSlot, () => {
          toast('⏰ Auto-swapped a random card!');
          afterPower();
        });
      }
    }
  }

  // ----- Bot uses power automatically -----
  React.useEffect(() => {
    if (!drawer.isBot) return;
    if (paused) return;
    const mem = botMemoriesRef.current[drawer.id];
    if (phase === PHASES.POWER_PEEK_OWN) {
      const slot = botPickPowerOwn(drawer, hands, mem);
      const t = setTimeout(() => {
        botRememberCard(mem, drawer.id, slot, hands[drawer.id][slot]);
        AudioMgr.playSfx('peek');
        triggerPeekAnim(drawer.id, slot, () => {
          toast(`${drawer.name} peeked at their card`);
          afterPower();
        });
      }, BOT_DELAY.powerOwn);
      return () => clearTimeout(t);
    }
    if (phase === PHASES.POWER_PEEK_OTHER) {
      const target = botPickPowerOther(drawer, hands, mem);
      const t = setTimeout(() => {
        botRememberCard(mem, target.playerId, target.slot, hands[target.playerId][target.slot]);
        AudioMgr.playSfx('peek');
        triggerPeekAnim(target.playerId, target.slot, () => {
          toast(`${drawer.name} peeked at ${players[target.playerId].name}'s card`);
          afterPower();
        });
      }, BOT_DELAY.powerOther);
      return () => clearTimeout(t);
    }
    if (phase === PHASES.POWER_SWAP) {
      const pick = botPickSwap(drawer, hands, mem);
      const t = setTimeout(() => {
        const myCard = hands[drawer.id][pick.mySlot];
        const theirCard = hands[pick.theirs.playerId][pick.theirs.slot];
        const newHands = { ...hands };
        newHands[drawer.id] = newHands[drawer.id].map((c, i) => i === pick.mySlot ? theirCard : c);
        newHands[pick.theirs.playerId] = newHands[pick.theirs.playerId].map((c, i) => i === pick.theirs.slot ? myCard : c);
        setHands(newHands);
        // Update bot memories: each side now holds the other's known card (if known)
        for (const p of players) {
          if (!p.isBot) continue;
          const m = botMemoriesRef.current[p.id];
          const wasMine = botKnowsCard(m, drawer.id, pick.mySlot);
          const wasTheirs = botKnowsCard(m, pick.theirs.playerId, pick.theirs.slot);
          if (wasMine) botRememberCard(m, pick.theirs.playerId, pick.theirs.slot, wasMine);
          else botForgetSlot(m, pick.theirs.playerId, pick.theirs.slot);
          if (wasTheirs) botRememberCard(m, drawer.id, pick.mySlot, wasTheirs);
          else botForgetSlot(m, drawer.id, pick.mySlot);
        }
        AudioMgr.playSfx('swap');
        triggerSwapAnim(drawer.id, pick.mySlot, pick.theirs.playerId, pick.theirs.slot, () => {
          toast(`${drawer.name} swapped with ${players[pick.theirs.playerId].name}`);
          afterPower();
        });
      }, BOT_DELAY.powerSwap);
      return () => clearTimeout(t);
    }
  }, [phase, paused]);

  // ----- Bot picks slot when buzz won -----
  React.useEffect(() => {
    if (phase !== PHASES.BUZZ_RESOLVE) return;
    if (paused) return;
    if (!players[buzzWinner]?.isBot) return;
    const bot = players[buzzWinner];
    const mem = botMemoriesRef.current[bot.id];
    const t = setTimeout(() => {
      const slot = botBuzzPickSlot(bot, drawnCard, hands, mem);
      AudioMgr.playSfx('buzz');
      performBuzzSwap(slot);
    }, BOT_DELAY.buzzPickSlot);
    return () => clearTimeout(t);
  }, [phase, buzzWinner, paused]);

  // ======= Actions =======

  function handleDraw() {
    const { drawn, deck: nd, discard: ndisc } = drawFromDeck(deck, discard, 1);
    if (drawn.length === 0) {
      finishRound(null, null);
      return;
    }
    setDeck(nd);
    setDiscard(ndisc);
    setDrawnCard(drawn[0]);
    AudioMgr.playSfx('flip');
    // Flow: draw → buzz race opens IMMEDIATELY → if no buzz AND power card, drawer uses power → next turn
    setPhase(PHASES.BUZZ);
  }

  function handleBuzzWinner(pid) {
    setBuzzWinner(pid);
    setPhase(PHASES.BUZZ_RESOLVE);
  }

  function handleBuzzTimeout() {
    // No buzz — drawer uses power if applicable, else go to the discard round
    if (!drawnCard) { nextTurn(); return; }
    if (drawnCard.power === 'peek-own') setPhase(PHASES.POWER_PEEK_OWN);
    else if (drawnCard.power === 'peek-other') setPhase(PHASES.POWER_PEEK_OTHER);
    else if (drawnCard.power === 'swap') setPhase(PHASES.POWER_SWAP);
    else startDiscardRound();
  }

  function performBuzzSwap(slotIdx) {
    const winner = buzzWinner;
    const oldCard = hands[winner][slotIdx];
    const drawnPower = drawnCard.power; // remember power before card moves
    // Animate: drawn card flies into the slot, old card flies to discard
    triggerBuzzSwapAnim(winner, slotIdx, drawnCard, oldCard, () => {
      const newHands = { ...hands };
      newHands[winner] = newHands[winner].map((c, i) => i === slotIdx ? drawnCard : c);
      setHands(newHands);
      setDiscard(d => [oldCard, ...d]);
      updateBotMemoryOnSwap(winner, slotIdx, oldCard, drawnCard);
      toast(`${players[winner].name} buzzed and swapped!`);
      AudioMgr.playSfx('swap');
      setBuzzWinner(null);
      setDrawnConsumed(true); // card went to buzzer's hand — don't discard it again
      // Drawer still uses power if the card had one
      if (drawnPower === 'peek-own') setPhase(PHASES.POWER_PEEK_OWN);
      else if (drawnPower === 'peek-other') setPhase(PHASES.POWER_PEEK_OTHER);
      else if (drawnPower === 'swap') setPhase(PHASES.POWER_SWAP);
      else startDiscardRound();
    });
  }

  // ----- Animation triggers ----- (held longer so everyone can track the action)
  function triggerPeekAnim(playerId, slot, onDone) {
    setAnimation({ kind: 'peek', playerId, slot });
    setTimeout(() => { setAnimation(null); onDone && onDone(); }, 4200);
  }
  function triggerSwapAnim(fromPid, fromSlot, toPid, toSlot, onDone) {
    setAnimation({ kind: 'swap', fromPid, fromSlot, toPid, toSlot });
    setTimeout(() => { setAnimation(null); onDone && onDone(); }, 4200);
  }
  function triggerBuzzSwapAnim(pid, slot, drawn, old, onDone) {
    setAnimation({ kind: 'buzz-swap', pid, slot });
    setTimeout(() => { setAnimation(null); onDone && onDone(); }, 3400);
  }

  function endTurnDiscard() {
    // Only discard drawnCard if it wasn't already taken by a buzz winner
    if (drawnCard && !drawnConsumed) setDiscard(d => [drawnCard, ...d]);
    nextTurn();
  }

  // After drawer finishes using power, go to the shared discard round
  function afterPower() {
    startDiscardRound();
  }

  // ----- Shared opt-in discard round -----
  function startDiscardRound() {
    if (!drawnCard) { nextTurn(); return; }
    const rank = drawnCard.rank;
    const anyMatch = players.some(p => (hands[p.id] || []).some(c => c.rank === rank));
    if (!anyMatch) { endTurnDiscard(); return; }   // nobody can discard — keep pace
    optedInRef.current = {};
    setOptedIn({});
    committedDiscardRef.current = false;
    setPhase(PHASES.DISCARD_ROUND);
  }

  function optIn(pid, dec) {
    if (optedInRef.current[pid]) return; // locked once opted — can't undo
    optedInRef.current = { ...optedInRef.current, [pid]: dec };
    setOptedIn(optedInRef.current);
    AudioMgr.playSfx('click');
    if (pid === meId && window.Voice) window.Voice.say('Locked in', { cooldown: 0 });
  }

  function drawNFrom(srcDeck, srcDiscard, n) {
    let d = srcDeck.slice(), disc = srcDiscard.slice(); const out = [];
    for (let i = 0; i < n; i++) {
      if (d.length === 0) { if (disc.length === 0) break; d = shuffle(disc); disc = []; }
      out.push(d.shift());
    }
    return { out, deck: d, discard: disc };
  }

  function processDiscardRound() {
    const opted = optedInRef.current;
    const rank = drawnCard ? drawnCard.rank : null;
    let workHands = { ...hands };
    let workDeck = deck.slice();
    let workDiscard = discard.slice();
    const announcements = [];
    // Resolve every opted-in BOT in one batched pass (human resolves via overlay after)
    for (const pid of Object.keys(opted)) {
      if (Number(pid) === meId) continue;
      const p = players[pid];
      if (!p || !p.isBot) continue;
      const dec = opted[pid];
      const card = workHands[p.id][dec.slot];
      if (card && rank && card.rank === rank) {
        workHands[p.id] = workHands[p.id].filter((_, i) => i !== dec.slot);
        workDiscard = [card, ...workDiscard];
        updateBotMemoryOnDiscardSuccess(p.id, dec.slot);
        announcements.push({ kind: 'win', title: `🎉 ${p.name} — ${tamilCheer()}!`, sub: `Discarded a ${card.rank}` });
      } else {
        const pen = drawNFrom(workDeck, workDiscard, 2);
        workDeck = pen.deck; workDiscard = pen.discard;
        const oldHand = workHands[p.id];
        workHands[p.id] = [...pen.out.slice(0, 1), ...oldHand, ...pen.out.slice(1, 2)];
        updateBotMemoryOnPenaltyAdd(p.id, oldHand, workHands[p.id]);
        announcements.push({ kind: 'fail', title: `💥 ${p.name} — ${TAMIL_FAIL}!`, sub: 'Wrong card — +2 cards' });
      }
    }
    setHands(workHands); setDeck(workDeck); setDiscard(workDiscard);
    if (announcements.length) {
      const a = announcements[0];
      AudioMgr.playSfx(a.kind === 'win' ? 'discard-good' : 'discard-bad');
      showAchievement(a.kind, a.title, a.sub, 2800);
    }
    // Human opted in → open committed selection overlay; else end the turn
    if (opted[meId]) {
      committedDiscardRef.current = true;
      setTimeout(() => setDiscardingPlayer(meId), announcements.length ? 1200 : 250);
    } else {
      setTimeout(() => endTurnDiscard(), announcements.length ? 1500 : 450);
    }
  }

  function finishHumanDiscard() {
    setDiscardingPlayer(null);
    if (committedDiscardRef.current) {
      committedDiscardRef.current = false;
      setTimeout(() => endTurnDiscard(), 1300);
    }
  }


  function nextTurn() {
    setDrawnCard(null);
    setDrawnConsumed(false);
    setPeekTarget(null);
    setSwapMine(null);
    setSwapTheirs(null);
    setBuzzWinner(null);
    setDiscardingPlayer(null);
    const next = (currentPlayer + 1) % players.length;
    setCurrentPlayer(next);
    setPhase(PHASES.TURN_START);
  }

  // ----- Power: human actions -----
  function powerPeekOwn(slot) {
    AudioMgr.playSfx('peek');
    setPeekTarget({ playerId: meId, slot, until: Date.now() + 4800 });
    setAnimation({ kind: 'peek', playerId: meId, slot });
    setTimeout(() => setAnimation(null), 4800);
    setTimeout(() => { setPeekTarget(null); afterPower(); }, 4800);
  }
  function powerPeekOther(targetPid, slot) {
    AudioMgr.playSfx('peek');
    setPeekTarget({ playerId: targetPid, slot, until: Date.now() + 4800 });
    setAnimation({ kind: 'peek', playerId: targetPid, slot });
    setTimeout(() => setAnimation(null), 4800);
    setTimeout(() => { setPeekTarget(null); afterPower(); }, 4800);
  }
  function powerDoSwap() {
    if (swapMine == null || !swapTheirs) return;
    AudioMgr.playSfx('swap');
    const myCard = hands[meId][swapMine];
    const theirCard = hands[swapTheirs.playerId][swapTheirs.slot];
    const fromPid = meId, fromSlot = swapMine;
    const toPid = swapTheirs.playerId, toSlot = swapTheirs.slot;
    setAnimation({ kind: 'swap', fromPid, fromSlot, toPid, toSlot });
    setTimeout(() => {
      const newHands = { ...hands };
      newHands[meId] = newHands[meId].map((c, i) => i === swapMine ? theirCard : c);
      newHands[toPid] = newHands[toPid].map((c, i) => i === toSlot ? myCard : c);
      setHands(newHands);
      // Bot memory updates
      for (const p of players) {
        if (!p.isBot) continue;
        const m = botMemoriesRef.current[p.id];
        const wasMine = botKnowsCard(m, meId, swapMine);
        const wasTheirs = botKnowsCard(m, toPid, toSlot);
        if (wasMine) botRememberCard(m, toPid, toSlot, wasMine);
        else botForgetSlot(m, toPid, toSlot);
        if (wasTheirs) botRememberCard(m, meId, swapMine, wasTheirs);
        else botForgetSlot(m, meId, swapMine);
      }
      setAnimation(null);
      toast('Swap complete!');
      afterPower();
    }, 3200);
  }

  // ----- Discard claim -----
  function performDiscardClaim(slotIdxOrList) {
    const claimer = discardingPlayer;
    // Accept single int or array; normalize to array
    const slots = Array.isArray(slotIdxOrList) ? slotIdxOrList : [slotIdxOrList];
    if (slots.length === 0) return;
    const cards = slots.map(i => hands[claimer][i]);
    const allMatch = cards.every(c => c.rank === drawnCard.rank);
    if (allMatch) {
      const oldHand = hands[claimer];
      const removeSet = new Set(slots);
      const newHands = { ...hands };
      newHands[claimer] = oldHand.filter((_, idx) => !removeSet.has(idx));
      setHands(newHands);
      // Push all matched cards to discard pile
      setDiscard(d => [...cards, ...d]);
      // Update bot memory — shift indices for each removal (highest first to keep indices valid)
      const sortedDesc = [...slots].sort((a, b) => b - a);
      for (const s of sortedDesc) updateBotMemoryOnDiscardSuccess(claimer, s);
      AudioMgr.playSfx('discard-good');
      const msg = slots.length > 1 ? `Discarded ${slots.length} ${drawnCard.rank}s!` : `Removed a ${drawnCard.rank}`;
      showAchievement('win', '🎉 ' + tamilCheer() + '!', msg);
      finishHumanDiscard();
    } else {
      const { drawn: penalty, deck: nd, discard: ndisc } = drawFromDeck(deck, discard, 2);
      const oldHand = hands[claimer];
      const newHands = { ...hands };
      newHands[claimer] = [...penalty.slice(0, 1), ...oldHand, ...penalty.slice(1, 2)];
      setHands(newHands);
      setDeck(nd);
      setDiscard(ndisc);
      updateBotMemoryOnPenaltyAdd(claimer, oldHand, newHands[claimer]);
      AudioMgr.playSfx('discard-bad');
      const wrongCount = cards.filter(c => c.rank !== drawnCard.rank).length;
      const sub = slots.length > 1
        ? `${wrongCount} of ${slots.length} wrong — no cards removed. Better luck next time! +2 cards`
        : 'Better luck next time! +2 cards';
      showAchievement('fail', '💥 ' + TAMIL_FAIL + '!', sub);
      finishHumanDiscard();
    }
  }

  // ----- Knock -----
  function attemptKnock() {
    if (!isMyTurn) { toast("It's not your turn"); return; }
    if (phase !== PHASES.TURN_START) { toast('Knock only at the start of your turn'); return; }
    if (hands[meId].length > 2) {
      toast('Need ≤ 2 cards to knock');
      return;
    }
    setConfirmModal({
      title: '🤜 KNOCK',
      body: `End the round now? You'll only win if you have the lowest sum.`,
      confirmLabel: 'KNOCK',
      gold: true,
      onConfirm: doKnock,
      onCancel: () => setConfirmModal(null)
    });
  }

  function doKnock() {
    setConfirmModal(null);
    const sums = {};
    for (const p of players) sums[p.id] = handSum(hands[p.id]);
    const myS = sums[currentPlayer];
    const minS = Math.min(...Object.values(sums));
    const success = myS === minS && Object.values(sums).filter(s => s === minS).length === 1;
    if (success) {
      AudioMgr.playSfx('win');
      finishRound(currentPlayer, true);
    } else {
      // Wrong knock — apply +1 penalty card and CONTINUE the game.
      const { drawn: penalty, deck: nd, discard: ndisc } = drawFromDeck(deck, discard, 1);
      const newHands = { ...hands };
      newHands[currentPlayer] = [...newHands[currentPlayer], ...penalty];
      setHands(newHands);
      setDeck(nd);
      setDiscard(ndisc);
      AudioMgr.playSfx('discard-bad');
      showAchievement('fail', `💥 BAD KNOCK`, `${players[currentPlayer].name} +1 card — game continues`);
      // Skip drawer's draw this turn; advance to next player.
      setTimeout(() => nextTurn(), 1400);
    }
  }

  function finishRound(knocker, success, finalHands) {
    setKnockerId(knocker);
    setKnockSuccess(success);
    if (finalHands) setHands(finalHands);
    setPhase(PHASES.OVER);
  }

  // ======= Render =======
  // Early returns moved here, AFTER all hooks have been declared (Rules of Hooks)
  if (phase === PHASES.SPIN) {
    return (
      <SpinScreen
        players={players}
        onDone={(winnerIdx) => {
          setCurrentPlayer(winnerIdx);
          setPhase(PHASES.PEEK);
        }}
      />
    );
  }
  if (phase === PHASES.PEEK) {
    if (isLocal) {
      // Rotate peek through every player; show pass screen between
      const peekPlayer = players[peekIndex];
      if (needPass) {
        return <PassScreen player={peekPlayer} action="peek your cards" onReady={() => setNeedPass(false)} />;
      }
      return (
        <PeekScreen
          player={peekPlayer}
          hand={hands[peekPlayer.id]}
          onDone={() => {
            if (peekIndex + 1 < players.length) {
              setPeekIndex(peekIndex + 1);
              setNeedPass(true);
            } else {
              setPhase(PHASES.TURN_START);
              // currentPlayer already set by SpinScreen — keep it
              setNeedPass(true);
            }
          }}
        />
      );
    }
    return (
      <PeekScreen
        player={players[0]}
        hand={hands[0]}
        onDone={() => {
          setPhase(PHASES.TURN_START);
          // currentPlayer already set by SpinScreen — keep it
        }}
      />
    );
  }
  if (isLocal && needPass && phase === PHASES.TURN_START && !drawer.isBot) {
    return <PassScreen player={drawer} action="take your turn" onReady={() => setNeedPass(false)} />;
  }
  if (phase === PHASES.OVER) {
    const ranking = players.map(p => ({
      player: p,
      hand: hands[p.id],
      sum: handSum(hands[p.id])
    })).sort((a, b) => a.sum - b.sum);
    return (
      <GameOverScreen
        ranking={ranking}
        players={players}
        knockerId={knockerId}
        knockSuccess={knockSuccess}
        onReplay={() => onGameOver()}
        onMenu={onMenu}
      />
    );
  }

  const otherPlayers = players.filter(p => p.id !== meId);
  const buzzCanFire = phase === PHASES.BUZZ && !me.isBot && currentPlayer !== meId;
  const knockEnabled = isMyTurn && phase === PHASES.TURN_START && hands[meId].length <= 2;
  const peekActive = peekTarget && Date.now() < peekTarget.until;

  return (
    <div className="screen">
      {/* HUD */}
      <div className="hud">
        <div className="hud-pill">
          <span className="dot" />
          <span>Deck {deck.length}</span>
        </div>
        <div className="hud-pill" style={{ background: isMyTurn ? 'var(--gold)' : 'rgba(0,0,0,0.4)', color: isMyTurn ? '#000' : 'white' }}>
          <PlayerAvatar index={currentPlayer} name={drawer.name} size={20} />
          <span style={{ fontWeight: 900 }}>{drawer.name}{drawer.isBot ? ' 🤖' : ''}'s turn</span>
        </div>
        <SoundToggles compact mode={mode} onPause={() => setPaused(p => !p)} onExit={() => {
          setConfirmModal({
            title: 'Exit game?',
            body: 'You\u2019ll lose progress and return to the main menu.',
            confirmLabel: 'Exit',
            onConfirm: () => { setConfirmModal(null); onMenu && onMenu(); },
            onCancel: () => setConfirmModal(null)
          });
        }} />
      </div>

      {/* Players seated around the felt table */}
      <div className="table-area">
        <div className="felt-oval">
          {otherPlayers.map((p, idx) => {
            const n = otherPlayers.length;
            const t = (idx + 1) / (n + 1);
            const angle = (158 - t * 136) * Math.PI / 180; // arc across the top
            const x = 50 + 38 * Math.cos(angle);
            const y = 30 - 15 * Math.sin(angle);
            const isActive = p.id === currentPlayer;
            const isPeekRevealedHere = peekActive && peekTarget.playerId === p.id;
            const selectableForPeek = phase === PHASES.POWER_PEEK_OTHER && !peekTarget && isMyTurn;
            const selectableForSwap = phase === PHASES.POWER_SWAP && swapMine != null && isMyTurn;
            const isSelectedSwap = swapTheirs && swapTheirs.playerId === p.id;
            return (
              <div key={p.id} className="seat" style={{ left: x + '%', top: y + '%' }}>
                <OpponentMini
                  player={p}
                  hand={hands[p.id]}
                  isActive={isActive}
                  revealedSlot={isPeekRevealedHere ? peekTarget.slot : null}
                  selectable={selectableForPeek || selectableForSwap}
                  selectedSlot={isSelectedSwap ? swapTheirs.slot : null}
                  animatingSlot={animation && ((animation.kind === 'peek' && animation.playerId === p.id) ? animation.slot : (animation.kind === 'swap' && animation.toPid === p.id) ? animation.toSlot : (animation.kind === 'swap' && animation.fromPid === p.id) ? animation.fromSlot : (animation.kind === 'buzz-swap' && animation.pid === p.id) ? animation.slot : null)}
                  onSlotClick={(slot) => {
                    if (phase === PHASES.POWER_PEEK_OTHER) powerPeekOther(p.id, slot);
                    else if (phase === PHASES.POWER_SWAP && swapMine != null) setSwapTheirs({ playerId: p.id, slot });
                  }}
                />
              </div>
            );
          })}

          {/* Center area — deck / drawn / discard */}
          <div className="center-area table-center">
            <div className="deck-row">
              <div className="deck-stack">
                <Card faceUp={false} size={{ w: 56, h: 80 }} />
                <Card faceUp={false} size={{ w: 56, h: 80 }} />
                {phase === PHASES.TURN_START && isMyTurn ? (
                  <Card faceUp={false} size={{ w: 56, h: 80 }} onClick={handleDraw} className="pulse-gold" style={{ cursor: 'pointer' }} />
                ) : (
                  <Card faceUp={false} size={{ w: 56, h: 80 }} />
                )}
                <span className="deck-label">DECK · {deck.length}</span>
              </div>

              <div style={{ position: 'relative', minWidth: 64, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {drawnCard ? (
                  <Card key={drawnCard.id} card={drawnCard} faceUp size={{ w: 64, h: 90 }} className="drawn-pop" />
                ) : (
                  <div style={{ width: 64, height: 90, border: '2px dashed rgba(255,255,255,0.2)', borderRadius: 10 }} />
                )}
                <span className="deck-label">DRAWN</span>
              </div>

              <div className="discard-stack">
                {discard.length > 0 ? (
                  <Card key={discard[0].id} card={discard[0]} faceUp size={{ w: 56, h: 80 }} className="discard-drop" />
                ) : (
                  <div style={{ width: 56, height: 80, border: '2px dashed rgba(255,255,255,0.2)', borderRadius: 10 }} />
                )}
                <span className="deck-label">DISCARD · {discard.length}</span>
              </div>
            </div>

            {/* Phase indicator */}
            <PhaseIndicator
              phase={phase}
              drawnCard={drawnCard}
              drawer={drawer}
              buzzSecondsLeft={buzzSecondsLeft}
              powerSecondsLeft={powerSecondsLeft}
              discardSecondsLeft={discardSecondsLeft}
              isMyTurn={isMyTurn}
              swapMine={swapMine}
              swapTheirs={swapTheirs}
            />
          </div>
        </div>
      </div>

      {/* My hand */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: 2, opacity: 0.7, marginBottom: 6 }}>
          {isLocal ? `${me.name.toUpperCase()}'S HAND` : 'YOUR HAND'} · {hands[meId].length} card{hands[meId].length === 1 ? '' : 's'}
        </div>
        <MyHand
          hand={hands[meId]}
          phase={phase}
          peekTarget={peekActive && peekTarget.playerId === meId ? peekTarget : null}
          swapMine={swapMine}
          discardingPlayer={discardingPlayer}
          isMyTurn={isMyTurn}
          onPeekOwnSlot={powerPeekOwn}
          onSwapMineSlot={setSwapMine}
          onDiscardSlot={performDiscardClaim}
          animation={animation}
          meId={meId}
        />

        {/* Action bar */}
        {phase === PHASES.DISCARD_ROUND ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 12 }}>
            {optedIn[meId] ? (
              <button className="btn btn-success btn-lg" disabled>✓ LOCKED IN — discarding…</button>
            ) : (
              <button className="btn btn-danger btn-lg" onClick={() => optIn(meId, true)}>
                ✋ I'LL DISCARD · {discardSecondsLeft}s
              </button>
            )}
            <div style={{ fontSize: 11, opacity: 0.75, textAlign: 'center' }}>
              Opt in to discard your <b style={{ color: '#ffe28a' }}>{drawnCard?.rank}</b>s · once opted you can't undo
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 16, marginTop: 12, justifyContent: 'center', alignItems: 'center' }}>
            <button
              className={"buzz-action-btn " + (buzzCanFire ? 'active' : 'inactive')}
              disabled={!buzzCanFire}
              onClick={() => buzzCanFire && handleBuzzWinner(0)}
            >
              <span className="buzz-emoji">🔔</span>
              BUZZ
            </button>
            <button
              className={"btn " + (knockEnabled ? 'btn-success' : 'btn-ghost')}
              disabled={!knockEnabled}
              onClick={attemptKnock}
            >
              🤜 KNOCK
            </button>
          </div>
        )}

        {/* Confirm swap button */}
        {phase === PHASES.POWER_SWAP && swapMine != null && swapTheirs && isMyTurn && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
            <button className="btn btn-gold btn-lg" onClick={powerDoSwap}>Confirm swap</button>
          </div>
        )}
      </div>

      {/* Buzz resolve overlay (human picks slot to swap) */}
      {phase === PHASES.BUZZ_RESOLVE && buzzWinner === meId && (
        <BuzzResolveOverlay
          player={players[meId]}
          hand={hands[meId]}
          drawnCard={drawnCard}
          onPick={performBuzzSwap}
        />
      )}

      {/* Discard select overlay */}
      {discardingPlayer === meId && (
        <DiscardSelectOverlay
          player={players[meId]}
          hand={hands[meId]}
          drawnCard={drawnCard}
          committed={committedDiscardRef.current}
          onPick={performDiscardClaim}
          onCancel={finishHumanDiscard}
        />
      )}

      <ToastStack toasts={toasts} />
      <ActionSpotlight animation={animation} players={players} hands={hands} currentPlayer={currentPlayer} />
      {achievement && (
        <div className={"achievement-banner " + achievement.kind}>
          {achievement.title}
          {achievement.sub && <span className="sub">{achievement.sub}</span>}
        </div>
      )}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {confirmModal && <ConfirmModal {...confirmModal} />}
      {paused && (
        <div className="pause-overlay">
          <div className="pause-icon">⏸</div>
          <div className="pause-title">PAUSED</div>
          <div style={{ opacity: 0.7, fontSize: 13, maxWidth: 280, textAlign: 'center' }}>
            Take a break! Bots and timers will resume when you continue.
          </div>
          <button className="btn btn-gold btn-lg" onClick={() => setPaused(false)}>▶ Resume</button>
        </div>
      )}
    </div>
  );
}

function PhaseIndicator({ phase, drawnCard, drawer, buzzSecondsLeft, powerSecondsLeft, discardSecondsLeft, isMyTurn, swapMine, swapTheirs }) {
  if (phase === PHASES.TURN_START) {
    return <div className="power-banner">{isMyTurn ? 'Your turn — tap deck to draw' : `${drawer.name} is thinking...`}</div>;
  }
  if (phase === PHASES.DRAWING) return <div className="power-banner">Drawing...</div>;
  if (phase === PHASES.BUZZ) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <CountdownRing secondsLeft={buzzSecondsLeft} total={BUZZ_SECONDS} size={60} />
        <div style={{ fontSize: 12, color: '#fff', letterSpacing: 1, background: 'rgba(23,34,59,0.6)', padding: '4px 12px', borderRadius: 999 }}>🔔 BUZZ RACE — anyone can buzz!</div>
      </div>
    );
  }
  if (phase === PHASES.DISCARD_ROUND) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <CountdownRing secondsLeft={discardSecondsLeft} total={DISCARD_ROUND_SECONDS} size={60} />
        <div className="power-banner">🗑️ DISCARD ROUND — opt in to dump your {drawnCard?.rank}s</div>
      </div>
    );
  }
  if (phase === PHASES.POWER_PEEK_OWN) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {isMyTurn && <CountdownRing secondsLeft={powerSecondsLeft} total={POWER_SECONDS} size={60} />}
        <div className="power-banner">{isMyTurn ? '7/8 — Tap your own card' : `${drawer.name} peeking own card`}</div>
      </div>
    );
  }
  if (phase === PHASES.POWER_PEEK_OTHER) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {isMyTurn && <CountdownRing secondsLeft={powerSecondsLeft} total={POWER_SECONDS} size={60} />}
        <div className="power-banner">{isMyTurn ? '9/10 — Tap an opponent card' : `${drawer.name} peeking opponent`}</div>
      </div>
    );
  }
  if (phase === PHASES.POWER_SWAP) {
    let msg = isMyTurn ? `${drawnCard.rank} — Pick your card to give` : `${drawer.name} swapping`;
    if (isMyTurn && swapMine != null && !swapTheirs) msg = 'Now pick an opponent card';
    if (isMyTurn && swapMine != null && swapTheirs) msg = 'Confirm the swap';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {isMyTurn && <CountdownRing secondsLeft={powerSecondsLeft} total={POWER_SECONDS} size={60} />}
        <div className="power-banner">{msg}</div>
      </div>
    );
  }
  if (phase === PHASES.BUZZ_RESOLVE) return <div className="power-banner">Resolving buzz...</div>;
  return null;
}

function MyHand({ hand, phase, peekTarget, swapMine, discardingPlayer, isMyTurn, onPeekOwnSlot, onSwapMineSlot, onDiscardSlot, animation, meId }) {
  const order = handDisplayOrder(hand.length);
  return (
    <div className="hand-row">
      {order.map((i) => {
        const c = hand[i];
        const isMyPeek = phase === PHASES.POWER_PEEK_OWN && isMyTurn && !peekTarget;
        const isMySwap = phase === PHASES.POWER_SWAP && isMyTurn && swapMine == null;
        const isDiscardPick = discardingPlayer === meId;
        const selectable = isMyPeek || isMySwap || isDiscardPick;
        const isPowerTarget = isMyPeek || isMySwap;
        const selected = swapMine === i;
        const revealed = peekTarget && peekTarget.slot === i;
        const animating = animation && ((animation.kind === 'peek' && animation.playerId === meId) ? animation.slot === i : (animation.kind === 'swap' && animation.fromPid === meId) ? animation.fromSlot === i : (animation.kind === 'swap' && animation.toPid === meId) ? animation.toSlot === i : (animation.kind === 'buzz-swap' && animation.pid === meId) ? animation.slot === i : false);
        const isBase = hand.length === 4 && (i === 2 || i === 3);
        const onClick = isMyPeek ? () => onPeekOwnSlot(i)
                      : isMySwap ? () => onSwapMineSlot(i)
                      : isDiscardPick ? () => onDiscardSlot(i)
                      : undefined;
        return (
          <div
            key={c.id}
            className={"hand-slot " + (isBase ? 'base-slot ' : '') + (selectable ? 'selectable ' : '') + (selected ? 'selected ' : '') + (isPowerTarget ? 'power-target ' : '') + (animating ? 'glow-flash ' : '') + (revealed ? 'peek-flash ' : '')}
            onClick={onClick}
          >
            <Card card={revealed ? c : null} faceUp={revealed} size={{ w: 64, h: 90 }} />
          </div>
        );
      })}
    </div>
  );
}

function OpponentMini({ player, hand, isActive, revealedSlot, selectable, selectedSlot, onSlotClick, animatingSlot }) {
  return (
    <div className={isActive ? 'opp-active' : ''} style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      padding: '6px 10px',
      borderRadius: 12,
      background: isActive ? 'rgba(245,200,66,0.2)' : 'rgba(0,0,0,0.2)',
      border: isActive ? '2px solid var(--gold)' : '2px solid transparent',
      transition: 'all 0.2s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
        <PlayerAvatar index={player.id} name={player.name} size={20} />
        <span style={{ fontWeight: 900, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.name}{player.isBot ? '🤖' : ''}
        </span>
        <span style={{ opacity: 0.5 }}>·{hand.length}</span>
      </div>
      <div className="hand-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: 3, justifyContent: 'center' }}>
        {handDisplayOrder(hand.length).map((i) => {
          const c = hand[i];
          const revealed = revealedSlot === i;
          const isSelected = selectedSlot === i;
          const animating = animatingSlot === i;
          const isBase = hand.length === 4 && (i === 2 || i === 3);
          return (
            <div
              key={c.id}
              className={"hand-slot " + (isBase ? 'base-slot ' : '') + (selectable ? 'selectable ' : '') + (isSelected ? 'selected ' : '') + (selectable ? 'power-target ' : '') + (animating ? 'glow-flash ' : '') + (revealed ? 'peek-flash ' : '')}
              onClick={selectable ? () => onSlotClick(i) : undefined}
              style={{ cursor: selectable ? 'pointer' : 'default' }}
            >
              <Card card={revealed ? c : null} faceUp={revealed} size={{ w: 32, h: 46 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BuzzResolveOverlay({ player, hand, drawnCard, onPick }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-title">{player.name}, pick a card to swap</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'center', fontSize: 11, opacity: 0.7 }}>
            <div>You'll receive</div>
            <Card card={drawnCard} faceUp size={{ w: 56, h: 80 }} />
          </div>
        </div>
        <div className="modal-body">Tap a card from memory.</div>
        <div className="hand-grid" style={{ gridTemplateColumns: `repeat(${Math.min(hand.length, 4)}, auto)` }}>
          {hand.map((c, i) => (
            <div key={c.id} className="hand-slot selectable" onClick={() => onPick(i)}>
              <Card card={null} faceUp={false} size={{ w: 56, h: 80 }} />
              {hand.length === 4 && i >= 2 && <span className="hand-label">Base {i - 1}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DiscardSelectOverlay({ player, hand, drawnCard, onPick, onCancel, committed }) {
  const [picked, setPicked] = React.useState({});
  const pickedSlots = Object.keys(picked).filter(k => picked[k]).map(Number);
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-title">Discard all {drawnCard.rank}s</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'center', fontSize: 11, opacity: 0.7 }}>
            <div>Match this</div>
            <Card card={drawnCard} faceUp size={{ w: 48, h: 68 }} />
          </div>
        </div>
        <div className="modal-body" style={{ fontSize: 12 }}>
          Tap one or more cards. <b style={{ color: '#e8760c' }}>All</b> must match.<br/>
          <span style={{ color: '#d63a2f' }}>Any wrong → +2 penalty, no cards removed.</span>
        </div>
        <div className="hand-grid" style={{ gridTemplateColumns: `repeat(${Math.min(hand.length, 4)}, auto)` }}>
          {hand.map((c, i) => {
            const isPicked = !!picked[i];
            return (
              <div
                key={c.id}
                className={"hand-slot selectable " + (isPicked ? 'selected' : '')}
                onClick={() => setPicked(p => ({ ...p, [i]: !p[i] }))}
              >
                <Card card={null} faceUp={false} size={{ w: 56, h: 80 }} positionLabel={positionLabelFor(i, hand.length)} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!committed && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>}
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

// Big, clear announcement of swaps / peeks / buzz-swaps — shows WHO acted (names, no card numbers)
function ActionSpotlight({ animation, players, hands, currentPlayer }) {
  if (!animation) return null;
  const name = (pid) => players[pid]?.name || '?';
  const drawerName = name(currentPlayer);
  let icon = '✨', title = '', sub = null;
  if (animation.kind === 'swap') {
    icon = '🔄'; title = 'SWAP';
    sub = (<span><b>{name(animation.fromPid)}</b> ⇄ <b>{name(animation.toPid)}</b></span>);
  } else if (animation.kind === 'peek') {
    icon = '👁'; title = 'PEEK';
    const who = name(animation.playerId);
    sub = (<span><b>{drawerName}</b> peeked {animation.playerId === currentPlayer ? 'their own card' : <><b>{who}</b>'s card</>}</span>);
  } else if (animation.kind === 'buzz-swap') {
    icon = '🔔'; title = 'BUZZ!';
    sub = (<span><b>{name(animation.pid)}</b> grabbed the drawn card</span>);
  } else {
    return null;
  }
  return (
    <div className="action-spotlight">
      <div className="spot-icon">{icon}</div>
      <div className="spot-title">{title}</div>
      {sub && <div className="spot-sub">{sub}</div>}
    </div>
  );
}

Object.assign(window, { GameTable });