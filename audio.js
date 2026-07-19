/*!
 * Kuboos — KNOCK card game
 * Copyright (c) 2026 Kuboos. All rights reserved.
 * Licensed for use only at https://knockgame.netlify.app
 *
 * Unauthorized reproduction, distribution, modification, or
 * deployment to other domains is prohibited.
 */

/* KNOCK — Audio: Web Audio synth (no asset files needed) */

const AudioMgr = {
  ctx: null,
  musicGain: null,
  sfxGain: null,
  musicOn: false,
  sfxOn: true,
  musicLoop: null,
  musicTimer: null,
  musicNodes: [],
  melodyStep: 0,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.08;
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.25;
      this.sfxGain.connect(this.ctx.destination);
    } catch (e) { /* no audio */ }

    // Restore prefs (music is OFF by default — only an explicit 'on' enables it)
    try {
      const m = localStorage.getItem('knock-music');
      const s = localStorage.getItem('knock-sfx');
      if (m === 'on') this.musicOn = true;
      if (s === 'off') this.sfxOn = false;
    } catch (e) {}
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setMusic(on) {
    this.musicOn = on;
    try { localStorage.setItem('knock-music', on ? 'on' : 'off'); } catch (e) {}
    if (on) this.startMusic();
    else this.stopMusic();
  },
  setSfx(on) {
    this.sfxOn = on;
    try { localStorage.setItem('knock-sfx', on ? 'on' : 'off'); } catch (e) {}
  },

  // Candidate song files (drop a real Harris Jayaraj track in /music with one of these names)
  songFiles: ['music/bgm.mp3', 'music/song.mp3', 'music/harris.mp3', 'bgm.mp3'],
  songEl: null,
  songFailed: false,

  // Try to play a real uploaded song. Returns true if it started/will start.
  tryPlaySong() {
    if (this.songFailed) return false;
    if (this.songEl) { this.songEl.play().catch(() => {}); return true; }
    const el = new Audio();
    el.loop = true;
    el.volume = 0.45;
    el.preload = 'auto';
    let idx = 0;
    const tryNext = () => {
      if (idx >= this.songFiles.length) { this.songFailed = true; this.songEl = null; this.startSynth(); return; }
      el.src = this.songFiles[idx++];
      el.play().catch(() => {});
    };
    el.addEventListener('error', tryNext);
    el.addEventListener('canplay', () => { if (this.musicOn) el.play().catch(() => {}); }, { once: true });
    this.songEl = el;
    tryNext();
    return true;
  },

  startMusic() {
    if (!this.musicOn) return;
    // Prefer a real uploaded song; fall back to the synth melody if none is present.
    if (!this.songFailed) { this.tryPlaySong(); return; }
    this.startSynth();
  },

  startSynth() {
    if (!this.ctx || !this.musicOn) return;
    this.stopMusic();
    const ctx = this.ctx;
    this.padNodes = [];

    // ---- Harris-Jayaraj-style film melody: lush chord pads + shimmer arp + singable lead ----
    // Romantic progression vi–IV–I–V (Am – F – C – G), looping every 4 bars.
    const prog = [
      { pad: [220.00, 261.63, 329.63] }, // Am
      { pad: [174.61, 220.00, 261.63] }, // F
      { pad: [261.63, 329.63, 392.00] }, // C
      { pad: [196.00, 246.94, 293.66] }, // G
    ];
    // Flowing lead line (one note per quarter, 4 per bar) — major, lyrical
    const lead = [
      440.00, 523.25, 493.88, 440.00,   // over Am
      440.00, 392.00, 349.23, 392.00,   // over F
      329.63, 392.00, 523.25, 493.88,   // over C
      587.33, 493.88, 392.00, 440.00,   // over G
    ];
    const eighth = 270; // ms per eighth note (~111 BPM, gentle)
    let step = 0;       // 0..31 across the 4-bar loop

    const playPad = (freqs) => {
      const t = ctx.currentTime;
      // stop previous bar's pad
      (this.padNodes || []).forEach(n => { try { n.stop(t + 0.4); } catch (e) {} });
      this.padNodes = [];
      freqs.forEach(f => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        osc.detune.value = (Math.random() * 8 - 4);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.4);
        g.gain.setValueAtTime(0.16, t + 1.6);
        g.gain.exponentialRampToValueAtTime(0.001, t + 2.3);
        osc.connect(g); g.connect(this.musicGain);
        osc.start(t); osc.stop(t + 2.4);
        this.padNodes.push(osc);
      });
    };

    const pluck = (freq, amp, type, dur) => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g); g.connect(this.musicGain);
      osc.start(t); osc.stop(t + dur + 0.05);
    };

    const tickStep = () => {
      if (!this.musicOn || !this.ctx) return;
      const bar = Math.floor(step / 8) % prog.length;
      const beat = step % 8;
      const chord = prog[bar];
      if (beat === 0) playPad(chord.pad);
      // shimmer arpeggio: chord tones an octave up, every eighth
      const arpFreq = chord.pad[[0, 1, 2, 1, 0, 2, 1, 0][beat]] * 2;
      pluck(arpFreq, 0.07, 'sine', 0.28);
      // lead melody on the quarter notes (even beats)
      if (beat % 2 === 0) {
        const li = (bar * 4 + beat / 2) % lead.length;
        pluck(lead[li], 0.22, 'triangle', 0.9);
        pluck(lead[li] * 2, 0.05, 'sine', 0.6); // soft octave sparkle
      }
      step = (step + 1) % 32;
      this.musicTimer = setTimeout(tickStep, eighth);
    };
    tickStep();
  },

  stopMusic() {
    if (this.songEl) { try { this.songEl.pause(); } catch (e) {} }
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
    const now = this.ctx ? this.ctx.currentTime : 0;
    (this.padNodes || []).forEach(n => { try { n.stop(now + 0.2); } catch (e) {} });
    this.padNodes = [];
    if (this.musicNodes && this.musicNodes.length) {
      this.musicNodes.forEach(n => { try { n.stop(); } catch (e) {} });
      this.musicNodes = [];
    }
  },

  playSfx(name) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const sfx = (freq, dur = 0.1, type = 'sine') => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + dur);
    };
    if (name === 'click') sfx(800, 0.05, 'square');
    else if (name === 'flip') { sfx(440, 0.08); sfx(660, 0.08, 'triangle'); }
    else if (name === 'buzz') { sfx(1000, 0.12, 'sawtooth'); setTimeout(() => sfx(1300, 0.1, 'sawtooth'), 80); }
    else if (name === 'discard-good') { sfx(523, 0.1); setTimeout(() => sfx(784, 0.15), 100); setTimeout(() => sfx(1047, 0.2), 220); }
    else if (name === 'discard-bad') { sfx(220, 0.15, 'sawtooth'); setTimeout(() => sfx(160, 0.2, 'sawtooth'), 150); }
    else if (name === 'swap') { sfx(659, 0.1); setTimeout(() => sfx(523, 0.12), 100); }
    else if (name === 'peek') sfx(880, 0.15, 'triangle');
    else if (name === 'knock') { sfx(330, 0.1, 'square'); setTimeout(() => sfx(330, 0.1, 'square'), 130); setTimeout(() => sfx(330, 0.15, 'square'), 260); }
    else if (name === 'win') { [523, 659, 784, 1047].forEach((f, idx) => setTimeout(() => sfx(f, 0.18, 'triangle'), idx * 120)); }
  }
};

window.AudioMgr = AudioMgr;
