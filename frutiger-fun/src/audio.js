// Synthesised sound: a soft major-7th pad with glassy bell arpeggios, and
// bubbly UI blips. Nothing to download.

const CHORDS = [
  [53, 57, 60, 64], // Fmaj7
  [55, 59, 62, 64], // G6
  [52, 55, 59, 62], // Em7
  [57, 60, 64, 67], // Am7
];
const BELLS = [72, 74, 76, 79, 81, 84, 86, 88];
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export class AeroAudio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.bar = 0;
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.applyVolumes();
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    verb.connect(wet).connect(this.master);
    this.music.connect(this.master);
    this.music.connect(verb);
    this.sfx.connect(this.master);
    this.sfx.connect(verb);
    this.nextBar = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 200);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.music.gain.value = 0.22 * this.settings.music;
    this.sfx.gain.value = 0.4 * this.settings.sfx;
  }

  impulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    return buf;
  }

  schedule() {
    const ctx = this.ctx;
    while (this.nextBar < ctx.currentTime + 1) {
      const chord = CHORDS[this.bar % CHORDS.length];
      const t = this.nextBar, dur = 4;
      for (const n of chord) this.pad(midi(n), t, dur + 1.5);
      this.pad(midi(chord[0] - 12), t, dur + 1.5, 0.6);
      for (let i = 0; i < 8; i++) {
        if (Math.random() < 0.45) continue;
        const note = BELLS[Math.floor(Math.random() * BELLS.length)];
        this.bell(midi(note), t + i * 0.5 + (Math.random() < 0.3 ? 0.25 : 0), 0.05 + Math.random() * 0.04);
      }
      this.nextBar += dur;
      this.bar++;
    }
  }

  pad(freq, t, dur, level = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 * level, t + 1.4);
    g.gain.setValueAtTime(0.06 * level, t + dur - 2);
    g.gain.linearRampToValueAtTime(0, t + dur);
    for (const [type, detune] of [['sine', 0], ['triangle', 7], ['triangle', -7]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    f.connect(g).connect(this.music);
  }

  bell(freq, t, level, out = this.music) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    for (const [mul, lv] of [[1, 1], [2.76, 0.3], [5.4, 0.12]]) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      og.gain.value = lv;
      o.frequency.value = freq * mul;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 1.7);
    }
    g.connect(out);
  }

  blip(f0, f1, dur = 0.09, level = 0.25) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  hover() { this.blip(1500, 1900, 0.04, 0.08); }
  click() {
    if (!this.ctx) return;
    this.bell(midi(84), this.ctx.currentTime, 0.12, this.sfx);
    this.bell(midi(91), this.ctx.currentTime + 0.07, 0.09, this.sfx);
  }
  pop() { this.blip(500 + Math.random() * 200, 1700 + Math.random() * 500, 0.07, 0.3); }
  jump() { this.blip(380, 760, 0.12, 0.12); }
  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.impulse(1.2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.9);
    const g = ctx.createGain();
    g.gain.value = 0.35;
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
    [72, 76, 79, 84].forEach((n, i) => this.bell(midi(n), t + 0.12 + i * 0.09, 0.1, this.sfx));
  }
}
