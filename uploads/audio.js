/* KNOCK — Audio: Web Audio synth (no asset files needed) */

const AudioMgr = {
  ctx: null,
  musicGain: null,
  sfxGain: null,
  musicOn: true,
  sfxOn: true,
  musicLoop: null,
  musicTimer: null,

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

    // Restore prefs
    try {
      const m = localStorage.getItem('knock-music');
      const s = localStorage.getItem('knock-sfx');
      if (m === 'off') this.musicOn = false;
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

  startMusic() {
    if (!this.ctx || !this.musicOn) return;
    this.stopMusic();
    // Simple lounge-y arpeggio loop
    const notes = [220, 261.63, 329.63, 392, 329.63, 261.63]; // A3 minor arpeggio
    let i = 0;
    const playNote = () => {
      if (!this.musicOn || !this.ctx) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[i % notes.length];
      g.gain.setValueAtTime(0, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.7, this.ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.65);
      i++;
    };
    playNote();
    this.musicTimer = setInterval(playNote, 700);
  },

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
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
