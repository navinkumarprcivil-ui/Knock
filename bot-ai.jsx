/*!
 * Kuboos — KNOCK card game
 * Copyright (c) 2026 Kuboos. All rights reserved.
 * Licensed for use only at https://knockgame.netlify.app
 *
 * Unauthorized reproduction, distribution, modification, or
 * deployment to other domains is prohibited.
 */

/* KNOCK — Bot AI
   Two skill levels: 'easy' and 'hard'
   Each bot maintains its own memory of cards it has seen (its own + peeks + swaps witnessed)
*/

function makeBotMemory(playerId, hands) {
  // Bot starts knowing its own bottom 2 cards (the peek phase)
  const known = {}; // { "playerId-slot": card }
  if (hands[playerId]) {
    const h = hands[playerId];
    if (h[2]) known[`${playerId}-2`] = h[2];
    if (h[3]) known[`${playerId}-3`] = h[3];
  }
  return known;
}

function botKnowsCard(memory, playerId, slot) {
  return memory[`${playerId}-${slot}`] || null;
}

function botRememberCard(memory, playerId, slot, card) {
  memory[`${playerId}-${slot}`] = card;
}

function botForgetSlot(memory, playerId, slot) {
  delete memory[`${playerId}-${slot}`];
}

// When a card is removed from a hand, shift memory for higher slots down
function botShiftAfterRemove(memory, playerId, removedSlot) {
  // Build new memory for this player
  const newMem = {};
  for (const key of Object.keys(memory)) {
    const [pid, slot] = key.split('-').map(Number);
    if (pid !== playerId) { newMem[key] = memory[key]; continue; }
    if (slot < removedSlot) newMem[key] = memory[key];
    else if (slot > removedSlot) newMem[`${playerId}-${slot - 1}`] = memory[key];
    // slot === removedSlot: drop
  }
  // Mutate
  for (const k of Object.keys(memory)) delete memory[k];
  Object.assign(memory, newMem);
}

// ---- Decisions ----

// Should bot buzz? Returns delay in ms (or null = won't buzz)
// Hard bot: buzzes fast if it knows it has a matching rank
// Easy bot: random small chance, slow
function botBuzzDecision(bot, drawnCard, hands, memory) {
  const myHand = hands[bot.id];
  if (myHand.length === 0) return null;
  const matches = [];
  for (let i = 0; i < myHand.length; i++) {
    const known = botKnowsCard(memory, bot.id, i);
    if (known && known.rank === drawnCard.rank) matches.push(i);
  }
  if (bot.skill === 'hard') {
    // Hard: high reaction speed if knows match exists, otherwise won't buzz
    // Also will buzz to swap a high-value card for a lower drawn card
    if (matches.length > 0) {
      // Will discard via DISCARD claim instead of buzzing — handled separately
      // Buzz only to swap: swap if drawn value < max known value in hand
    }
    let maxKnownVal = -1, maxSlot = -1;
    for (let i = 0; i < myHand.length; i++) {
      const k = botKnowsCard(memory, bot.id, i);
      if (k && k.value > maxKnownVal) { maxKnownVal = k.value; maxSlot = i; }
    }
    if (drawnCard.value < maxKnownVal - 2 && maxSlot >= 0) {
      return 700 + Math.random() * 600; // fast buzz
    }
    // Or swap an unknown card if drawn is very low
    if (drawnCard.value <= 2) {
      // probably better than an unknown; reasonable chance
      if (Math.random() < 0.5) return 1100 + Math.random() * 800;
    }
    return null;
  } else {
    // Easy: occasionally buzzes if drawn is low
    if (drawnCard.value <= 4 && Math.random() < 0.35) return 1500 + Math.random() * 1400;
    if (drawnCard.value <= 7 && Math.random() < 0.15) return 2000 + Math.random() * 1500;
    return null;
  }
}

// Once bot buzzes, which slot does it swap?
function botBuzzPickSlot(bot, drawnCard, hands, memory) {
  const myHand = hands[bot.id];
  // Pick highest known value > drawn, else random unknown
  let bestSlot = -1, bestVal = drawnCard.value;
  for (let i = 0; i < myHand.length; i++) {
    const k = botKnowsCard(memory, bot.id, i);
    if (k && k.value > bestVal) { bestVal = k.value; bestSlot = i; }
  }
  if (bestSlot >= 0) return bestSlot;
  // pick an unknown
  const unknowns = [];
  for (let i = 0; i < myHand.length; i++) if (!botKnowsCard(memory, bot.id, i)) unknowns.push(i);
  if (unknowns.length > 0) return unknowns[Math.floor(Math.random() * unknowns.length)];
  return Math.floor(Math.random() * myHand.length);
}

