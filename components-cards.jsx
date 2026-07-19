/*!
 * Kuboos — KNOCK card game
 * Copyright (c) 2026 Kuboos. All rights reserved.
 * Licensed for use only at https://knockgame.netlify.app
 *
 * Unauthorized reproduction, distribution, modification, or
 * deployment to other domains is prohibited.
 */

/* KNOCK — Card UI components */

const PLAYER_COLORS = [
  '#e63946', '#2563eb', '#16a34a', '#fbbf24', '#a855f7', '#ec4899'
];

function rankLabel(rank) { return rank; }

function PowerLabel({ power }) {
  if (power === 'none') return null;
  const txt = power === 'peek-own' ? 'PEEK SELF' : power === 'peek-other' ? 'PEEK OTHER' : 'SWAP';
  return <span className="card-power-badge">{txt}</span>;
}

function CardFace({ card, size }) {
  const cw = size?.w || 76;
  const ch = size?.h || 108;
  const colorClass = isRed(card.suit) ? 'suit-red' : 'suit-black';
  return (
    <div className="card-face" style={{ '--cw': cw + 'px', '--ch': ch + 'px' }}>
      <div className={"card-corner tl " + colorClass}>
        <span className="card-rank">{rankLabel(card.rank)}</span>
        <span className="card-suit-sm">{card.suit}</span>
      </div>
      <div className={"card-center " + colorClass}>{card.suit}</div>
      <div className={"card-corner br " + colorClass}>
        <span className="card-rank">{rankLabel(card.rank)}</span>
        <span className="card-suit-sm">{card.suit}</span>
      </div>
      <PowerLabel power={card.power} />
    </div>
  );
}

function CardBack({ size, positionLabel }) {
  const cw = size?.w || 76;
  // Position numbers removed — they were hard to read/track during swaps.
  const showPos = false;
  return (
    <div className="card-back" style={{ '--cw': cw + 'px' }}>
      <div className="card-back-emblem">
        <span className="card-back-emblem-text">K</span>
      </div>
      {showPos && <span className="card-back-position">{positionLabel}</span>}
    </div>
  );
}

function Card({ card, faceUp, size, lifted, className = '', onClick, style, positionLabel }) {
  const cw = size?.w || 76;
  const ch = size?.h || 108;
  const showFace = faceUp && card;
  // Both faces stay mounted so toggling `flipped` plays a real 3D flip
  // (backface-visibility hides whichever side points away).
  return (
    <div
      className={"card " + (showFace ? 'flipped ' : '') + (lifted ? 'lifted ' : '') + className}
      style={{ '--cw': cw + 'px', '--ch': ch + 'px', ...(style || {}) }}
      onClick={onClick}
    >
      <CardBack size={size} positionLabel={positionLabel} />
      {card && <CardFace card={card} size={size} />}
    </div>
  );
}

// Standard position labels for a 4-card hand: TOP-L, TOP-R, BASE 1, BASE 2
// For larger hands (after penalty), show numeric positions
function positionLabelFor(slot, handLen) {
  if (handLen === 4) {
    return ['TOP-L', 'TOP-R', 'BASE 1', 'BASE 2'][slot];
  }
  return `#${slot + 1}`;
}

// Visual left→right ordering of slot indices so the 2 BASE cards sit in the centre.
// 4-card hand slots: 0=TOP-L 1=TOP-R 2=BASE1 3=BASE2  →  display [TOP-L, BASE1, BASE2, TOP-R]
function handDisplayOrder(handLen) {
  if (handLen === 4) return [0, 2, 3, 1];
  if (handLen === 2) return [0, 1];
  // For penalty-grown hands, keep natural order
  return Array.from({ length: handLen }, (_, i) => i);
}

function HiddenCard({ size, label, onClick, selectable, selected, dim, faceUpCard, lifted }) {
  return (
    <div
      className={"hand-slot " + (selectable ? 'selectable ' : '') + (selected ? 'selected ' : '') + (dim ? 'dim' : '')}
      onClick={onClick}
    >
      {label && <span className="hand-label">{label}</span>}
      <Card card={faceUpCard} faceUp={!!faceUpCard} size={size} lifted={lifted} />
    </div>
  );
}

function PlayerAvatar({ index, size = 36, showInitial = true, name }) {
  const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
  const initial = name ? name.trim().charAt(0).toUpperCase() : 'P';
  return (
    <div className="player-avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.45 }}>
      {showInitial ? initial : (index + 1)}
    </div>
  );
}

Object.assign(window, { Card, CardFace, CardBack, HiddenCard, PlayerAvatar, PLAYER_COLORS, PowerLabel, positionLabelFor, handDisplayOrder });
