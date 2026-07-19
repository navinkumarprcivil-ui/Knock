/* KNOCK — Voice cues (Web Speech API) */

const Voice = {
  enabled: true,
  voice: null,
  lastSpokenAt: 0,
  minInterval: 600,
  cooldowns: {},

  init() {
    try {
      const m = localStorage.getItem('knock-voice');
      if (m === 'off') this.enabled = false;
    } catch (e) {}
  },
  set(on) {
    this.enabled = on;
    try { localStorage.setItem('knock-voice', on ? 'on' : 'off'); } catch (e) {}
    if (!on && window.speechSynthesis) window.speechSynthesis.cancel();
  },
  // Speak a phrase; throttles to avoid overlap
  say(phrase, opts = {}) {
    if (!this.enabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    const now = Date.now();
    const key = opts.key || phrase;
    const cooldownMs = opts.cooldown ?? 4000;
    if (this.cooldowns[key] && now - this.cooldowns[key] < cooldownMs) return;
    if (now - this.lastSpokenAt < this.minInterval) return;
    this.cooldowns[key] = now;
    this.lastSpokenAt = now;
    try {
      // Don't queue up more than 1 utterance
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(phrase);
      u.rate = opts.rate ?? 1.0;
      u.pitch = opts.pitch ?? 1.1;
      u.volume = opts.volume ?? 0.85;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  },
};

window.Voice = Voice;