// Should bot try a DISCARD claim? Returns delay or null
function botDiscardDecision(bot, drawnCard, hands, memory) {
  const myHand = hands[bot.id];
  for (let i = 0; i < myHand.length; i++) {
    const k = botKnowsCard(memory, bot.id, i);
    if (k && k.rank === drawnCard.rank) {
      // Hard bot: 95% sure → discards. Easy: 60% sure
      const conf = bot.skill === 'hard' ? 0.95 : 0.6;
      if (Math.random() < conf) {
        return { delay: 600 + Math.random() * 800, slot: i };
      }
    }
  }
  // Easy bot occasionally guesses wrong (rare)
  if (bot.skill === 'easy' && Math.random() < 0.05 && myHand.length > 0) {
    return { delay: 2200 + Math.random() * 1500, slot: Math.floor(Math.random() * myHand.length) };
  }
  return null;
}

// On bot's own turn: should it knock?
function botShouldKnock(bot, hands, memory) {
  const myHand = hands[bot.id];
  if (myHand.length > 2) return false;
  // Estimate my sum
  let mySum = 0, unknownCount = 0;
  for (let i = 0; i < myHand.length; i++) {
    const k = botKnowsCard(memory, bot.id, i);
    if (k) mySum += k.value;
    else { unknownCount++; mySum += 6; } // assume ~average for unknown
  }
  // Estimate others' sums (very rough — assume they have 4 cards averaging ~6 each = 24)
  const others = Object.keys(hands).filter(k => Number(k) !== bot.id);
  let confident = true;
  for (const oid of others) {
    const oh = hands[oid];
    if (!oh) continue;
    let oSum = 0;
    for (let i = 0; i < oh.length; i++) {
      const k = botKnowsCard(memory, Number(oid), i);
      oSum += k ? k.value : 6;
    }
    if (oSum <= mySum + 3) confident = false;
  }
  if (bot.skill === 'hard') {
    return confident && unknownCount === 0;
  } else {
    return confident && Math.random() < 0.5;
  }
}

// On bot's turn: pick power target
function botPickPowerOwn(bot, hands, memory) {
  // Peek own: pick the slot we don't know yet
  const myHand = hands[bot.id];
  for (let i = 0; i < myHand.length; i++) {
    if (!botKnowsCard(memory, bot.id, i)) return i;
  }
  return 0;
}

function botPickPowerOther(bot, hands, memory) {
  // Pick an opponent + a slot we don't know
  const others = Object.keys(hands).filter(k => Number(k) !== bot.id);
  for (const oidStr of others) {
    const oid = Number(oidStr);
    const oh = hands[oid];
    for (let i = 0; i < oh.length; i++) {
      if (!botKnowsCard(memory, oid, i)) return { playerId: oid, slot: i };
    }
  }
  // fallback
  const oid = Number(others[0]);
  return { playerId: oid, slot: 0 };
}

function botPickSwap(bot, hands, memory) {
  // Give away highest known, take an unknown opponent card
  const myHand = hands[bot.id];
  let mySlot = -1, myVal = -1;
  for (let i = 0; i < myHand.length; i++) {
    const k = botKnowsCard(memory, bot.id, i);
    if (k && k.value > myVal) { myVal = k.value; mySlot = i; }
  }
  if (mySlot < 0) {
    // Don't know any — pick top
    mySlot = 0;
  }
  const others = Object.keys(hands).filter(k => Number(k) !== bot.id);
  let target = { playerId: Number(others[0]), slot: 0 };
  // Prefer known low-value opponent cards
  let bestVal = 99;
  for (const oidStr of others) {
    const oid = Number(oidStr);
    const oh = hands[oid];
    for (let i = 0; i < oh.length; i++) {
      const k = botKnowsCard(memory, oid, i);
      if (k && k.value < bestVal) { bestVal = k.value; target = { playerId: oid, slot: i }; }
    }
  }
  // If no known low one, pick random unknown
  if (bestVal === 99) {
    const oidStr = others[Math.floor(Math.random() * others.length)];
    const oid = Number(oidStr);
    target = { playerId: oid, slot: Math.floor(Math.random() * hands[oid].length) };
  }
  return { mySlot, theirs: target };
}

Object.assign(window, {
  makeBotMemory, botKnowsCard, botRememberCard, botForgetSlot, botShiftAfterRemove,
  botBuzzDecision, botBuzzPickSlot, botDiscardDecision,
  botShouldKnock, botPickPowerOwn, botPickPowerOther, botPickSwap
});
