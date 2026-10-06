/* Album data, procedural cover art and a small Web Audio synth engine.
   Every album, artist and lyric here is fictional; the music is synthesised live. */
(() => {
  'use strict';

  const ALBUMS = [
    { title: 'Kota Neon', artist: 'Arunika', genre: 'Synthwave', style: 'synthwave', art: 'sun',
      bpm: 100, root: 45, mode: 'minor', prog: [0, 5, 2, 6], colors: ['#ff2e88', '#2a0a55', '#ffb347'], ink: '#ffffff',
      lyrics: ['Lampu kota menyala tanpa nama', 'Kita berlari di antara bayang', 'Langit ungu menunggu pagi', 'Jangan lepaskan tanganku malam ini'] },
    { title: 'Hujan di Kaca', artist: 'Laras Senja', genre: 'Lo-fi', style: 'lofi', art: 'rain',
      bpm: 78, root: 41, mode: 'major', prog: [1, 4, 0, 5], colors: ['#7aa6c2', '#16222f', '#f4d6a0'], ink: '#ffffff',
      lyrics: ['Rintik jatuh mengetuk jendela', 'Kopi dingin, lagu yang sama', 'Kutulis namamu di embun kaca', 'Lalu hilang bersama senja'] },
    { title: 'Pagi Biru', artist: 'Tirta & Kawan', genre: 'House', style: 'house', art: 'circles',
      bpm: 122, root: 38, mode: 'minor', prog: [0, 6, 5, 4], colors: ['#2b6cff', '#081633', '#7df9ff'], ink: '#ffffff',
      lyrics: ['Matahari naik pelan-pelan', 'Jalanan masih setengah tidur', 'Langkah kita satu irama', 'Biru pagi, kita mulai lagi'] },
    { title: 'Gema Ruang', artist: 'Nawa', genre: 'Ambient', style: 'ambient', art: 'rings',
      bpm: 68, root: 40, mode: 'major', prog: [0, 3, 5, 4], colors: ['#c9b8ff', '#211b45', '#ffd1e8'], ink: '#ffffff',
      lyrics: ['Diam yang panjang di ruang kosong', 'Gema suaramu masih tinggal', 'Cahaya jatuh di lantai kayu', 'Aku belajar mendengar sunyi'] },
    { title: 'Lari Malam', artist: 'Rimba Raya', genre: 'Synthwave', style: 'synthwave', art: 'grid',
      bpm: 112, root: 36, mode: 'minor', prog: [0, 6, 5, 6], colors: ['#ff5f2e', '#140808', '#ffd23f'], ink: '#ffffff',
      lyrics: ['Mesin berdengung di jalan tol', 'Lampu merah tak lagi berarti', 'Angin malam menghapus ragu', 'Kita lari sampai pagi'] },
    { title: 'Kopi Tubruk', artist: 'Senandung Pagi', genre: 'Lo-fi', style: 'lofi', art: 'blob',
      bpm: 84, root: 46, mode: 'major', prog: [0, 5, 1, 4], colors: ['#c08552', '#2b1a12', '#f3e9dc'], ink: '#2b1a12',
      lyrics: ['Ampas kopi di dasar gelas', 'Cerita lama dari bapak', 'Teras rumah dan radio tua', 'Pagi sederhana, cukup bahagia'] },
    { title: 'Lautan Kaca', artist: 'Mira Sasmita', genre: 'Ambient', style: 'ambient', art: 'waves',
      bpm: 72, root: 37, mode: 'minor', prog: [0, 5, 3, 4], colors: ['#00c2a8', '#04232a', '#c6fff4'], ink: '#ffffff',
      lyrics: ['Ombak tenang memantul bulan', 'Kaki telanjang di pasir basah', 'Laut bening menyimpan rahasia', 'Biar arus membawa kita'] },
    { title: 'Disko Kampung', artist: 'Orkes Bulan', genre: 'House', style: 'house', art: 'stripes',
      bpm: 124, root: 43, mode: 'minor', prog: [0, 3, 6, 5], colors: ['#ff2e63', '#1a1a1a', '#ffe600'], ink: '#ffffff',
      lyrics: ['Lampu kelap-kelip di balai desa', 'Semua turun ke lantai dansa', 'Tak perlu pandai untuk bergoyang', 'Malam ini milik kita semua'] },
  ];

  /* ---------- helpers ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
  function degree(album, d) {
    const sc = SCALES[album.mode];
    const oct = Math.floor(d / 7);
    return album.root + sc[((d % 7) + 7) % 7] + 12 * oct;
  }
  function chordNotes(album, d, seventh) {
    const n = [degree(album, d), degree(album, d + 2), degree(album, d + 4)];
    if (seventh) n.push(degree(album, d + 6));
    return n;
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- cover art ---------- */
  function drawCover(album, index, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const [c1, c2, c3] = album.colors;
    const R = rng(index * 977 + 13);
    const S = size;

    const bg = g.createLinearGradient(0, 0, 0, S);
    bg.addColorStop(0, c2);
    bg.addColorStop(1, shade(c2, 0.35));
    g.fillStyle = bg;
    g.fillRect(0, 0, S, S);

    switch (album.art) {
      case 'sun': {
        const sky = g.createLinearGradient(0, 0, 0, S);
        sky.addColorStop(0, c2);
        sky.addColorStop(0.7, shade(c1, -0.35));
        g.fillStyle = sky;
        g.fillRect(0, 0, S, S);
        const cx = S / 2, cy = S * 0.48, r = S * 0.28;
        const sun = g.createLinearGradient(0, cy - r, 0, cy + r);
        sun.addColorStop(0, c3);
        sun.addColorStop(1, c1);
        g.fillStyle = sun;
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = shade(c1, -0.35);
        for (let i = 0; i < 6; i++) {
          const y = cy + i * r * 0.17;
          g.fillRect(cx - r, y, r * 2, 2 + i * 2.2 * (S / 512));
        }
        g.fillStyle = c2;
        g.fillRect(0, S * 0.68, S, S);
        g.strokeStyle = c1;
        g.lineWidth = 2 * (S / 512);
        for (let i = -10; i <= 10; i++) {
          g.beginPath(); g.moveTo(cx + i * S * 0.02, S * 0.68); g.lineTo(cx + i * S * 0.16, S); g.stroke();
        }
        for (let i = 0; i < 7; i++) {
          const y = S * 0.68 + Math.pow(i / 6, 1.8) * S * 0.32;
          g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
        }
        break;
      }
      case 'rain': {
        const glow = g.createRadialGradient(S * 0.7, S * 0.35, 0, S * 0.7, S * 0.35, S * 0.45);
        glow.addColorStop(0, c3);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, S, S);
        for (let i = 0; i < 160; i++) {
          g.strokeStyle = c1;
          g.globalAlpha = 0.15 + R() * 0.5;
          g.lineWidth = (0.5 + R() * 1.5) * (S / 512);
          const x = R() * S, y = R() * S, l = S * (0.04 + R() * 0.12);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - l * 0.08, y + l); g.stroke();
        }
        g.globalAlpha = 1;
        break;
      }
      case 'circles': {
        g.globalCompositeOperation = 'screen';
        const pts = [[0.38, 0.4, 0.3, c1], [0.62, 0.45, 0.26, c3], [0.5, 0.62, 0.22, shade(c1, 0.3)]];
        for (const [x, y, r, col] of pts) {
          const rg = g.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
          rg.addColorStop(0, col);
          rg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = rg;
          g.beginPath(); g.arc(x * S, y * S, r * S, 0, Math.PI * 2); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'rings': {
        for (let i = 14; i > 0; i--) {
          g.strokeStyle = i % 2 ? c1 : c3;
          g.globalAlpha = 0.2 + (14 - i) / 18;
          g.lineWidth = 3 * (S / 512);
          g.beginPath();
          g.arc(S * (0.5 + i * 0.006), S * (0.44 - i * 0.004), i * S * 0.028, 0, Math.PI * 2);
          g.stroke();
        }
        g.globalAlpha = 1;
        break;
      }
      case 'grid': {
        const sun = g.createRadialGradient(S * 0.5, S * 0.42, 0, S * 0.5, S * 0.42, S * 0.36);
        sun.addColorStop(0, c3);
        sun.addColorStop(0.55, c1);
        sun.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sun;
        g.fillRect(0, 0, S, S);
        g.strokeStyle = c1;
        g.lineWidth = 1.5 * (S / 512);
        for (let i = 0; i < 18; i++) {
          const y = S * 0.55 + Math.pow(i / 17, 2) * S * 0.45;
          g.globalAlpha = 0.3 + i / 26;
          g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
        }
        for (let i = -14; i <= 14; i++) {
          g.beginPath(); g.moveTo(S / 2 + i * S * 0.01, S * 0.55); g.lineTo(S / 2 + i * S * 0.12, S); g.stroke();
        }
        g.globalAlpha = 1;
        break;
      }
      case 'blob': {
        g.fillStyle = c3;
        g.fillRect(0, 0, S, S);
        g.fillStyle = c1;
        g.beginPath();
        const cx = S * 0.52, cy = S * 0.42;
        const pts = 9;
        for (let i = 0; i <= pts; i++) {
          const a = (i / pts) * Math.PI * 2;
          const r = S * (0.24 + 0.06 * Math.sin(a * 3 + 1) + 0.03 * Math.cos(a * 5));
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (i === 0) g.moveTo(x, y); else g.quadraticCurveTo(cx + Math.cos(a - 0.35) * r * 1.15, cy + Math.sin(a - 0.35) * r * 1.15, x, y);
        }
        g.fill();
        g.fillStyle = c2;
        g.beginPath(); g.arc(S * 0.68, S * 0.3, S * 0.07, 0, Math.PI * 2); g.fill();
        break;
      }
      case 'waves': {
        for (let i = 0; i < 22; i++) {
          g.strokeStyle = i % 3 ? c1 : c3;
          g.globalAlpha = 0.25 + i / 30;
          g.lineWidth = 2 * (S / 512);
          g.beginPath();
          for (let x = 0; x <= S; x += 4) {
            const y = S * 0.18 + i * S * 0.028 + Math.sin(x / S * 7 + i * 0.45) * S * 0.03 * (1 + i / 10);
            if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
        }
        g.globalAlpha = 1;
        break;
      }
      case 'stripes': {
        g.fillStyle = c3;
        g.fillRect(0, 0, S, S);
        g.save();
        g.translate(S / 2, S / 2);
        g.rotate(-Math.PI / 5);
        for (let i = -12; i < 12; i++) {
          g.fillStyle = i % 2 ? c1 : c2;
          g.fillRect(i * S * 0.09, -S, S * 0.045, S * 2);
        }
        g.restore();
        g.fillStyle = c2;
        g.beginPath(); g.arc(S * 0.5, S * 0.42, S * 0.2, 0, Math.PI * 2); g.fill();
        g.fillStyle = c3;
        g.beginPath(); g.arc(S * 0.5, S * 0.42, S * 0.03, 0, Math.PI * 2); g.fill();
        break;
      }
    }

    // title block
    const pad = S * 0.07;
    const shadeBand = g.createLinearGradient(0, S * 0.7, 0, S);
    shadeBand.addColorStop(0, 'rgba(0,0,0,0)');
    shadeBand.addColorStop(1, album.ink === '#ffffff' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)');
    g.fillStyle = shadeBand;
    g.fillRect(0, S * 0.7, S, S * 0.3);
    g.fillStyle = album.ink;
    g.textBaseline = 'alphabetic';
    g.font = `700 ${Math.round(S * 0.085)}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
    g.fillText(album.title, pad, S - pad - S * 0.06);
    g.globalAlpha = 0.8;
    g.font = `500 ${Math.round(S * 0.045)}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
    g.fillText(album.artist.toUpperCase(), pad, S - pad);
    g.globalAlpha = 1;
    return c;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r); gg = Math.round((t - gg) * p + gg); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (gg << 8) + b).toString(16).slice(1);
  }

  /* ---------- melody per album (deterministic, 8 bars of 16ths) ---------- */
  function buildMelody(album, index) {
    const R = rng(index * 31 + 7);
    const steps = new Array(128).fill(null);
    const density = { synthwave: 0, lofi: 0.32, house: 0.22, ambient: 0.4 }[album.style];
    const grid = album.style === 'ambient' ? 4 : 2;
    let last = 7;
    for (let s = 0; s < 128; s += grid) {
      if (R() > density) continue;
      const bar = Math.floor(s / 16);
      const ch = album.prog[Math.floor(bar / 2) % 4];
      const tones = [ch, ch + 2, ch + 4, ch + 7];
      let d = R() < 0.65 ? tones[Math.floor(R() * tones.length)] : last + (R() < 0.5 ? 1 : -1);
      d = Math.max(3, Math.min(13, d));
      last = d;
      steps[s] = degree(album, d) + 12;
    }
    return steps;
  }
  ALBUMS.forEach((a, i) => { a.melody = buildMelody(a, i); });

  /* ---------- engine ---------- */
  const INSTRUMENTS = ['drums', 'bass', 'chords', 'lead'];

  class Engine {
    constructor() {
      this.ctx = null;
      this.playing = false;
      this.albumIndex = 0;
      this.step = 0;
      this.queue = [];
      this.spatial = true;
      this.positions = {};
      this.listeners = new Set();
      this.volume = 0.8;
    }
    get album() { return ALBUMS[this.albumIndex]; }
    on(fn) { this.listeners.add(fn); }
    emit() { this.listeners.forEach((fn) => fn(this)); }

    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = this.ctx = new AC();

      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.78;
      this.master.connect(comp);
      comp.connect(this.analyser);
      this.analyser.connect(ctx.destination);

      // shared noise + reverb
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.noise = nb;
      const len = Math.floor(ctx.sampleRate * 2.6);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      const verb = ctx.createConvolver();
      verb.buffer = ir;
      this.verbSend = ctx.createGain();
      this.verbSend.gain.value = 0.32;
      this.verbSend.connect(verb);
      verb.connect(this.master);

      this.inst = {};
      for (const name of INSTRUMENTS) {
        const input = ctx.createGain();
        const panner = ctx.createPanner();
        panner.panningModel = this.spatial ? 'HRTF' : 'equalpower';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1.5;
        panner.rolloffFactor = 0.5;
        const meter = ctx.createAnalyser();
        meter.fftSize = 256;
        input.connect(panner);
        panner.connect(this.master);
        input.connect(meter);
        this.inst[name] = { input, panner, meter, buf: new Float32Array(256) };
      }
      // lead gets a dotted-eighth echo
      const delay = ctx.createDelay(2);
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      delay.connect(fb); fb.connect(delay);
      delay.connect(this.inst.lead.input);
      this.leadIn = ctx.createGain();
      this.leadIn.connect(this.inst.lead.input);
      this.leadIn.connect(delay);
      this.delay = delay;
      this.inst.chords.input.connect(this.verbSend);
      this.inst.lead.input.connect(this.verbSend);

      for (const name of INSTRUMENTS) this.applyPosition(name);
      this.timer = setInterval(() => this.tick(), 25);
    }

    /* positions are listener-relative metres: -z is in front, +x to the right */
    setPosition(name, x, z) {
      this.positions[name] = { x, z };
      if (this.ctx) this.applyPosition(name);
    }
    applyPosition(name) {
      const p = this.inst[name].panner;
      const pos = this.spatial ? (this.positions[name] || { x: 0, z: -2 }) : { x: 0, z: -2 };
      const t = this.ctx.currentTime;
      if (p.positionX) {
        p.positionX.setTargetAtTime(pos.x, t, 0.04);
        p.positionY.setTargetAtTime(0, t, 0.04);
        p.positionZ.setTargetAtTime(pos.z, t, 0.04);
      } else {
        p.setPosition(pos.x, 0, pos.z);
      }
    }
    setSpatial(on) {
      this.spatial = on;
      if (!this.ctx) return;
      for (const name of INSTRUMENTS) {
        this.inst[name].panner.panningModel = on ? 'HRTF' : 'equalpower';
        this.applyPosition(name);
      }
    }
    setVolume(v) {
      this.volume = v;
      if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    }

    play(index) {
      this.ensure();
      if (typeof index === 'number' && index !== this.albumIndex) {
        this.albumIndex = index;
        this.step = 0;
        this.queue = [];
      }
      if (!this.playing) {
        this.playing = true;
        this.nextTime = this.ctx.currentTime + 0.06;
      }
      this.delay.delayTime.setValueAtTime((60 / this.album.bpm) * 0.75, this.ctx.currentTime);
      this.emit();
    }
    pause() { this.playing = false; this.queue = []; this.emit(); }
    toggle(index) {
      if (this.playing && (index === undefined || index === this.albumIndex)) this.pause();
      else this.play(index);
    }
    load(index) {
      this.albumIndex = (index + ALBUMS.length) % ALBUMS.length;
      this.step = 0;
      this.queue = [];
      if (this.playing) { this.nextTime = this.ctx.currentTime + 0.06; this.play(); }
      this.emit();
    }

    get stepDur() { return 60 / this.album.bpm / 4; }
    get loopSeconds() { return this.stepDur * 128; }

    /* step currently sounding (for lyrics / progress) */
    currentStep() {
      if (!this.ctx || !this.playing) return this.step;
      const now = this.ctx.currentTime;
      while (this.queue.length > 1 && this.queue[1].time <= now) this.queue.shift();
      return this.queue.length ? this.queue[0].step : this.step;
    }

    level(name) {
      if (!this.ctx || !this.playing) return 0;
      const ins = this.inst[name];
      ins.meter.getFloatTimeDomainData(ins.buf);
      let sum = 0;
      for (let i = 0; i < ins.buf.length; i++) sum += ins.buf[i] * ins.buf[i];
      return Math.sqrt(sum / ins.buf.length);
    }

    tick() {
      if (!this.playing) return;
      const ahead = this.ctx.currentTime + 0.12;
      while (this.nextTime < ahead) {
        this.schedule(this.step, this.nextTime);
        this.queue.push({ step: this.step, time: this.nextTime });
        this.nextTime += this.stepDur;
        this.step = (this.step + 1) % 128;
      }
    }

    /* ---------- voices ---------- */
    tone(dest, o) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.value = o.freq;
      if (o.detune) osc.detune.value = o.detune;
      const g = ctx.createGain();
      const a = o.attack || 0.005, r = o.release || 0.08;
      const end = o.t + Math.max(o.dur, a);
      g.gain.setValueAtTime(0, o.t);
      g.gain.linearRampToValueAtTime(o.gain, o.t + a);
      g.gain.setValueAtTime(o.gain, end);
      g.gain.linearRampToValueAtTime(0, end + r);
      let node = osc;
      if (o.cutoff) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = o.cutoff;
        f.Q.value = o.q || 0.7;
        osc.connect(f);
        node = f;
      }
      node.connect(g);
      g.connect(dest);
      osc.start(o.t);
      osc.stop(end + r + 0.05);
    }
    kick(t, v = 1) {
      const ctx = this.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.95 * v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(g); g.connect(this.inst.drums.input);
      osc.start(t); osc.stop(t + 0.45);
    }
    noiseHit(t, type, freq, gain, decay) {
      const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noise;
      f.type = type; f.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + decay);
      src.connect(f); f.connect(g); g.connect(this.inst.drums.input);
      src.start(t, Math.random() * 0.5); src.stop(t + decay + 0.02);
    }
    snare(t, v = 1) {
      this.noiseHit(t, 'bandpass', 1900, 0.55 * v, 0.18);
      this.tone(this.inst.drums.input, { type: 'triangle', freq: 190, t, dur: 0.02, gain: 0.25 * v, release: 0.08 });
    }
    hat(t, v = 1, open = false) { this.noiseHit(t, 'highpass', 7500, 0.22 * v, open ? 0.22 : 0.045); }
    bass(t, m, dur, type = 'sawtooth', cutoff = 520) {
      this.tone(this.inst.bass.input, { type, freq: mtof(m), t, dur, gain: 0.34, cutoff, q: 3, release: 0.06 });
    }
    pad(t, notes, dur, o = {}) {
      for (const m of notes) {
        for (const det of [-7, 7]) {
          this.tone(this.inst.chords.input, {
            type: o.type || 'sawtooth', freq: mtof(m), detune: det, t, dur,
            gain: o.gain || 0.05, attack: o.attack || 0.06, release: o.release || 0.4, cutoff: o.cutoff || 1300,
          });
        }
      }
    }
    lead(t, m, dur, o = {}) {
      this.tone(this.leadIn, {
        type: o.type || 'triangle', freq: mtof(m), t, dur, gain: o.gain || 0.12,
        attack: o.attack || 0.01, release: o.release || 0.15, cutoff: o.cutoff,
      });
    }

    schedule(step, t) {
      const a = this.album, s = step % 16, bar = Math.floor(step / 16);
      const sd = this.stepDur;
      const ch = a.prog[Math.floor(bar / 2) % 4];
      const chord = chordNotes(a, ch, a.style === 'lofi' || a.style === 'ambient');
      const root = chord[0];
      const mel = a.melody[step];

      if (a.style === 'synthwave') {
        if (s === 0 || s === 8) this.kick(t);
        if (s === 4 || s === 12) this.snare(t);
        if (s % 2 === 0) this.hat(t, s % 4 ? 0.5 : 0.8);
        if (s % 2 === 0) this.bass(t, root - 12 + (s % 4 ? 12 : 0), sd * 1.6);
        if (s === 0 && bar % 2 === 0) this.pad(t, chord.map((n) => n + 12), sd * 31, { attack: 0.3, release: 0.6, cutoff: 1500 });
        const arp = [chord[0], chord[1], chord[2], chord[1]];
        this.lead(t, arp[step % 4] + 24, sd * 0.8, { type: 'square', gain: 0.045, cutoff: 2600 });
      } else if (a.style === 'lofi') {
        const swing = s % 4 === 2 ? sd * 0.3 : 0;
        if (s === 0 || s === 10) this.kick(t, 0.8);
        if (s === 4 || s === 12) this.snare(t, 0.55);
        if (s % 2 === 0) this.hat(t + swing, s % 4 ? 0.35 : 0.55);
        if (s === 0) this.bass(t, root - 12, sd * 6, 'triangle', 400);
        if (s === 10) this.bass(t, root - 5, sd * 4, 'triangle', 400);
        if (s === 0) this.pad(t, chord.map((n) => n + 12), sd * 14, { type: 'triangle', gain: 0.06, attack: 0.02, release: 0.5, cutoff: 1100 });
        if (mel) this.lead(t + swing, mel + 12, sd * 1.8, { type: 'sine', gain: 0.1, release: 0.3 });
      } else if (a.style === 'house') {
        if (s % 4 === 0) this.kick(t);
        if (s === 4 || s === 12) this.snare(t, 0.7);
        if (s % 4 === 2) this.hat(t, 0.6, true);
        else if (s % 2 === 1) this.hat(t, 0.3);
        if (s % 4 === 2) this.bass(t, root - 12, sd * 1.5, 'sawtooth', 700);
        if (s === 3 || s === 10) this.pad(t, chord.map((n) => n + 12), sd * 1.4, { attack: 0.005, release: 0.12, gain: 0.07, cutoff: 2200 });
        if (mel) this.lead(t, mel + 12, sd * 1.5, { type: 'triangle', gain: 0.09 });
      } else {
        if (s === 0 || s === 8) this.hat(t, 0.25);
        if (s === 0 && bar % 2 === 0) {
          this.bass(t, root - 12, sd * 31, 'sine', 300);
          this.pad(t, chord.map((n) => n + 12), sd * 31, { type: 'sawtooth', gain: 0.035, attack: 1.2, release: 1.6, cutoff: 900 });
        }
        if (mel) this.lead(t, mel + 12, sd * 3, { type: 'sine', gain: 0.11, attack: 0.005, release: 1.6 });
      }
    }
  }

  window.MusicData = { ALBUMS, INSTRUMENTS, drawCover, shade };
  window.MusicEngine = new Engine();
})();
