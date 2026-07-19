/* KNOCK — Buzz race, Discard select, Power flows, Knock confirm */

function BuzzRace({ players, drawerId, drawnCard, onWinner, onTimeout, durationMs = 4000 }) {
  const [remaining, setRemaining] = React.useState(Math.ceil(durationMs / 1000));
  const [winner, setWinner] = React.useState(null);

  React.useEffect(() => {
    if (winner !== null) return;
    if (remaining <= 0) { onTimeout(); return; }
    const t = setTimeout(() => setRemaining(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, winner]);

  const buzzers = players.filter(p => p.id !== drawerId);
  const cols = buzzers.length <= 1 ? 'cols-1' : '';

  const handleBuzz = (pid) => {
    if (winner !== null) return;
    setWinner(pid);
    setTimeout(() => onWinner(pid), 350);
  };

  return (
    <div className="buzz-overlay">
      <div className="buzz-title">🔔 BUZZ! Match this card?</div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <Card card={drawnCard} faceUp size={{ w: 64, h: 90 }} />
        <div className="buzz-countdown">{remaining}</div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, opacity: 0.8 }}>
        First to tap takes the card and swaps with their own.
      </div>
      <div className={"buzz-grid " + cols}>
        {buzzers.map(p => {
          const won = winner === p.id;
          const lost = winner !== null && winner !== p.id;
          return (
            <button
              key={p.id}
              className={"buzz-btn " + (won ? 'pulse-gold' : '')}
              style={{
                background: lost ? '#444' : `linear-gradient(180deg, ${PLAYER_COLORS[p.id]} 0%, ${PLAYER_COLORS[p.id]}dd 100%)`,
                opacity: lost ? 0.4 : 1,
                outline: won ? '4px solid var(--gold)' : 'none'
              }}
              onClick={() => handleBuzz(p.id)}
              disabled={winner !== null}
            >
              <span className="icon">🔔</span>
              {p.name}
              <span className="small">TAP TO BUZZ</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, danger, gold }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-title">{title}</div>
        <div className="modal-body">{body}</div>
        <div className="modal-actions">
          {onCancel && <button className="btn btn-ghost" onClick={onCancel}>{cancelLabel}</button>}
          <button className={"btn " + (danger ? 'btn-danger' : gold ? 'btn-gold' : 'btn-primary')} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BuzzRace, ConfirmModal });
