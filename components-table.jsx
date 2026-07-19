/*!
 * Kuboos — KNOCK card game
 * Copyright (c) 2026 Kuboos. All rights reserved.
 * Licensed for use only at https://knockgame.netlify.app
 *
 * Unauthorized reproduction, distribution, modification, or
 * deployment to other domains is prohibited.
 */

/* KNOCK — Table screen: hand display + center deck/discard */

function HandDisplay({ hand, ownerIndex, isMe, selectableSlots, selectedSlot, onSlotClick, revealedIndices = [], dimUnselectable, size, label, compact }) {
  const cardSize = size || { w: compact ? 44 : 64, h: compact ? 62 : 90 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {label && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <PlayerAvatar index={ownerIndex} name={label} size={22} />
          <span style={{ fontWeight: 900 }}>{label}</span>
          <span style={{ opacity: 0.6 }}>· {hand.length}</span>
        </div>
      )}
      <div className="hand-grid" style={{ gridTemplateColumns: `repeat(${Math.min(hand.length, 2)}, auto)` }}>
        {hand.map((c, i) => {
          const selectable = selectableSlots && selectableSlots.includes(i);
          const selected = selectedSlot === i;
          const revealed = revealedIndices.includes(i);
          const dim = dimUnselectable && selectableSlots && !selectableSlots.includes(i);
          return (
            <div
              key={c.id}
              className={"hand-slot " + (selectable ? 'selectable ' : '') + (selected ? 'selected ' : '') + (dim ? 'dim ' : '')}
              onClick={selectable ? () => onSlotClick(i) : undefined}
            >
              {isMe && i >= 2 && hand.length === 4 && <span className="hand-label">Base {i - 1}</span>}
              <Card card={revealed ? c : null} faceUp={revealed} size={cardSize} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Toast({ msg }) { return <div className="toast">{msg}</div>; }

function ToastStack({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => <Toast key={t.id} msg={t.msg} />)}
    </div>
  );
}

Object.assign(window, { HandDisplay, ToastStack });
