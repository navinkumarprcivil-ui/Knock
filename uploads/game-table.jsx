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
  TURN_END: 'turn-end',         // brief animation before next turn
  OVER: 'over'
};

// Bot pacing — slower so kids/elders can follow what's happening
const BOT_DELAY = {
  thinkStart: 3400,    // bot decides whether to knock / draws
  buzzPickSlot: 3200,  // bot picks slot after winning buzz
  powerOwn: 4000,      // bot peeks own card
  powerOther: 4200,    // bot peeks other
  powerSwap: 4800,     // bot performs swap
  buzzMin: 1400,       // earliest a bot can buzz (ms after window opens)
};
const POWER_SECONDS = 15;
const BUZZ_SECONDS = 8;

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

  const [phase, setPhase] = React.useState(PHASES.PEEK);
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

  // Power flow
  const [peekTarget, setPeekTarget] = React.useState(null); // { playerId, slot, until }
  const [swapMine, setSwapMine] = React.useState(null);
  const [swapTheirs, setSwapTheirs] = React.useState(null);
  const [powerSecondsLeft, setPowerSecondsLeft] = React.useState(0);

  // Buzz
  const [buzzWinner, setBuzzWinner] = React.useState(null);
  const [buzzSecondsLeft, setBuzzSecondsLeft] = React.useState(0);

  // Discard claim (human-driven)
  const [discardingPlayer, setDiscardingPlayer] = React.useState(null);

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

  function showAchievement(kind, title, sub, ms = 1400) {
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
    if (window.Voice) window.Voice.say(`${drawer.name}, your turn`, { key: 'turn-' + currentPlayer, cooldown: 0 });
    const t = setTimeout(() => {
      toast(`⏰ Auto-drawing for ${drawer.name}`);
      handleDraw();
    }, 15000);
    return () => clearTimeout(t);
  }, [phase, currentPlayer, paused]);
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
  }, [phase, currentPlayer]);

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

    // Schedule bot DISCARD claims (parallel during buzz window — they can preempt buzz)
    for (const p of players) {
      if (!p.isBot) continue;
      const dec = botDiscardDecision(p, drawnCard, hands, botMemoriesRef.current[p.id]);
      if (!dec) continue;
      const slowDelay = Math.max(BOT_DELAY.buzzMin, dec.delay * 1.6);
      const t = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        timers.forEach(clearTimeout);
        clearInterval(tick);
        botPerformDiscardClaim(p, dec.slot);
      }, slowDelay);
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
  }, [phase]);

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
  }, [phase, drawer]);

  function autoUsePowerForHuman() {
    if (phase === PHASES.POWER_PEEK_OWN) {
      // Auto-peek slot 0 (top-left)
      powerPeekOwn(0);
      toast('⏰ Time up — peeked TOP-L');
    } else if (phase === PHASES.POWER_PEEK_OTHER) {
      // Auto-peek first opponent's slot 0
      const firstOpp = players.find(p => p.id !== 0);
      if (firstOpp) {
        powerPeekOther(firstOpp.id, 0);
        toast(`⏰ Time up — peeked ${firstOpp.name}'s TOP-L`);
      }
    } else if (phase === PHASES.POWER_SWAP) {
      // Auto-swap: my slot 0 with first opponent's slot 0
      const firstOpp = players.find(p => p.id !== meId);
      if (firstOpp) {
        const myCard = hands[meId][0];
        const theirCard = hands[firstOpp.id][0];
        const newHands = { ...hands };
        newHands[meId] = newHands[meId].map((c, i) => i === 0 ? theirCard : c);
        newHands[firstOpp.id] = newHands[firstOpp.id].map((c, i) => i === 0 ? myCard : c);
        setHands(newHands);
        toast('⏰ Auto-swapped!');
        afterPower();
      }
    }
  }

  // ----- Bot uses power automatically -----
  React.useEffect(() => {
    if (!drawer.isBot) return;
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
  }, [phase]);

  // ----- Bot picks slot when buzz won -----
  React.useEffect(() => {
    if (phase !== PHASES.BUZZ_RESOLVE) return;
    if (!players[buzzWinner]?.isBot) return;
    const bot = players[buzzWinner];
    const mem = botMemoriesRef.current[bot.id];
    const t = setTimeout(() => {
      const slot = botBuzzPickSlot(bot, drawnCard, hands, mem);
      AudioMgr.playSfx('buzz');
      performBuzzSwap(slot);
    }, BOT_DELAY.buzzPickSlot);
    return () => clearTimeout(t);
  }, [phase, buzzWinner]);

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
    // Flow: draw → buzz race first → if no buzz AND power card, drawer uses power → next turn
    setTimeout(() => setPhase(PHASES.BUZZ), 700);
    setPhase(PHASES.DRAWING);
  }

  function handleBuzzWinner(pid) {
    setBuzzWinner(pid);
    setPhase(PHASES.BUZZ_RESOLVE);
  }

  function handleBuzzTimeout() {
    // No buzz — drawer uses power if applicable, else turn ends
    if (!drawnCard) { nextTurn(); return; }
    if (drawnCard.power === 'peek-own') setPhase(PHASES.POWER_PEEK_OWN);
    else if (drawnCard.power === 'peek-other') setPhase(PHASES.POWER_PEEK_OTHER);
    else if (drawnCard.power === 'swap') setPhase(PHASES.POWER_SWAP);
    else endTurnDiscard();
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
      // Drawer still uses power if the card had one
      if (drawnPower === 'peek-own') { setDrawnCard(null); setPhase(PHASES.POWER_PEEK_OWN); }
      else if (drawnPower === 'peek-other') { setDrawnCard(null); setPhase(PHASES.POWER_PEEK_OTHER); }
      else if (drawnPower === 'swap') { setDrawnCard(null); setPhase(PHASES.POWER_SWAP); }
      else nextTurn();
    });
  }

  // ----- Animation triggers -----
  function triggerPeekAnim(playerId, slot, onDone) {
    setAnimation({ kind: 'peek', playerId, slot });
    setTimeout(() => { setAnimation(null); onDone && onDone(); }, 3200);
  }
  function triggerSwapAnim(fromPid, fromSlot, toPid, toSlot, onDone) {
    setAnimation({ kind: 'swap', fromPid, fromSlot, toPid, toSlot });
    setTimeout(() => { setAnimation(null); onDone && onDone(); }, 3200);
  }
  function triggerBuzzSwapAnim(pid, slot, drawn, old, onDone) {
    setAnimation({ kind: 'buzz-swap', pid, slot });
    setTimeout(() => { setAnimation(null); onDone && onDone(); }, 2400);
  }

  function endTurnDiscard() {
    if (drawnCard) setDiscard(d => [drawnCard, ...d]);
    nextTurn();
  }

  // After drawer finishes using power, turn ends (buzz race already happened)
  function afterPower() {
    endTurnDiscard();
  }

  function nextTurn() {
    setDrawnCard(null);
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
    setPeekTarget({ playerId: meId, slot, until: Date.now() + 4000 });
    setAnimation({ kind: 'peek', playerId: meId, slot });
    setTimeout(() => setAnimation(null), 1400);
    setTimeout(() => { setPeekTarget(null); afterPower(); }, 4000);
  }
  function powerPeekOther(targetPid, slot) {
    AudioMgr.playSfx('peek');
    setPeekTarget({ playerId: targetPid, slot, until: Date.now() + 4000 });
    setAnimation({ kind: 'peek', playerId: targetPid, slot });
    setTimeout(() => setAnimation(null), 1400);
    setTimeout(() => { setPeekTarget(null); afterPower(); }, 4000);
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
        const wasMine = botKnowsCard(m, 0, swapMine);
        const wasTheirs = botKnowsCard(m, toPid, toSlot);
        if (wasMine) botRememberCard(m, toPid, toSlot, wasMine);
        else botForgetSlot(m, toPid, toSlot);
        if (wasTheirs) botRememberCard(m, 0, swapMine, wasTheirs);
        else botForgetSlot(m, 0, swapMine);
      }
      setAnimation(null);
      toast('Swap complete!');
      afterPower();
    }, 3200);
  }

  // ----- Discard claim -----
  function openDiscardClaim() {
    if (!drawnCard || phase === PHASES.OVER || phase === PHASES.PEEK) {
      toast('No card to claim against');
      return;
    }
    setDiscardingPlayer(0);
    // Don't change phase — just open overlay
  }

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
      showAchievement('win', '🎉 GREAT DISCARD!', msg);
      setDiscardingPlayer(null);
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
      showAchievement('fail', '💥 WRONG CARD', sub);
      setDiscardingPlayer(null);
    }
  }

  function botPerformDiscardClaim(bot, slotIdx) {
    const card = hands[bot.id][slotIdx];
    if (card.rank === drawnCard?.rank) {
      const oldHand = hands[bot.id];
      const newHands = { ...hands };
      newHands[bot.id] = oldHand.filter((_, idx) => idx !== slotIdx);
      setHands(newHands);
      setDiscard(d => [drawnCard, ...d]); // drawn card discards too
      updateBotMemoryOnDiscardSuccess(bot.id, slotIdx);
      AudioMgr.playSfx('discard-good');
      showAchievement('win', `🎉 ${bot.name} NAILED IT!`, `Discarded a ${card.rank}`);
      nextTurn();
    } else {
      const { drawn: penalty, deck: nd, discard: ndisc } = drawFromDeck(deck, discard, 2);
      const oldHand = hands[bot.id];
      const newHands = { ...hands };
      newHands[bot.id] = [...penalty.slice(0, 1), ...oldHand, ...penalty.slice(1, 2)];
      setHands(newHands);
      setDeck(nd);
      setDiscard(ndisc);
      updateBotMemoryOnPenaltyAdd(bot.id, oldHand, newHands[bot.id]);
      AudioMgr.playSfx('discard-bad');
      showAchievement('fail', `💥 ${bot.name} GOOFED`, 'Better luck next time! +2 cards');
      nextTurn();
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
              setCurrentPlayer(0);
              setNeedPass(true); // first turn also needs a pass screen
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
          setCurrentPlayer(0);
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
  const discardEnabled = !!drawnCard && !discardingPlayer;
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

      {/* Opponents row */}
      <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {otherPlayers.map(p => {
          const isActive = p.id === currentPlayer;
          const isPeekRevealedHere = peekActive && peekTarget.playerId === p.id;
          const selectableForPeek = phase === PHASES.POWER_PEEK_OTHER && !peekTarget && isMyTurn;
          const selectableForSwap = phase === PHASES.POWER_SWAP && swapMine != null && isMyTurn;
          const isSelectedSwap = swapTheirs && swapTheirs.playerId === p.id;
          return (
            <OpponentMini
              key={p.id}
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
          );
        })}
      </div>

      {/* Center area */}
      <div className="center-area">
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
              <Card card={drawnCard} faceUp size={{ w: 64, h: 90 }} />
            ) : (
              <div style={{ width: 64, height: 90, border: '2px dashed rgba(255,255,255,0.2)', borderRadius: 10 }} />
            )}
            <span className="deck-label">DRAWN</span>
          </div>

          <div className="discard-stack">
            {discard.length > 0 ? (
              <Card card={discard[0]} faceUp size={{ w: 56, h: 80 }} />
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
          isMyTurn={isMyTurn}
          swapMine={swapMine}
          swapTheirs={swapTheirs}
        />
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

        {/* Always-visible action bar */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
          <button
            className={"btn " + (buzzCanFire ? 'btn-primary pulse-gold' : 'btn-ghost')}
            disabled={!buzzCanFire}
            onClick={() => buzzCanFire && handleBuzzWinner(0)}
          >
            🔔 BUZZ
          </button>
          <button
            className={"btn " + (discardEnabled ? 'btn-danger' : 'btn-ghost')}
            disabled={!discardEnabled}
            onClick={openDiscardClaim}
          >
            🗑️ DISCARD
          </button>
          <button
            className={"btn " + (knockEnabled ? 'btn-success' : 'btn-ghost')}
            disabled={!knockEnabled}
            onClick={attemptKnock}
          >
            🤜 KNOCK
          </button>
        </div>

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
          onPick={performDiscardClaim}
          onCancel={() => setDiscardingPlayer(null)}
        />
      )}

      <ToastStack toasts={toasts} />
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

function PhaseIndicator({ phase, drawnCard, drawer, buzzSecondsLeft, powerSecondsLeft, isMyTurn, swapMine, swapTheirs }) {
  if (phase === PHASES.TURN_START) {
    return <div className="power-banner">{isMyTurn ? 'Your turn — tap deck to draw' : `${drawer.name} is thinking...`}</div>;
  }
  if (phase === PHASES.DRAWING) return <div className="power-banner">Drawing...</div>;
  if (phase === PHASES.BUZZ) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <CountdownRing secondsLeft={buzzSecondsLeft} total={4} size={60} />
        <div style={{ fontSize: 12, color: 'var(--gold)', letterSpacing: 1 }}>🔔 BUZZ to claim!</div>
      </div>
    );
  }
  if (phase === PHASES.POWER_PEEK_OWN) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <CountdownRing secondsLeft={powerSecondsLeft} total={7} size={60} />
        <div className="power-banner">{isMyTurn ? '7/8 — Tap your own card' : `${drawer.name} peeking own card`}</div>
      </div>
    );
  }
  if (phase === PHASES.POWER_PEEK_OTHER) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <CountdownRing secondsLeft={powerSecondsLeft} total={7} size={60} />
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
        <CountdownRing secondsLeft={powerSecondsLeft} total={7} size={60} />
        <div className="power-banner">{msg}</div>
      </div>
    );
  }
  if (phase === PHASES.BUZZ_RESOLVE) return <div className="power-banner">Resolving buzz...</div>;
  return null;
}

