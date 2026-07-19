/* KNOCK — pure game logic, no React */

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

// Card values (your spec): K=0, 2-6 normal, 7-10 numeric, J=11, Q=12, A=13
const CARD_VALUES = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,
  'J':11,'Q':12,'K':0,'A':13
};

// Power tiers: K & 2-6 = none; 7-8 = peek-own; 9-10 = peek-other; J,Q,A = swap
function powerOf(rank) {
  if (rank === '7' || rank === '8') return 'peek-own';
  if (rank === '9' || rank === '10') return 'peek-other';
  if (rank === 'J' || rank === 'Q' || rank === 'A') return 'swap';
  return 'none';
}

let _cardId = 0;
function makeDeck() {
  const cards = [];
  for (const s of SUITS) for (const r of RANKS) {
    cards.push({ id: ++_cardId, rank: r, suit: s, value: CARD_VALUES[r], power: powerOf(r) });
  }
  return shuffle(cards);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealInitialHands(deck, playerCount) {
  const hands = [];
  let d = deck.slice();
  for (let p = 0; p < playerCount; p++) {
    // 2x2 grid: positions 0,1 = top row; 2,3 = bottom (base) row
    hands.push(d.slice(0, 4));
    d = d.slice(4);
  }
  return { hands, deck: d };
}

function handSum(hand) {
  return hand.reduce((s, c) => s + c.value, 0);
}

function isRed(suit) { return suit === '♥' || suit === '♦'; }

// expose
Object.assign(window, {
  SUITS, RANKS, CARD_VALUES, powerOf, makeDeck, shuffle,
  dealInitialHands, handSum, isRed
});