function MyHand({ hand, phase, peekTarget, swapMine, discardingPlayer, isMyTurn, onPeekOwnSlot, onSwapMineSlot, onDiscardSlot, animation, meId }) {
  return (
    <div className="hand-grid" style={{ gridTemplateColumns: `repeat(${Math.min(hand.length, 4)}, auto)` }}>
      {hand.map((c, i) => {
        const isMyPeek = phase === PHASES.POWER_PEEK_OWN && isMyTurn && !peekTarget;
        const isMySwap = phase === PHASES.POWER_SWAP && isMyTurn && swapMine == null;
        const isDiscardPick = discardingPlayer === meId;
        const selectable = isMyPeek || isMySwap || isDiscardPick;
        const isPowerTarget = isMyPeek || isMySwap;
        const selected = swapMine === i;
        const revealed = peekTarget && peekTarget.slot === i;
        const animating = animation && ((animation.kind === 'peek' && animation.playerId === meId) ? animation.slot === i : (animation.kind === 'swap' && animation.fromPid === meId) ? animation.fromSlot === i : (animation.kind === 'swap' && animation.toPid === meId) ? animation.toSlot === i : (animation.kind === 'buzz-swap' && animation.pid === meId) ? animation.slot === i : false);
        const onClick = isMyPeek ? () => onPeekOwnSlot(i)
                      : isMySwap ? () => onSwapMineSlot(i)
                      : isDiscardPick ? () => onDiscardSlot(i)
                      : undefined;
        return (
          <div
            key={c.id}
            className={"hand-slot " + (selectable ? 'selectable ' : '') + (selected ? 'selected ' : '') + (isPowerTarget ? 'power-target ' : '') + (animating ? 'glow-flash ' : '') + (revealed ? 'peek-flash ' : '')}
            onClick={onClick}
          >
            <Card card={revealed ? c : null} faceUp={revealed} size={{ w: 64, h: 90 }} positionLabel={positionLabelFor(i, hand.length)} />
          </div>
        );
      })}
    </div>
  );
}

function OpponentMini({ player, hand, isActive, revealedSlot, selectable, selectedSlot, onSlotClick, animatingSlot }) {
  return (
    <div style={{
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
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 180 }}>
        {hand.map((c, i) => {
          const revealed = revealedSlot === i;
          const isSelected = selectedSlot === i;
          const animating = animatingSlot === i;
          return (
            <div
              key={c.id}
              className={"hand-slot " + (selectable ? 'selectable ' : '') + (isSelected ? 'selected ' : '') + (selectable ? 'power-target ' : '') + (animating ? 'glow-flash ' : '') + (revealed ? 'peek-flash ' : '')}
              onClick={selectable ? () => onSlotClick(i) : undefined}
              style={{ cursor: selectable ? 'pointer' : 'default' }}
            >
              <Card card={revealed ? c : null} faceUp={revealed} size={{ w: 52, h: 72 }} positionLabel={positionLabelFor(i, hand.length)} />
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

function DiscardSelectOverlay({ player, hand, drawnCard, onPick, onCancel }) {
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
          Tap one or more cards. <b style={{ color: 'var(--gold)' }}>All</b> must match.<br/>
          <span style={{ color: '#ff9999' }}>Any wrong → +2 penalty, no cards removed.</span>
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

Object.assign(window, { GameTable });
