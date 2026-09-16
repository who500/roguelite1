/**
 * roguelite.js - Vampire Survivors Roguelite
 * - 16 видов оружия, 16 реликвий, 16 легендарных суперсинергий (эволюций)
 * - Ограничение забега: 8 слотов оружия и 8 слотов реликвий (статусбар 8x8)
 * - Жесткая привязка камеры 1:1 (устранено микро-двоение и дрожание пикселей)
 * - Адаптация под любой экран и мобильные устройства с сенсорным джойстиком
 * - Оптимизация пулов и частиц для стабильных 60 FPS
 * - Внутриигровой Гримуар (энциклопедия) с рецептами всех синергий и описаниями
 */

// ========================================================
// ЗВУКОВОЙ ДВИЖОК (SFX & PROCEDURAL BGM)
// ========================================================
const SFX = {
  ctx: null,
  masterComp: null,
  noiseBuffer: null,
  enabled: true,
  lastPlay: {},
  get muted() {
    return !this.enabled;
  },
  set muted(val) {
    this.enabled = !val;
  },
  gemPitch: 600,
  bgm: {
    timer: null,
    step: 0,
    droneOsc: null,
    droneGain: null
  },

  get dest() {
    if (!this.ctx) return null;
    return this.masterComp || this.ctx.destination;
  },

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && !this.masterComp) {
      try {
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-14, this.ctx.currentTime);
        comp.knee.setValueAtTime(20, this.ctx.currentTime);
        comp.ratio.setValueAtTime(8, this.ctx.currentTime);
        comp.attack.setValueAtTime(0.003, this.ctx.currentTime);
        comp.release.setValueAtTime(0.18, this.ctx.currentTime);
        comp.connect(this.ctx.destination);
        this.masterComp = comp;
      } catch (e) {
        console.warn('Compressor init fallback', e);
      }
    }
    this.createNoiseBuffer();
  },

  createNoiseBuffer() {
    if (this.noiseBuffer || !this.ctx) return;
    try {
      const sampleRate = this.ctx.sampleRate || 44100;
      const length = sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
      const output = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    } catch (e) {}
  },

  throttle(key, minIntervalMs) {
    const now = performance.now();
    if (this.lastPlay[key] && now - this.lastPlay[key] < minIntervalMs) return false;
    this.lastPlay[key] = now;
    return true;
  },

  ensure() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.enabled && !this.bgm.timer) {
      this.startBGM();
    }
  },

  startBGM() {
    if (!this.enabled || !this.ctx || this.bgm.timer) return;
    const now = this.ctx.currentTime;

    try {
      const drone = this.ctx.createOscillator();
      const droneFilter = this.ctx.createBiquadFilter();
      const droneGain = this.ctx.createGain();

      drone.type = 'sawtooth';
      drone.frequency.setValueAtTime(36.71, now); // D1

      droneFilter.type = 'lowpass';
      droneFilter.frequency.setValueAtTime(130, now);

      droneGain.gain.setValueAtTime(0.035, now);

      drone.connect(droneFilter);
      droneFilter.connect(droneGain);
      droneGain.connect(this.dest);
      drone.start(now);

      this.bgm.droneOsc = drone;
      this.bgm.droneGain = droneGain;
    } catch (e) {
      console.warn('Drone error', e);
    }

    const bassNotes = [73.42, 73.42, 87.31, 73.42, 98.00, 73.42, 65.41, 58.27];
    this.bgm.timer = setInterval(() => {
      if (!this.enabled || !this.ctx || this.ctx.state === 'suspended') return;
      const t = this.ctx.currentTime;
      const s = this.bgm.step % 8;

      const bOsc = this.ctx.createOscillator();
      const bFilter = this.ctx.createBiquadFilter();
      const bGain = this.ctx.createGain();

      bOsc.type = 'sawtooth';
      bOsc.frequency.setValueAtTime(bassNotes[s], t);

      bFilter.type = 'lowpass';
      bFilter.frequency.setValueAtTime(260, t);
      bFilter.frequency.exponentialRampToValueAtTime(90, t + 0.17);

      bGain.gain.setValueAtTime(0.05, t);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);

      bOsc.connect(bFilter);
      bFilter.connect(bGain);
      bGain.connect(this.dest);
      bOsc.start(t);
      bOsc.stop(t + 0.2);

      if (s === 0 || s === 4) {
        const kOsc = this.ctx.createOscillator();
        const kGain = this.ctx.createGain();
        kOsc.type = 'triangle';
        kOsc.frequency.setValueAtTime(90, t);
        kOsc.frequency.exponentialRampToValueAtTime(30, t + 0.14);
        kGain.gain.setValueAtTime(0.07, t);
        kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        kOsc.connect(kGain);
        kGain.connect(this.dest);
        kOsc.start(t);
        kOsc.stop(t + 0.15);
      }

      this.bgm.step++;
    }, 240);
  },

  stopBGM() {
    if (this.bgm.timer) {
      clearInterval(this.bgm.timer);
      this.bgm.timer = null;
    }
    if (this.bgm.droneOsc) {
      try {
        this.bgm.droneOsc.stop();
        this.bgm.droneOsc.disconnect();
      } catch (e) {}
      this.bgm.droneOsc = null;
    }
  },

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopBGM();
    } else {
      this.ensure();
    }
    const svgIcon = document.getElementById('svgAudioIcon');
    if (svgIcon) {
      svgIcon.innerHTML = this.enabled
        ? '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="#38bdf8"/>'
        : '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="#ef4444"/>';
    }
    return this.enabled;
  },

  playNoise({ filterType = 'lowpass', startFreq = 800, endFreq = 200, Q = 1, duration = 0.25, volume = 0.1 } = {}) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      src.playbackRate.value = 0.85 + Math.random() * 0.3;

      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.Q.setValueAtTime(Q, t);
      filter.frequency.setValueAtTime(startFreq, t);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.dest);

      src.start(t);
      src.stop(t + duration + 0.04);
    } catch (e) {}
  },

  playTone(type, startFreq, endFreq, dur, vol = 0.1) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, startFreq), now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + dur);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(this.dest);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch (e) {}
  },

  // === РЕАЛИСТИЧНЫЕ ПРОЦЕДУРНЫЕ ЗВУКИ ОРУЖИЯ ===
  // Огненный шар: порыв ветра, низкий рев пламени на ветру и потрескивание углей
  flame() {
    if (!this.throttle('flame', 70)) return;
    // 1. Аэродинамический свист ветра и порыв воздуха (Whoosh)
    this.playNoise({ filterType: 'bandpass', startFreq: 1600, endFreq: 360, Q: 1.8, duration: 0.35, volume: 0.2 });
    // 2. Низкий гул и рев раскаленного пламени (Combustion roar)
    this.playNoise({ filterType: 'lowpass', startFreq: 320, endFreq: 75, Q: 1.4, duration: 0.38, volume: 0.17 });
    this.playTone('triangle', 145, 40, 0.35, 0.14);
    // 3. Потрескивание летящих углей
    setTimeout(() => {
      this.playNoise({ filterType: 'highpass', startFreq: 2800, endFreq: 1800, Q: 2.2, duration: 0.08, volume: 0.09 });
    }, 70);
  },

  // Священная Аура: глубокое гармоническое сияние и резонанс
  aura() {
    if (!this.throttle('aura', 280)) return;
    this.playTone('sine', 165, 110, 0.3, 0.08);
    this.playTone('triangle', 220, 165, 0.25, 0.04);
  },

  // Святой Флакон: звон бьющегося стекла и шипение разливающегося священного огня
  flask() {
    if (!this.throttle('flask', 80)) return;
    if (this.ctx && this.enabled) {
      const t = this.ctx.currentTime;
      [2400, 3600].forEach((freq, idx) => {
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.065 / (idx + 1), t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
          osc.connect(gain);
          gain.connect(this.dest);
          osc.start(t);
          osc.stop(t + 0.15);
        } catch (e) {}
      });
    }
    this.playNoise({ filterType: 'bandpass', startFreq: 1300, endFreq: 400, Q: 1.6, duration: 0.3, volume: 0.15 });
  },

  // Молот Правосудия: мощный физический удар о землю + благоговейный колокольный звон собора
  hammer() {
    if (!this.throttle('hammer', 85)) return;
    // Саб-басовый панч удара
    this.playTone('sine', 135, 30, 0.24, 0.24);
    // Звук крошащейся земли и каменных обломков
    this.playNoise({ filterType: 'lowpass', startFreq: 520, endFreq: 55, Q: 1.1, duration: 0.22, volume: 0.18 });
    // Священные соборные обертоны (гармонические колокола)
    if (this.ctx && this.enabled) {
      const t = this.ctx.currentTime;
      [880, 1320, 1760].forEach((freq, idx) => {
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.045 / (idx + 1), t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
          osc.connect(gain);
          gain.connect(this.dest);
          osc.start(t);
          osc.stop(t + 0.66);
        } catch (e) {}
      });
    }
  },

  // Метеоритный удар: колоссальный сейсмический взрыв и рокот
  meteor() {
    if (!this.throttle('meteor', 95)) return;
    this.playTone('sine', 85, 24, 0.55, 0.26);
    this.playNoise({ filterType: 'lowpass', startFreq: 1300, endFreq: 45, Q: 1.2, duration: 0.58, volume: 0.25 });
  },

  // Морозное кольцо: ледяной порыв арктического ветра + звон крошащегося льда
  frost() {
    if (!this.throttle('frost', 90)) return;
    this.playNoise({ filterType: 'highpass', startFreq: 1900, endFreq: 750, Q: 1.1, duration: 0.24, volume: 0.14 });
    if (this.ctx && this.enabled) {
      const t = this.ctx.currentTime;
      [1580, 2370, 3160].forEach((freq, i) => {
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + i * 0.02);
          gain.gain.setValueAtTime(0.035, t + i * 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.02 + 0.22);
          osc.connect(gain);
          gain.connect(this.dest);
          osc.start(t + i * 0.02);
          osc.stop(t + i * 0.02 + 0.23);
        } catch (e) {}
      });
    }
  },

  // Электрическая цепь Тесла: высоковольтный треск и разряд
  tesla() {
    if (!this.throttle('tesla', 75)) return;
    this.playNoise({ filterType: 'bandpass', startFreq: 3400, endFreq: 750, Q: 3.5, duration: 0.12, volume: 0.16 });
    this.playTone('sawtooth', 1400, 220, 0.08, 0.08);
  },

  // Кинжалы: аэродинамический свистящий рез стали по воздуху
  dagger() {
    if (!this.throttle('dagger', 50)) return;
    this.playNoise({ filterType: 'bandpass', startFreq: 2400, endFreq: 650, Q: 2.2, duration: 0.07, volume: 0.12 });
    this.playTone('sine', 1600, 800, 0.045, 0.04);
  },

  // Коса Жнеца: сокрушительный рассекающий взмах тяжелого лезвия
  scythe() {
    if (!this.throttle('scythe', 110)) return;
    this.playNoise({ filterType: 'lowpass', startFreq: 820, endFreq: 130, Q: 1.5, duration: 0.22, volume: 0.17 });
    this.playTone('triangle', 230, 48, 0.24, 0.14);
  },

  // Ядовитые споры: шипение газа под давлением и лопающиеся пузыри
  spores() {
    if (!this.throttle('spores', 120)) return;
    this.playNoise({ filterType: 'bandpass', startFreq: 950, endFreq: 280, Q: 2, duration: 0.3, volume: 0.11 });
    this.playTone('sine', 340, 150, 0.12, 0.05);
  },

  // Сюрикены: высокоскоростной металлический свист и рикошет
  shuriken() {
    if (!this.throttle('shuriken', 55)) return;
    this.playNoise({ filterType: 'highpass', startFreq: 2300, endFreq: 1100, Q: 2, duration: 0.06, volume: 0.09 });
    this.playTone('triangle', 950, 680, 0.065, 0.06);
  },

  // Солнечный луч: гудящее лазерное ионизирование и термическое шипение
  solar() {
    if (!this.throttle('solar', 240)) return;
    this.playTone('sawtooth', 340, 170, 0.42, 0.07);
    this.playNoise({ filterType: 'bandpass', startFreq: 2900, endFreq: 1300, Q: 2.8, duration: 0.38, volume: 0.11 });
  },

  // Боевые топоры: рассечение воздуха тяжелым кружащимся оружием
  axes() {
    if (!this.throttle('axes', 170)) return;
    this.playNoise({ filterType: 'bandpass', startFreq: 640, endFreq: 170, Q: 1.5, duration: 0.2, volume: 0.14 });
    this.playTone('triangle', 260, 85, 0.22, 0.1);
  },

  // Святой арбалет: упругий щелчок тетивы и полет стрелы
  crossbow() {
    if (!this.throttle('crossbow', 75)) return;
    this.playTone('triangle', 980, 190, 0.035, 0.12);
    this.playNoise({ filterType: 'highpass', startFreq: 1700, endFreq: 620, Q: 1.8, duration: 0.09, volume: 0.1 });
  },

  // Гравитационная мина: втягивание сингулярности в вакуум + имплозионный хлопок
  mines() {
    if (!this.throttle('mines', 95)) return;
    this.playTone('sine', 85, 440, 0.16, 0.12);
    setTimeout(() => {
      this.playTone('triangle', 190, 32, 0.22, 0.22);
      this.playNoise({ filterType: 'lowpass', startFreq: 680, endFreq: 55, Q: 1.3, duration: 0.24, volume: 0.16 });
    }, 150);
  },

  // Вороны: взмахи крыльев и потусторонний клекот
  ravens() {
    if (!this.throttle('ravens', 95)) return;
    this.playNoise({ filterType: 'lowpass', startFreq: 520, endFreq: 110, Q: 1.2, duration: 0.14, volume: 0.13 });
    this.playTone('sine', 760, 360, 0.15, 0.06);
  },

  // Энергетические диски: научно-фантастический плазменный вихрь
  discs() {
    if (!this.throttle('discs', 85)) return;
    this.playTone('triangle', 650, 410, 0.12, 0.08);
    this.playNoise({ filterType: 'bandpass', startFreq: 1600, endFreq: 780, Q: 2.8, duration: 0.12, volume: 0.09 });
  },

  // Звездные разломы: космический перелив и гравитационный всплеск
  rift() {
    if (!this.throttle('rift', 75)) return;
    this.playTone('sine', 590, 180, 0.18, 0.09);
    this.playTone('triangle', 880, 270, 0.15, 0.06);
  },

  // Попадание по врагу: упругий органический удар плоти (троттлинг 55мс для чистоты микса)
  hit() {
    if (!this.throttle('hit', 55)) return;
    this.playTone('triangle', 115, 38, 0.045, 0.075);
    this.playNoise({ filterType: 'lowpass', startFreq: 580, endFreq: 75, Q: 1, duration: 0.035, volume: 0.055 });
  },

  // Получение урона героем: увесистый глухой удар
  playerHurt() {
    if (!this.throttle('playerHurt', 130)) return;
    this.playTone('sine', 95, 28, 0.14, 0.22);
    this.playTone('sawtooth', 210, 65, 0.07, 0.11);
  },

  // Сбор кристаллов опыта: чистый акустический перелив хрусталя
  gem() {
    if (!this.throttle('gem', 32)) return;
    const base = 620 + Math.floor(Math.random() * 5) * 95;
    this.playTone('sine', base, base * 1.03, 0.055, 0.032);
  },

  levelUp() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    chord.forEach((freq, idx) => {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);
        gain.gain.setValueAtTime(0.07, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.05 + 0.38);
        osc.connect(gain);
        gain.connect(this.dest);
        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.39);
      } catch (e) {}
    });
  },

  synergyUnlock() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51, 1760];
    notes.forEach((freq, i) => {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.07);
        gain.gain.setValueAtTime(0.09, now + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.55);
        osc.connect(gain);
        gain.connect(this.dest);
        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.56);
      } catch (e) {}
    });
  },

  reaperBell() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    [130.81, 196.00, 261.63].forEach((f) => {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.exponentialRampToValueAtTime(f * 0.95, now + 3.0);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);
        osc.connect(gain);
        gain.connect(this.dest);
        osc.start(now);
        osc.stop(now + 3.0);
      } catch (e) {}
    });
  }
};

// ========================================================
// ВЕКТОРНЫЕ АРТЫ ДЛЯ 16 ОРУЖИЙ, 16 РЕЛИКВИЙ И 16 СИНЕРГИЙ
// ========================================================
const GAME_ICONS = {
  // --- 16 ОРУЖИЙ ---
  rift: `<svg viewBox="0 0 32 32" fill="none"><path d="M6 16C12 8 20 6 26 8C22 14 18 24 10 26C12 20 10 17 6 16Z" fill="#818cf8" stroke="#38bdf8" stroke-width="2"/><circle cx="16" cy="16" r="3" fill="#ffffff"/></svg>`,
  meteor: `<svg viewBox="0 0 32 32" fill="none"><path d="M4 4L14 14" stroke="#f97316" stroke-width="4" stroke-linecap="round"/><circle cx="21" cy="21" r="8" fill="#7c2d12" stroke="#ef4444" stroke-width="2"/><circle cx="19" cy="19" r="4" fill="#fef08a"/></svg>`,
  tesla: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="7" fill="#0284c7" stroke="#38bdf8" stroke-width="2"/><path d="M16 4V9M16 23V28M4 16H9M23 16H28" stroke="#67e8f9" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="16" r="3" fill="#ffffff"/></svg>`,
  frost: `<svg viewBox="0 0 32 32" fill="none"><path d="M16 3V29M3 16H29M7 7L25 25M7 25L25 7" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="16" r="3" fill="#ffffff"/></svg>`,
  solar: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="6" fill="#f59e0b" stroke="#fef08a" stroke-width="2"/><path d="M16 2L16 6M16 26L16 30M2 16L6 16M26 16L30 16" stroke="#fde047" stroke-width="2.5" stroke-linecap="round"/><path d="M16 16L30 20" stroke="#ffffff" stroke-width="2"/></svg>`,
  daggers: `<svg viewBox="0 0 32 32" fill="none"><path d="M7 25L25 7M20 6L26 12M6 20L12 26" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round"/><path d="M14 10L22 18" stroke="#38bdf8" stroke-width="2"/></svg>`,
  spores: `<svg viewBox="0 0 32 32" fill="none"><circle cx="12" cy="14" r="6" fill="#15803d" stroke="#4ade80" stroke-width="1.8"/><circle cx="20" cy="18" r="5" fill="#166534" stroke="#86efac" stroke-width="1.5"/><circle cx="16" cy="22" r="4" fill="#14532d"/></svg>`,
  axes: `<svg viewBox="0 0 32 32" fill="none"><path d="M7 25L25 7" stroke="#78350f" stroke-width="3" stroke-linecap="round"/><path d="M18 6C24 4 28 8 26 14C24 12 22 10 18 10Z" fill="#94a3b8" stroke="#cbd5e1" stroke-width="1.8"/></svg>`,
  hammer: `<svg viewBox="0 0 32 32" fill="none"><path d="M9 23L23 9" stroke="#b45309" stroke-width="3.5" stroke-linecap="round"/><rect x="17" y="5" width="10" height="6" rx="1" transform="rotate(45 17 5)" fill="#ca8a04" stroke="#fef08a" stroke-width="1.8"/></svg>`,
  flame: `<svg viewBox="0 0 32 32" fill="none"><path d="M16 3C16 3 24 11 24 19C24 23.4 20.4 27 16 27C11.6 27 8 23.4 8 19C8 11 16 3 16 3Z" fill="#ea580c" stroke="#f97316" stroke-width="2"/><path d="M16 11C16 11 20 15 20 19C20 21.2 18.2 23 16 23C13.8 23 12 21.2 12 19C12 15 16 11 16 11Z" fill="#fef08a"/></svg>`,
  scythe: `<svg viewBox="0 0 32 32" fill="none"><path d="M8 26L22 6" stroke="#475569" stroke-width="3" stroke-linecap="round"/><path d="M22 6C24 10 28 12 28 17C25 15 20 13 18 11" fill="#991b1b" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  shurikens: `<svg viewBox="0 0 32 32" fill="none"><path d="M16 4L19 13L28 16L19 19L16 28L13 19L4 16L13 13Z" fill="#334155" stroke="#94a3b8" stroke-width="1.8"/><circle cx="16" cy="16" r="3" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/></svg>`,
  aura: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#451a03" stroke="#f59e0b" stroke-width="2.5"/><circle cx="16" cy="16" r="7" stroke="#fef08a" stroke-width="1.8" stroke-dasharray="2 2"/><circle cx="16" cy="16" r="3" fill="#ffffff"/></svg>`,
  mines: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="18" r="8" fill="#1e1b4b" stroke="#6366f1" stroke-width="2"/><path d="M16 10V4M16 4H19" stroke="#f43f5e" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="18" r="3" fill="#f43f5e"/></svg>`,
  ravens: `<svg viewBox="0 0 32 32" fill="none"><path d="M4 14C10 10 16 12 28 8C24 16 16 20 8 22C10 18 8 16 4 14Z" fill="#1e293b" stroke="#64748b" stroke-width="1.8"/><circle cx="22" cy="11" r="1.5" fill="#f43f5e"/></svg>`,
  flask: `<svg viewBox="0 0 32 32" fill="none"><rect x="13" y="4" width="6" height="3.5" rx="1" fill="#78350f"/><path d="M13 7.5H19L23 23C23 25.5 21 27.5 18.5 27.5H13.5C11 27.5 9 25.5 9 23L13 7.5Z" fill="#0369a1" stroke="#38bdf8" stroke-width="2"/><path d="M10.5 19C13 17.5 19 17.5 21.5 19L22.2 23C22.2 24.5 20.8 25.5 18.5 25.5H13.5C11.2 25.5 9.8 24.5 9.8 23L10.5 19Z" fill="#facc15"/></svg>`,

  // --- 16 РЕЛИКВИЙ ---
  boots: `<svg viewBox="0 0 32 32" fill="none"><path d="M10 6L18 6L18 18L26 20L26 26L8 26L8 16L10 6Z" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/><path d="M6 14L12 11M4 19L10 17" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/></svg>`,
  titan: `<svg viewBox="0 0 32 32" fill="none"><path d="M16 4L26 10L26 22L16 28L6 22L6 10Z" fill="#1e1b4b" stroke="#a855f7" stroke-width="2"/><circle cx="16" cy="16" r="5" fill="#c084fc"/></svg>`,
  soul: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="9" stroke="#38bdf8" stroke-width="2.5"/><circle cx="16" cy="16" r="4" fill="#38bdf8"/><path d="M7 7C11 3 21 3 25 7" stroke="#bae6fd" stroke-width="2" stroke-linecap="round"/></svg>`,
  well: `<svg viewBox="0 0 32 32" fill="none"><ellipse cx="16" cy="12" rx="10" ry="5" fill="#0369a1" stroke="#38bdf8" stroke-width="2"/><path d="M6 12V22C6 24.8 10.5 27 16 27C21.5 27 26 24.8 26 22V12" stroke="#38bdf8" stroke-width="2"/></svg>`,
  lens: `<svg viewBox="0 0 32 32" fill="none"><circle cx="14" cy="14" r="8" stroke="#f59e0b" stroke-width="2.5"/><path d="M20 20L28 28" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round"/><circle cx="14" cy="14" r="3" fill="#fef08a"/></svg>`,
  edge: `<svg viewBox="0 0 32 32" fill="none"><path d="M6 26L26 6M19 5L27 13" stroke="#e11d48" stroke-width="2.5" stroke-linecap="round"/><circle cx="16" cy="16" r="2" fill="#fda4af"/></svg>`,
  skull: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="13" r="8" fill="#334155" stroke="#94a3b8" stroke-width="2"/><rect x="12" y="19" width="8" height="6" fill="#334155" stroke="#94a3b8" stroke-width="2"/><circle cx="13" cy="13" r="2" fill="#000"/><circle cx="19" cy="13" r="2" fill="#000"/></svg>`,
  bracers: `<svg viewBox="0 0 32 32" fill="none"><rect x="9" y="8" width="14" height="16" rx="2" fill="#334155" stroke="#d97706" stroke-width="2"/><path d="M12 12H20M12 16H20M12 20H20" stroke="#fde047" stroke-width="1.8"/></svg>`,
  cross: `<svg viewBox="0 0 32 32" fill="none"><path d="M16 4V28M8 12H24" stroke="#eab308" stroke-width="4" stroke-linecap="round"/><circle cx="16" cy="12" r="3" fill="#ffffff"/></svg>`,
  heart: `<svg viewBox="0 0 32 32" fill="none"><path d="M16 6C12 2 6 4 6 10C6 17 16 26 16 26C16 26 26 17 26 10C26 4 20 2 16 6Z" fill="#991b1b" stroke="#ef4444" stroke-width="2"/><circle cx="16" cy="13" r="3" fill="#fca5a5"/></svg>`,
  goblet: `<svg viewBox="0 0 32 32" fill="none"><path d="M10 6H22V13C22 16.3 19.3 19 16 19C12.7 19 10 16.3 10 13V6Z" fill="#831843" stroke="#f43f5e" stroke-width="2"/><path d="M16 19V26M11 26H21" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  mask: `<svg viewBox="0 0 32 32" fill="none"><path d="M6 10L16 6L26 10V18C26 23 16 27 16 27C16 27 6 23 6 18V10Z" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/><path d="M10 14L14 16M22 14L18 16" stroke="#f43f5e" stroke-width="2" stroke-linecap="round"/></svg>`,
  chrono: `<svg viewBox="0 0 32 32" fill="none"><path d="M10 6H22M10 26H22M10 6L16 16L10 26M22 6L16 16L22 26" stroke="#06b6d4" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="20" r="2" fill="#67e8f9"/></svg>`,
  magnet: `<svg viewBox="0 0 32 32" fill="none"><path d="M9 7V16C9 19.9 12.1 23 16 23C19.9 23 23 19.9 23 16V7" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/><path d="M9 7V11M23 7V11" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/></svg>`,
  feather: `<svg viewBox="0 0 32 32" fill="none"><path d="M26 6C20 8 12 16 6 26M26 6C24 14 16 20 6 26M26 6L14 18" stroke="#a855f7" stroke-width="2" stroke-linecap="round"/></svg>`,
  clover: `<svg viewBox="0 0 32 32" fill="none"><circle cx="11" cy="11" r="6" fill="#15803d" stroke="#4ade80" stroke-width="1.8"/><circle cx="21" cy="11" r="6" fill="#15803d" stroke="#4ade80" stroke-width="1.8"/><circle cx="16" cy="20" r="6" fill="#15803d" stroke="#4ade80" stroke-width="1.8"/><rect x="15" y="22" width="2.5" height="7" rx="1" fill="#78350f"/><circle cx="16" cy="15" r="3" fill="#4ade80"/></svg>`,
  // --- 16 СУПЕРСИНЕРГИЙ ---
  infinite_rift: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12" fill="#090514" stroke="#a855f7" stroke-width="2.5"/><path d="M16 6C22 10 22 22 16 26C10 22 10 10 16 6Z" fill="#3b0764" stroke="#38bdf8" stroke-width="2"/><circle cx="16" cy="16" r="4" fill="#ffffff"/></svg>`,
  armageddon: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#450a0a" stroke="#ef4444" stroke-width="2.5"/><path d="M6 6L26 26M6 26L26 6" stroke="#f97316" stroke-width="3"/><circle cx="16" cy="16" r="5" fill="#fef08a"/></svg>`,
  soul_tempest: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#082f49" stroke="#38bdf8" stroke-width="2.5"/><path d="M16 4L12 14H20L15 28L18 17H11L16 4Z" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5"/></svg>`,
  absolute_zero: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#082f49" stroke="#7dd3fc" stroke-width="2.5"/><path d="M16 3V29M3 16H29M8 8L24 24M8 24L24 8" stroke="#ffffff" stroke-width="2.5"/></svg>`,
  hand_of_helios: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#451a03" stroke="#f59e0b" stroke-width="2.5"/><path d="M3 16H29M16 3V29" stroke="#fef08a" stroke-width="3.5"/><circle cx="16" cy="16" r="6" fill="#ffffff"/></svg>`,
  death_dance: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#4c0519" stroke="#f43f5e" stroke-width="2.5"/><path d="M8 8L24 24M8 24L24 8" stroke="#fda4af" stroke-width="3"/><circle cx="16" cy="16" r="4" fill="#ffffff"/></svg>`,
  black_plague: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#052e16" stroke="#22c55e" stroke-width="2.5"/><path d="M11 11C14 8 18 8 21 11C21 17 11 17 11 11Z" fill="#4ade80"/><circle cx="16" cy="21" r="3" fill="#86efac"/></svg>`,
  valhalla_vortex: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#451a03" stroke="#d97706" stroke-width="2.5"/><path d="M6 16C6 10 10 6 16 6C22 6 26 10 26 16C26 22 22 26 16 26" stroke="#fef08a" stroke-width="3" stroke-linecap="round"/></svg>`,
  mjolnir: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#422006" stroke="#eab308" stroke-width="2.5"/><path d="M11 13H21V19H11V13ZM16 19V27" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  inferno_vortex: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#450a0a" stroke="#ea580c" stroke-width="2.5"/><path d="M16 5C22 9 24 16 20 22C16 28 8 24 8 18C8 12 16 5 16 5Z" fill="#f97316"/><circle cx="16" cy="16" r="4" fill="#fef08a"/></svg>`,
  blood_reaper: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#450a0a" stroke="#b91c1c" stroke-width="2.5"/><path d="M10 24C16 24 24 18 24 8C16 10 12 16 10 24Z" fill="#ef4444"/><circle cx="14" cy="18" r="2" fill="#fff"/></svg>`,
  shadow_barrage: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#0f172a" stroke="#6366f1" stroke-width="2.5"/><path d="M16 4L20 12L28 16L20 20L16 28L12 20L4 16L12 12Z" fill="#818cf8"/></svg>`,
  sanctuary_of_light: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12" fill="#082f49" stroke="#38bdf8" stroke-width="2.5"/><circle cx="16" cy="16" r="8" fill="#0369a1" stroke="#fef08a" stroke-width="2"/><path d="M16 4V28M4 16H28" stroke="#ffffff" stroke-width="2"/><circle cx="16" cy="16" r="3.5" fill="#facc15"/></svg>`,
  gravitational_collapse: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#1e1b4b" stroke="#8b5cf6" stroke-width="2.5"/><circle cx="16" cy="16" r="6" fill="#000000" stroke="#f43f5e" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="#ffffff"/></svg>`,
  flock_of_doom: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" fill="#020617" stroke="#94a3b8" stroke-width="2.5"/><path d="M6 12C12 8 18 10 26 6C22 14 16 18 8 20Z" fill="#475569"/><circle cx="20" cy="8" r="2" fill="#f43f5e"/></svg>`,
  infernal_conflagration: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12" fill="#450a0a" stroke="#ea580c" stroke-width="2.5"/><path d="M16 4C19 9 24 12 24 19C24 24 20 28 16 28C12 28 8 24 8 19C8 12 13 9 16 4Z" fill="#f97316"/><path d="M16 12C18 15 20 17 20 20C20 22 18 24 16 24C14 24 12 22 12 20C12 17 14 15 16 12Z" fill="#fef08a"/></svg>`,
  // --- НАГРАДЫ ЗОЛОТА ---
  gold_pouch: `<svg viewBox="0 0 32 32" fill="none"><path d="M11 6C11 6 13 10 9 14C5 18 6 26 16 26C26 26 27 18 23 14C19 10 21 6 21 6H11Z" fill="#b45309" stroke="#f59e0b" stroke-width="2"/><circle cx="16" cy="18" r="4" fill="#fef08a"/><path d="M10 10H22" stroke="#fef08a" stroke-width="2"/></svg>`,
  gold_chest: `<svg viewBox="0 0 32 32" fill="none"><rect x="5" y="11" width="22" height="15" rx="2" fill="#78350f" stroke="#f59e0b" stroke-width="2"/><path d="M4 11C4 8 8 6 16 6C24 6 28 8 28 11H4Z" fill="#b45309" stroke="#f59e0b" stroke-width="2"/><circle cx="16" cy="17" r="2.5" fill="#fef08a"/></svg>`,
  gold_vault: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12" fill="#451a03" stroke="#f59e0b" stroke-width="2.5"/><path d="M16 8V24M8 16H24M10 10L22 22M10 22L22 10" stroke="#fef08a" stroke-width="2"/><circle cx="16" cy="16" r="4" fill="#fde047"/></svg>`
};

// ========================================================
// ОПРЕДЕЛЕНИЯ 16 ОРУЖИЙ, 16 РЕЛИКВИЙ И 16 СИНЕРГИЙ
// ========================================================
const WEAPONS_DEF = {
  rift: {
    id: 'rift',
    name: 'Звездный разлом',
    iconKey: 'rift',
    partnerRelic: 'boots',
    synergyKey: 'infinite_rift',
    rarity: 'legendary',
    baseCooldown: 520,
    baseDamage: 38,
    desc: 'Запускает астральные рассекающие клинки в ближайших врагов.',
    upgradeDesc: '+12 урона, -8% кд (+1 клинок на ур. 3 и 5).'
  },
  meteor: {
    id: 'meteor',
    name: 'Метеорит',
    iconKey: 'meteor',
    partnerRelic: 'titan',
    synergyKey: 'armageddon',
    rarity: 'legendary',
    baseCooldown: 2500,
    baseDamage: 140,
    desc: 'Обрушивает пылающие метеориты на скопления монстров.',
    upgradeDesc: '+35 урона и шире кратер (+1 метеорит на ур. 3 и 5).'
  },
  tesla: {
    id: 'tesla',
    name: 'Тесла-сфера',
    iconKey: 'tesla',
    partnerRelic: 'soul',
    synergyKey: 'soul_tempest',
    rarity: 'epic',
    baseCooldown: 1250,
    baseDamage: 48,
    desc: 'Орбитальная сфера поражает врагов цепной молнией.',
    upgradeDesc: '+11 урона и +1 цель для цепной молнии.'
  },
  frost: {
    id: 'frost',
    name: 'Ледяная сверхновая',
    iconKey: 'frost',
    partnerRelic: 'well',
    synergyKey: 'absolute_zero',
    rarity: 'rare',
    baseCooldown: 2100,
    baseDamage: 55,
    desc: 'Круговой взрыв ледяных шипов, замедляющий врагов.',
    upgradeDesc: '+14 урона и +2 ледяных шипа в залпе.'
  },
  solar: {
    id: 'solar',
    name: 'Солнечный луч',
    iconKey: 'solar',
    partnerRelic: 'lens',
    synergyKey: 'hand_of_helios',
    rarity: 'legendary',
    baseCooldown: 3200,
    baseDamage: 180,
    desc: 'Фокусированный световой луч выжигает монстров дугой.',
    upgradeDesc: '+36 урона, +25% длительность и -10% кд.'
  },
  daggers: {
    id: 'daggers',
    name: 'Призрачные кинжалы',
    iconKey: 'daggers',
    partnerRelic: 'edge',
    synergyKey: 'death_dance',
    rarity: 'common',
    baseCooldown: 700,
    baseDamage: 32,
    desc: 'Скоростной веер кинжалов вперед по ходу движения героя.',
    upgradeDesc: '+8 урона и +1 кинжал в веере.'
  },
  spores: {
    id: 'spores',
    name: 'Чумные споры',
    iconKey: 'spores',
    partnerRelic: 'skull',
    synergyKey: 'black_plague',
    rarity: 'common',
    baseCooldown: 1800,
    baseDamage: 28,
    desc: 'Оставляет ядовитые облака, непрерывно травящие врагов.',
    upgradeDesc: '+7 урона и больше радиус (+1 облако на ур. 3 и 5).'
  },
  axes: {
    id: 'axes',
    name: 'Боевые топоры',
    iconKey: 'axes',
    partnerRelic: 'bracers',
    synergyKey: 'valhalla_vortex',
    rarity: 'common',
    baseCooldown: 4200,
    baseDamage: 65,
    desc: 'Тяжелые топоры описывают расширяющуюся спираль вокруг героя.',
    upgradeDesc: '+16 урона и шире вихрь (+1 топор на ур. 3 и 5).'
  },
  hammer: {
    id: 'hammer',
    name: 'Молот правосудия',
    iconKey: 'hammer',
    partnerRelic: 'cross',
    synergyKey: 'mjolnir',
    rarity: 'epic',
    baseCooldown: 2200,
    baseDamage: 110,
    desc: 'Священный молот падает на врага, вызывая ударную волну.',
    upgradeDesc: '+28 урона и шире оглушение (+1 молот на ур. 4).'
  },
  flame: {
    id: 'flame',
    name: 'Огненный шар',
    iconKey: 'flame',
    partnerRelic: 'heart',
    synergyKey: 'inferno_vortex',
    rarity: 'rare',
    baseCooldown: 1750,
    baseDamage: 75,
    desc: 'Мощный сгусток огня с грохотом рассекает воздух на ветру и детонирует в толпе монстров.',
    upgradeDesc: '+22 урона и шире огненный взрыв.'
  },
  scythe: {
    id: 'scythe',
    name: 'Кровавая коса',
    iconKey: 'scythe',
    partnerRelic: 'goblet',
    synergyKey: 'blood_reaper',
    rarity: 'epic',
    baseCooldown: 1400,
    baseDamage: 75,
    desc: 'Широкий взмах призрачного серпа перед рыцарем.',
    upgradeDesc: '+18 урона, шире взмах и -7% кд.'
  },
  shurikens: {
    id: 'shurikens',
    name: 'Теневые сюрикены',
    iconKey: 'shurikens',
    partnerRelic: 'mask',
    synergyKey: 'shadow_barrage',
    rarity: 'rare',
    baseCooldown: 850,
    baseDamage: 30,
    desc: 'Быстрые рикошетящие звездочки, отскакивающие между целями.',
    upgradeDesc: '+8 урона и +1 отскок рикошета.'
  },
  aura: {
    id: 'aura',
    name: 'Священная аура',
    iconKey: 'aura',
    partnerRelic: 'chrono',
    synergyKey: 'sanctuary_of_light',
    rarity: 'rare',
    baseCooldown: 350,
    baseDamage: 22,
    desc: 'Сияющая аура вокруг рыцаря непрерывно испепеляет и отталкивает приближающихся монстров.',
    upgradeDesc: '+8 урона и +20% к радиусу защитной ауры.'
  },
  mines: {
    id: 'mines',
    name: 'Гравитационные мины',
    iconKey: 'mines',
    partnerRelic: 'magnet',
    synergyKey: 'gravitational_collapse',
    rarity: 'legendary',
    baseCooldown: 2800,
    baseDamage: 120,
    desc: 'Мины позади героя притягивают монстров перед взрывом.',
    upgradeDesc: '+30 урона и сильнее притяжение (+1 мина на ур. 3 и 5).'
  },
  ravens: {
    id: 'ravens',
    name: 'Стая воронов',
    iconKey: 'ravens',
    partnerRelic: 'feather',
    synergyKey: 'flock_of_doom',
    rarity: 'epic',
    baseCooldown: 1500,
    baseDamage: 40,
    desc: 'Призрачные вороны пикируют на самых опасных врагов.',
    upgradeDesc: '+10 урона и +1 ворон в стае.'
  },
  flask: {
    id: 'flask',
    name: 'Священный фиал',
    iconKey: 'flask',
    partnerRelic: 'clover',
    synergyKey: 'infernal_conflagration',
    rarity: 'common',
    baseCooldown: 2600,
    baseDamage: 45,
    desc: 'Бросает освященный сосуд в скопление врагов, разливая долго горящую священную лужу пламени.',
    upgradeDesc: '+14 урона в секунду и +1 сосуд в залпе.'
  }
};

const RELICS_DEF = {
  boots: {
    id: 'boots',
    name: 'Сапоги Бездны',
    iconKey: 'boots',
    evolvesWeapon: 'rift',
    rarity: 'common',
    desc: '+10% к скорости перемещения героя.',
    upgradeDesc: '+10% к скорости бега (до +50%).'
  },
  titan: {
    id: 'titan',
    name: 'Кристалл Титана',
    iconKey: 'titan',
    evolvesWeapon: 'meteor',
    rarity: 'epic',
    desc: '+12% ко всему наносимому урону.',
    upgradeDesc: '+12% к общему урону (до +60%).'
  },
  soul: {
    id: 'soul',
    name: 'Амулет Душ',
    iconKey: 'soul',
    evolvesWeapon: 'tesla',
    rarity: 'common',
    desc: '+25% к радиусу сбора кристаллов.',
    upgradeDesc: '+25% к радиусу сбора.'
  },
  well: {
    id: 'well',
    name: 'Астральный Колодец',
    iconKey: 'well',
    evolvesWeapon: 'frost',
    rarity: 'rare',
    desc: '-7% ко времени перезарядки способностей.',
    upgradeDesc: '-7% ко времени перезарядки (до -35%).'
  },
  lens: {
    id: 'lens',
    name: 'Линза Рассвета',
    iconKey: 'lens',
    evolvesWeapon: 'solar',
    rarity: 'epic',
    desc: '+15% к длительности и дальности заклинаний.',
    upgradeDesc: '+15% к длительности/дальности.'
  },
  edge: {
    id: 'edge',
    name: 'Клинок Ассасина',
    iconKey: 'edge',
    evolvesWeapon: 'daggers',
    rarity: 'rare',
    desc: '+8% шанс критического удара (х2 урон).',
    upgradeDesc: '+8% шанс крита (до 40%).'
  },
  skull: {
    id: 'skull',
    name: 'Чумной Череп',
    iconKey: 'skull',
    evolvesWeapon: 'spores',
    rarity: 'epic',
    desc: 'Ослабляет врагов: они получают на 10% больше урона.',
    upgradeDesc: '+10% к урону по врагам (до +50%).'
  },
  bracers: {
    id: 'bracers',
    name: 'Тяжелые Наручи',
    iconKey: 'bracers',
    evolvesWeapon: 'axes',
    rarity: 'common',
    desc: '+15% к размеру снарядов и +20% к отталкиванию.',
    upgradeDesc: '+15% размер снарядов и +20% отталкивание.'
  },
  cross: {
    id: 'cross',
    name: 'Золотой Крест',
    iconKey: 'cross',
    evolvesWeapon: 'hammer',
    rarity: 'common',
    desc: '+25 к макс. HP и мгновенное лечение на 25 HP.',
    upgradeDesc: '+25 макс. HP и лечение.'
  },
  heart: {
    id: 'heart',
    name: 'Магматическое Сердце',
    iconKey: 'heart',
    evolvesWeapon: 'flame',
    rarity: 'rare',
    desc: 'Восстанавливает +1.0 HP каждую секунду.',
    upgradeDesc: '+1.0 HP/сек регенерации (до +5.0 HP/сек).'
  },
  goblet: {
    id: 'goblet',
    name: 'Кубок Вампира',
    iconKey: 'goblet',
    evolvesWeapon: 'scythe',
    rarity: 'epic',
    desc: 'Вампиризм: восстанавливает 1 HP за серию убийств.',
    upgradeDesc: 'Вампиризм: на 3 убийства меньше для лечения.'
  },
  mask: {
    id: 'mask',
    name: 'Маска Ниндзя',
    iconKey: 'mask',
    evolvesWeapon: 'shurikens',
    rarity: 'rare',
    desc: '+15% к скорости полета снарядов.',
    upgradeDesc: '+15% к скорости снарядов.'
  },
  chrono: {
    id: 'chrono',
    name: 'Хроно-Песочные Часы',
    iconKey: 'chrono',
    evolvesWeapon: 'aura',
    rarity: 'legendary',
    desc: 'Аура времени замедляет врагов вокруг героя на 8%.',
    upgradeDesc: 'Ещё +8% замедления врагов (до 40%).'
  },
  magnet: {
    id: 'magnet',
    name: 'Сфера Притяжения',
    iconKey: 'magnet',
    evolvesWeapon: 'mines',
    rarity: 'legendary',
    desc: 'Глобальный импульс притягивает ВСЕ кристаллы с карты.',
    upgradeDesc: 'Глобальный сбор на 5 сек чаще (до 25с).'
  },
  feather: {
    id: 'feather',
    name: 'Перо Ворона',
    iconKey: 'feather',
    evolvesWeapon: 'ravens',
    rarity: 'legendary',
    desc: 'Дарует +1 дополнительный снаряд во все виды оружия.',
    upgradeDesc: '+1 дополнительный снаряд (на ур. 1 и 4).'
  },
  clover: {
    id: 'clover',
    name: 'Клевер Удачи',
    iconKey: 'clover',
    evolvesWeapon: 'flask',
    rarity: 'legendary',
    desc: 'Увеличивает шанс выпадения редких и легендарных карт на 20%.',
    upgradeDesc: 'Ещё +20% к шансу редких карт.'
  }
};

const SYNERGIES_DEF = {
  infinite_rift: {
    id: 'infinite_rift',
    weaponId: 'rift',
    relicId: 'boots',
    name: 'Бесконечный Разлом',
    iconKey: 'infinite_rift',
    desc: 'Разломы открывают черные дыры, затягивающие монстров и взрывающие их сингулярным коллапсом!'
  },
  armageddon: {
    id: 'armageddon',
    weaponId: 'meteor',
    relicId: 'titan',
    name: 'Армагеддон',
    iconKey: 'armageddon',
    desc: 'Непрерывный метеоритный шторм гигантских астероидов, раскалывающий землю лавовыми разломами!'
  },
  soul_tempest: {
    id: 'soul_tempest',
    weaponId: 'tesla',
    relicId: 'soul',
    name: 'Буря Душ',
    iconKey: 'soul_tempest',
    desc: 'Разряды бьют по 12 целям, превращая погибших монстров в электростатические вспышки опыта!'
  },
  absolute_zero: {
    id: 'absolute_zero',
    weaponId: 'frost',
    relicId: 'well',
    name: 'Абсолютный Ноль',
    iconKey: 'absolute_zero',
    desc: 'Поле вечной мерзлоты замораживает весь экран; ледяные осколки взрываются вторичными шрапнелями!'
  },
  hand_of_helios: {
    id: 'hand_of_helios',
    weaponId: 'solar',
    relicId: 'lens',
    name: 'Длань Гелиоса',
    iconKey: 'hand_of_helios',
    desc: 'Двойной вращающийся солнечный гиперлуч испепеляет монстров потоками чистого термоядерного света!'
  },
  death_dance: {
    id: 'death_dance',
    weaponId: 'daggers',
    relicId: 'edge',
    name: 'Танец Смерти',
    iconKey: 'death_dance',
    desc: 'Круговой шквал из сотен рикошетящих призрачных клинков с гарантированным 100% критическим уроном!'
  },
  black_plague: {
    id: 'black_plague',
    weaponId: 'spores',
    relicId: 'skull',
    name: 'Черный Мор',
    iconKey: 'black_plague',
    desc: 'Токсичные гейзеры запускают цепные взрывы яда при гибели каждого зараженного монстра!'
  },
  valhalla_vortex: {
    id: 'valhalla_vortex',
    weaponId: 'axes',
    relicId: 'bracers',
    name: 'Вихрь Вальхаллы',
    iconKey: 'valhalla_vortex',
    desc: '4 гигантские пылающие секиры создают непробиваемый вращающийся щит с разрушительными ударными волнами!'
  },
  mjolnir: {
    id: 'mjolnir',
    weaponId: 'hammer',
    relicId: 'cross',
    name: 'Мьёльнир',
    iconKey: 'mjolnir',
    desc: 'Громовые божественные удары сотрясают арену и порождают расходящиеся молниеносные каскады!'
  },
  inferno_vortex: {
    id: 'inferno_vortex',
    weaponId: 'flame',
    relicId: 'heart',
    name: 'Инферно-Вихрь',
    iconKey: 'inferno_vortex',
    desc: 'Колоссальный огненный торнадо втягивает толпы монстров в центр и мгновенно превращает в пепел!'
  },
  blood_reaper: {
    id: 'blood_reaper',
    weaponId: 'scythe',
    relicId: 'goblet',
    name: 'Жнец Крови',
    iconKey: 'blood_reaper',
    desc: 'Огромные кровавые серпы на весь экран, восстанавливающие здоровье героя с каждого срезанного врага!'
  },
  shadow_barrage: {
    id: 'shadow_barrage',
    weaponId: 'shurikens',
    relicId: 'mask',
    name: 'Шквал Теней',
    iconKey: 'shadow_barrage',
    desc: 'Непрерывный дождь сюрикенов, пронзающих всех насквозь и раскалывающихся на теневые клинки!'
  },
  sanctuary_of_light: {
    id: 'sanctuary_of_light',
    weaponId: 'aura',
    relicId: 'chrono',
    name: 'Святилище Света',
    iconKey: 'sanctuary_of_light',
    desc: 'Гигантский купол непрерывного сияния, исцеляющий героя и мгновенно сжигающий мелких монстров!'
  },
  gravitational_collapse: {
    id: 'gravitational_collapse',
    weaponId: 'mines',
    relicId: 'magnet',
    name: 'Коллапс Гравитации',
    iconKey: 'gravitational_collapse',
    desc: 'Мины стягивают врагов со всего экрана мощной гравитацией и взрываются микро-сингулярностями!'
  },
  flock_of_doom: {
    id: 'flock_of_doom',
    weaponId: 'ravens',
    relicId: 'feather',
    name: 'Стая Рока',
    iconKey: 'flock_of_doom',
    desc: 'Армия призрачных воронов безжалостно терзает элитных монстров и боссов непрерывными атаками!'
  },
  infernal_conflagration: {
    id: 'infernal_conflagration',
    weaponId: 'flask',
    relicId: 'clover',
    name: 'Божественное Пламя',
    iconKey: 'infernal_conflagration',
    desc: 'Священный фиал разрывается цепной вспышкой, покрывая землю незатухающим очищающим огнем!'
  }
};

// ========================================================
// ОСНОВНАЯ СЦЕНА ИГРЫ (PHASER 3)
// ========================================================
class RogueliteScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RogueliteScene' });
  }

  preload() {
    this.generateAllTextures();
  }

  generateAllTextures() {
    // 1. Бесшовный обсидиановый пол без сетки и стыков (256x256)
    const gFloor = this.make.graphics({ x: 0, y: 0, add: false });
    gFloor.fillStyle(0x0a0c13, 1);
    gFloor.fillRect(0, 0, 256, 256);

    const drawSeamlessCircle = (gx, gy, gr, gc, ga) => {
      for (let ox of [-256, 0, 256]) {
        for (let oy of [-256, 0, 256]) {
          const cx = gx + ox;
          const cy = gy + oy;
          if (cx + gr >= 0 && cx - gr <= 256 && cy + gr >= 0 && cy - gr <= 256) {
            gFloor.fillStyle(gc, ga);
            gFloor.fillCircle(cx, cy, gr);
          }
        }
      }
    };

    const stoneSpots = [
      { x: 45, y: 50, r: 52, c: 0x121520, a: 0.35 },
      { x: 175, y: 75, r: 58, c: 0x0f121a, a: 0.4 },
      { x: 90, y: 195, r: 50, c: 0x131722, a: 0.35 },
      { x: 210, y: 210, r: 46, c: 0x10131d, a: 0.4 },
      { x: 130, y: 130, r: 42, c: 0x141825, a: 0.3 }
    ];
    stoneSpots.forEach(s => drawSeamlessCircle(s.x, s.y, s.r, s.c, s.a));

    const specks = [
      { x: 35, y: 45, c: 0x38bdf8, a: 0.3 },
      { x: 115, y: 30, c: 0x818cf8, a: 0.25 },
      { x: 185, y: 90, c: 0x38bdf8, a: 0.2 },
      { x: 65, y: 145, c: 0x6366f1, a: 0.25 },
      { x: 155, y: 215, c: 0x38bdf8, a: 0.2 }
    ];
    specks.forEach(s => drawSeamlessCircle(s.x, s.y, 1.5, s.c, s.a));
    gFloor.generateTexture('tile_floor', 256, 256);

    // 2. Рыцарь в латах (Knight)
    const drawKnightFrame = (frameKey) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.45);
      g.fillEllipse(20, 40, 16, 5);

      let lLegX = 14, lLegY = 27, lLegH = 11;
      let rLegX = 22, rLegY = 27, rLegH = 11;
      let bodyBob = 0;
      let swordTilt = 0;
      let shieldShift = 0;

      if (frameKey === 'knight_walk_0') {
        lLegX = 10; lLegY = 29; rLegX = 25; rLegY = 25; swordTilt = -2; shieldShift = 1;
      } else if (frameKey === 'knight_walk_1') {
        lLegX = 15; lLegY = 26; rLegX = 21; rLegY = 27; bodyBob = -1.5;
      } else if (frameKey === 'knight_walk_2') {
        lLegX = 25; lLegY = 25; rLegX = 10; rLegY = 29; swordTilt = 2; shieldShift = -1;
      } else if (frameKey === 'knight_walk_3') {
        lLegX = 16; lLegY = 27; rLegX = 20; rLegY = 26; bodyBob = 0.5;
      }

      g.fillStyle(0x1e293b, 1);
      g.fillRect(lLegX, lLegY + bodyBob, 5, lLegH);
      g.fillRect(rLegX, rLegY + bodyBob, 5, rLegH);
      g.fillStyle(0x94a3b8, 1);
      g.fillRect(lLegX + 1, lLegY + bodyBob, 3, lLegH - 2);
      g.fillRect(rLegX + 1, rLegY + bodyBob, 3, rLegH - 2);
      g.fillStyle(0xf1f5f9, 1);
      g.fillRect(lLegX, lLegY + lLegH - 3 + bodyBob, 5, 3);
      g.fillRect(rLegX, rLegY + rLegH - 3 + bodyBob, 5, 3);

      g.fillStyle(0x1d4ed8, 1);
      g.fillRect(15, 23 + bodyBob, 10, 7);
      g.fillStyle(0xf59e0b, 1);
      g.fillRect(15, 29 + bodyBob, 10, 1.5);
      g.fillRect(19, 23 + bodyBob, 2, 6);

      g.fillStyle(0x0f172a, 1);
      g.fillRect(12, 14 + bodyBob, 16, 12);
      g.fillStyle(0x475569, 1);
      g.fillRect(13, 14 + bodyBob, 14, 11);
      g.fillStyle(0x94a3b8, 1);
      g.fillRect(14, 15 + bodyBob, 12, 5);
      g.fillStyle(0xf8fafc, 1);
      g.fillRect(16, 16 + bodyBob, 8, 2);

      g.fillStyle(0xb45309, 1);
      g.fillRect(12, 23 + bodyBob, 16, 3);
      g.fillStyle(0xfbbf24, 1);
      g.fillRect(18, 22.5 + bodyBob, 4, 4);

      g.fillStyle(0x334155, 1);
      g.fillRect(8 + shieldShift, 13 + bodyBob, 6, 7);
      g.fillRect(26, 13 + bodyBob, 6, 7);
      g.fillStyle(0xcbd5e1, 1);
      g.fillRect(9 + shieldShift, 14 + bodyBob, 4, 3);
      g.fillRect(27, 14 + bodyBob, 4, 3);

      g.fillStyle(0x1e293b, 1);
      g.fillCircle(20, 9 + bodyBob, 8.5);
      g.fillStyle(0x64748b, 1);
      g.fillCircle(20, 9 + bodyBob, 7.5);
      g.fillStyle(0xe2e8f0, 1);
      g.fillRect(17, 3 + bodyBob, 6, 3);
      g.fillStyle(0x0a0f1d, 1);
      g.fillRect(15, 8 + bodyBob, 10, 2.5);
      g.fillRect(19, 8 + bodyBob, 2, 6);
      g.fillStyle(0xf59e0b, 1);
      g.fillRect(19, 4 + bodyBob, 2, 4);
      g.fillStyle(0xb91c1c, 1);
      g.fillTriangle(20, 2 + bodyBob, 12, -2 + bodyBob, 20, 5 + bodyBob);
      g.fillStyle(0xef4444, 1);
      g.fillTriangle(20, 1 + bodyBob, 10, -3 + bodyBob, 19, 4 + bodyBob);

      const sx = 6 + shieldShift;
      const sy = 16 + bodyBob;
      g.fillStyle(0x0f172a, 1);
      g.fillTriangle(sx, sy, sx + 9, sy, sx + 4.5, sy + 14);
      g.fillRect(sx, sy, 9, 6);
      g.fillStyle(0x2563eb, 1);
      g.fillTriangle(sx + 1, sy + 1, sx + 8, sy + 1, sx + 4.5, sy + 13);
      g.fillRect(sx + 1, sy + 1, 7, 5);
      g.fillStyle(0xfbbf24, 1);
      g.fillRect(sx + 3.5, sy + 2, 2, 7);

      const mx = 29;
      const my = 7 + bodyBob + swordTilt;
      g.fillStyle(0xffffff, 1);
      g.fillRect(mx, my, 3, 20);
      g.fillStyle(0x94a3b8, 1);
      g.fillRect(mx + 1, my, 1, 20);
      g.fillStyle(0xf59e0b, 1);
      g.fillRect(mx - 3, my + 15, 9, 2.5);
      g.fillStyle(0x78350f, 1);
      g.fillRect(mx, my + 17.5, 3, 4);

      g.generateTexture(frameKey, 40, 44);
    };

    drawKnightFrame('knight_idle');
    drawKnightFrame('knight_walk_0');
    drawKnightFrame('knight_walk_1');
    drawKnightFrame('knight_walk_2');
    drawKnightFrame('knight_walk_3');

    // 3. Враги
    const drawCrawler = (k, sx, sy) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.45);
      g.fillEllipse(17, 27, 16, 4);
      g.fillStyle(0x3b0764, 1);
      g.fillEllipse(17, 16, sx + 2, sy + 2);
      g.fillStyle(0x7e22ce, 1);
      g.fillCircle(17, 16, sy - 2);
      g.fillStyle(0xf0abfc, 1);
      g.fillCircle(13, 14, 2);
      g.fillCircle(21, 14, 2);
      g.generateTexture(k, 34, 30);
    };
    drawCrawler('crawler_0', 14, 10);
    drawCrawler('crawler_1', 12, 12);
    drawCrawler('crawler_2', 15, 9);

    const drawGolem = (k, bob) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.45);
      g.fillEllipse(18, 37, 16, 4);
      const cy = 18 + bob;
      g.fillStyle(0x0e7490, 1);
      g.fillTriangle(18, cy - 14, 8, cy, 28, cy);
      g.fillTriangle(18, cy + 14, 8, cy, 28, cy);
      g.fillStyle(0x06b6d4, 1);
      g.fillTriangle(18, cy - 12, 10, cy, 26, cy);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(18, cy, 2.5);
      g.generateTexture(k, 36, 40);
    };
    drawGolem('golem_0', 0);
    drawGolem('golem_1', -2);
    drawGolem('golem_2', 0);
    drawGolem('golem_3', 1.5);

    // 3.1 Теневой Фантом (заменил кристалл: теперь это парящий призрак в рваном саване с сияющими очами)
    const drawPhantom = (k, waveOffset) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.4);
      g.fillEllipse(18, 36, 16, 4);

      // Призрачный рваный балахон
      g.fillStyle(0x1e1b4b, 0.95);
      g.fillCircle(18, 14, 11);
      g.fillTriangle(7, 14, 29, 14, 18 + waveOffset, 33);
      g.fillTriangle(9, 16, 16, 34, 11, 20);
      g.fillTriangle(27, 16, 20, 34, 25, 20);

      // Внутреннее свечение призрака
      g.fillStyle(0x4338ca, 0.8);
      g.fillCircle(18, 14, 8);

      // Капюшон и темная глубина лица
      g.fillStyle(0x09090b, 1);
      g.fillEllipse(18, 14, 7, 8);

      // Зловещие сияющие эфирные глаза
      g.fillStyle(0x38bdf8, 1);
      g.fillCircle(15, 13, 2);
      g.fillCircle(21, 13, 2);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(15, 13, 0.8);
      g.fillCircle(21, 13, 0.8);

      // Призрачные когти/руки
      g.fillStyle(0x6366f1, 0.9);
      g.fillTriangle(6, 17, 12, 19, 4 + waveOffset * 0.5, 24);
      g.fillTriangle(30, 17, 24, 19, 32 + waveOffset * 0.5, 24);

      g.generateTexture(k, 36, 40);
    };
    drawPhantom('phantom_0', -2);
    drawPhantom('phantom_1', 0);
    drawPhantom('phantom_2', 2);
    // Дублируем для ключей cinder, чтобы не сломать возможные старые ссылки
    drawPhantom('cinder_0', -2);
    drawPhantom('cinder_1', 0);
    drawPhantom('cinder_2', 2);

    // 3.2 Костяной Рыцарь (Скелет с мечом)
    const drawSkeleton = (k, step) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.4);
      g.fillEllipse(17, 36, 14, 4);

      // Ноги
      g.fillStyle(0xd1d5db, 1);
      g.fillRect(12 + step, 24, 3, 11);
      g.fillRect(19 - step, 24, 3, 11);

      // Ребра и позвоночник
      g.fillStyle(0x9ca3af, 1);
      g.fillRect(16, 14, 3, 10);
      g.fillStyle(0xe5e7eb, 1);
      g.fillRect(12, 16, 10, 2);
      g.fillRect(13, 19, 8, 2);
      g.fillRect(14, 22, 6, 2);

      // Череп
      g.fillStyle(0xf3f4f6, 1);
      g.fillCircle(17, 9, 6.5);
      g.fillRect(14.5, 12, 5, 3);
      // Глазницы
      g.fillStyle(0x111827, 1);
      g.fillCircle(15, 8.5, 1.6);
      g.fillCircle(19, 8.5, 1.6);
      g.fillStyle(0xef4444, 0.9);
      g.fillCircle(15, 8.5, 0.7);
      g.fillCircle(19, 8.5, 0.7);

      // Ржавый меч
      g.fillStyle(0x64748b, 1);
      g.fillRect(24, 6 - step, 2.5, 16);
      g.fillStyle(0xb45309, 1);
      g.fillRect(22, 18 - step, 7, 2);

      g.generateTexture(k, 34, 40);
    };
    drawSkeleton('skeleton_0', 0);
    drawSkeleton('skeleton_1', 1.5);
    drawSkeleton('skeleton_2', -1.5);

    // 3.3 Каменная Горгулья (крылатая)
    const drawGargoyle = (k, wingY) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.4);
      g.fillEllipse(18, 35, 15, 4);

      // Каменные крылья летучей мыши
      g.fillStyle(0x334155, 1);
      g.fillTriangle(18, 14, 2, wingY, 10, 22);
      g.fillTriangle(18, 14, 34, wingY, 26, 22);

      // Каменное тело
      g.fillStyle(0x475569, 1);
      g.fillEllipse(18, 18, 8, 10);
      // Рогатая голова
      g.fillStyle(0x64748b, 1);
      g.fillCircle(18, 10, 6);
      g.fillTriangle(13, 8, 11, 2, 16, 6);
      g.fillTriangle(23, 8, 25, 2, 20, 6);

      // Горящие красные глаза
      g.fillStyle(0xef4444, 1);
      g.fillCircle(16, 9.5, 1.5);
      g.fillCircle(20, 9.5, 1.5);

      g.generateTexture(k, 36, 38);
    };
    drawGargoyle('gargoyle_0', 4);
    drawGargoyle('gargoyle_1', 8);
    drawGargoyle('gargoyle_2', 12);

    // 3.4 Пепельный Призрак / Жнец
    const drawWraith = (k, float) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.5);
      g.fillEllipse(20, 42, 18, 5);

      // Черный плащ с багровой каймой
      g.fillStyle(0x020617, 0.95);
      g.fillCircle(20, 16 + float, 12);
      g.fillTriangle(8, 16 + float, 32, 16 + float, 20, 39 + float);

      g.fillStyle(0x881337, 0.8);
      g.fillTriangle(12, 22 + float, 28, 22 + float, 20, 39 + float);

      // Капюшон
      g.fillStyle(0x000000, 1);
      g.fillCircle(20, 14 + float, 7);

      // Глаза
      g.fillStyle(0xf43f5e, 1);
      g.fillCircle(17.5, 14 + float, 1.8);
      g.fillCircle(22.5, 14 + float, 1.8);

      // Кровавая коса в руках
      g.fillStyle(0x475569, 1);
      g.fillRect(29, 4 + float, 2.5, 26);
      g.fillStyle(0xe11d48, 1);
      g.fillTriangle(14, 4 + float, 30, 4 + float, 30, 12 + float);

      g.generateTexture(k, 42, 46);
    };
    drawWraith('wraith_0', 0);
    drawWraith('wraith_1', -2);
    drawWraith('wraith_2', 1.5);

    // 3.5 Жнец Смерти (Гига-монстр на 35:00)
    const drawReaper = () => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.65);
      g.fillEllipse(36, 68, 44, 9);

      // Огромная теневая мантия Жнеца
      g.fillStyle(0x09090b, 1);
      g.fillCircle(36, 26, 20);
      g.fillTriangle(14, 26, 58, 26, 36, 65);
      g.fillTriangle(10, 30, 26, 64, 20, 40);
      g.fillTriangle(62, 30, 46, 64, 52, 40);

      // Внутренний саван
      g.fillStyle(0x18181b, 1);
      g.fillCircle(36, 24, 14);
      g.fillTriangle(22, 26, 50, 26, 36, 56);

      // Капюшон пустоты
      g.fillStyle(0x000000, 1);
      g.fillEllipse(36, 22, 10, 12);

      // Багровые неземные зрачки
      g.fillStyle(0xef4444, 1);
      g.fillCircle(32, 21, 2.8);
      g.fillCircle(40, 21, 2.8);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(32, 21, 1);
      g.fillCircle(40, 21, 1);

      // Гигантская Коса Смерти
      g.fillStyle(0x334155, 1);
      g.fillRect(56, 2, 4, 68);
      g.fillStyle(0xe2e8f0, 1);
      g.fillTriangle(12, 4, 60, 4, 60, 20);
      g.fillTriangle(12, 4, 30, 16, 60, 12);
      g.fillStyle(0xef4444, 0.85);
      g.fillTriangle(20, 6, 56, 6, 56, 14);

      g.generateTexture('reaper', 74, 76);
    };
    drawReaper();

    // Босс
    const gBoss = this.make.graphics({ x: 0, y: 0, add: false });
    gBoss.fillStyle(0x000000, 0.6);
    gBoss.fillEllipse(34, 62, 38, 8);
    gBoss.fillStyle(0x180523, 1);
    gBoss.fillCircle(34, 34, 28);
    gBoss.lineStyle(3, 0x8b5cf6, 0.9);
    gBoss.strokeCircle(34, 34, 30);
    gBoss.fillStyle(0xd946ef, 1);
    gBoss.fillCircle(34, 34, 8);
    gBoss.fillStyle(0xffffff, 1);
    gBoss.fillCircle(34, 34, 3.5);
    gBoss.generateTexture('boss', 68, 68);

    // 4. Текстуры снарядов оружия
    const gRift = this.make.graphics({ x: 0, y: 0, add: false });
    gRift.fillStyle(0x818cf8, 0.4);
    gRift.fillCircle(14, 8, 9);
    gRift.fillStyle(0x38bdf8, 0.9);
    gRift.fillTriangle(26, 8, 4, 1, 12, 8);
    gRift.fillTriangle(26, 8, 4, 15, 12, 8);
    gRift.fillStyle(0xffffff, 1);
    gRift.fillTriangle(25, 8, 8, 4, 14, 8);
    gRift.generateTexture('star_rift', 28, 16);

    const gMet = this.make.graphics({ x: 0, y: 0, add: false });
    gMet.fillStyle(0x7c2d12, 1);
    gMet.fillCircle(13, 13, 9);
    gMet.fillStyle(0xef4444, 1);
    gMet.fillCircle(13, 13, 6);
    gMet.fillStyle(0xfef08a, 1);
    gMet.fillCircle(11, 11, 3);
    gMet.generateTexture('meteor_rock', 26, 26);

    const gCrater = this.make.graphics({ x: 0, y: 0, add: false });
    gCrater.fillStyle(0x7c2d12, 0.8);
    gCrater.fillCircle(30, 30, 22);
    gCrater.fillStyle(0xf97316, 0.9);
    gCrater.fillCircle(30, 30, 12);
    gCrater.fillStyle(0xfef08a, 1);
    gCrater.fillCircle(30, 30, 5);
    gCrater.generateTexture('meteor_crater', 60, 60);

    const gTesla = this.make.graphics({ x: 0, y: 0, add: false });
    gTesla.fillStyle(0x38bdf8, 0.95);
    gTesla.fillCircle(10, 10, 6.5);
    gTesla.fillStyle(0xffffff, 1);
    gTesla.fillCircle(10, 10, 3.5);
    gTesla.generateTexture('tesla_orb', 20, 20);

    const gIce = this.make.graphics({ x: 0, y: 0, add: false });
    gIce.fillStyle(0xbae6fd, 0.9);
    gIce.fillTriangle(11, 1, 3, 11, 19, 11);
    gIce.fillTriangle(11, 21, 3, 11, 19, 11);
    gIce.fillStyle(0xffffff, 1);
    gIce.fillTriangle(11, 4, 6, 11, 16, 11);
    gIce.generateTexture('ice_spike', 22, 22);

    const gDagger = this.make.graphics({ x: 0, y: 0, add: false });
    gDagger.fillStyle(0xe2e8f0, 1);
    gDagger.fillRect(4, 7, 14, 3);
    gDagger.fillStyle(0x38bdf8, 1);
    gDagger.fillTriangle(18, 5, 24, 8.5, 18, 12);
    gDagger.generateTexture('dagger_proj', 26, 17);

    const gAxe = this.make.graphics({ x: 0, y: 0, add: false });
    gAxe.fillStyle(0x78350f, 1);
    gAxe.fillRect(11, 2, 4, 22);
    gAxe.fillStyle(0x94a3b8, 1);
    gAxe.fillCircle(8, 7, 7);
    gAxe.fillCircle(18, 7, 7);
    gAxe.generateTexture('orbit_axe', 26, 26);

    const gHammer = this.make.graphics({ x: 0, y: 0, add: false });
    gHammer.fillStyle(0xca8a04, 1);
    gHammer.fillRect(4, 4, 18, 12);
    gHammer.fillStyle(0xfef08a, 1);
    gHammer.fillRect(6, 6, 14, 8);
    gHammer.fillStyle(0x78350f, 1);
    gHammer.fillRect(11, 16, 4, 14);
    gHammer.generateTexture('holy_hammer', 26, 32);

    const gFlame = this.make.graphics({ x: 0, y: 0, add: false });
    gFlame.fillStyle(0xd97706, 0.4);
    gFlame.fillCircle(12, 12, 12);
    gFlame.fillStyle(0xf97316, 0.95);
    gFlame.fillCircle(12, 12, 9);
    gFlame.fillStyle(0xfef08a, 1);
    gFlame.fillCircle(12, 12, 5);
    gFlame.fillStyle(0xffffff, 1);
    gFlame.fillCircle(12, 12, 2);
    gFlame.generateTexture('flame_ball', 24, 24);

    const gFlask = this.make.graphics({ x: 0, y: 0, add: false });
    gFlask.fillStyle(0x78350f, 1);
    gFlask.fillRect(8, 2, 6, 3);
    gFlask.fillStyle(0x38bdf8, 0.85);
    gFlask.fillRect(9, 5, 4, 3);
    gFlask.fillStyle(0x0284c7, 0.5);
    gFlask.fillCircle(11, 14, 8);
    gFlask.fillStyle(0xfacc15, 0.95);
    gFlask.fillCircle(11, 15, 6);
    gFlask.fillStyle(0xffffff, 0.8);
    gFlask.fillCircle(8, 12, 2);
    gFlask.generateTexture('holy_flask', 22, 24);

    const gScythe = this.make.graphics({ x: 0, y: 0, add: false });
    // Рукоять / рукоятью
    gScythe.fillStyle(0x78350f, 1);
    gScythe.fillRect(22, 10, 3.5, 18);
    gScythe.fillRect(20, 10, 7, 4);
    // Основное лезвие косы
    gScythe.fillStyle(0xef4444, 0.95);
    gScythe.fillTriangle(2, 2, 26, 2, 26, 14);
    gScythe.fillTriangle(2, 2, 10, 12, 26, 8);
    // Блик на лезвии
    gScythe.fillStyle(0xfca5a5, 0.9);
    gScythe.fillTriangle(5, 3, 24, 3, 24, 10);
    gScythe.generateTexture('blood_scythe', 32, 30);

    const gShuriken = this.make.graphics({ x: 0, y: 0, add: false });
    gShuriken.fillStyle(0x64748b, 1);
    gShuriken.fillTriangle(9, 1, 17, 9, 9, 17);
    gShuriken.fillTriangle(1, 9, 17, 9, 9, 17);
    gShuriken.fillStyle(0x38bdf8, 1);
    gShuriken.fillCircle(9, 9, 3);
    gShuriken.generateTexture('shadow_shuriken', 18, 18);

    const gDisc = this.make.graphics({ x: 0, y: 0, add: false });
    gDisc.lineStyle(3, 0x06b6d4, 1);
    gDisc.strokeCircle(10, 10, 8);
    gDisc.fillStyle(0xffffff, 1);
    gDisc.fillCircle(10, 10, 3);
    gDisc.generateTexture('energy_disc', 20, 20);

    const gMine = this.make.graphics({ x: 0, y: 0, add: false });
    gMine.fillStyle(0x4338ca, 1);
    gMine.fillCircle(8, 8, 7);
    gMine.fillStyle(0xf43f5e, 1);
    gMine.fillCircle(8, 8, 3);
    gMine.generateTexture('grav_mine', 16, 16);

    const gRaven = this.make.graphics({ x: 0, y: 0, add: false });
    gRaven.fillStyle(0x1e293b, 1);
    gRaven.fillTriangle(10, 2, 2, 14, 18, 14);
    gRaven.generateTexture('raven_sprite', 20, 16);

    const gBolt = this.make.graphics({ x: 0, y: 0, add: false });
    gBolt.fillStyle(0xfef08a, 1);
    gBolt.fillRect(2, 4, 16, 3);
    gBolt.fillTriangle(18, 2, 24, 5.5, 18, 9);
    gBolt.generateTexture('light_bolt', 24, 11);

    // Частицы и кристаллы
    const gSpark = this.make.graphics({ x: 0, y: 0, add: false });
    gSpark.fillStyle(0x38bdf8, 0.9);
    gSpark.fillCircle(4, 4, 3.5);
    gSpark.fillStyle(0xffffff, 1);
    gSpark.fillCircle(4, 4, 1.5);
    gSpark.generateTexture('cosmic_spark', 8, 8);

    const gIceP = this.make.graphics({ x: 0, y: 0, add: false });
    gIceP.fillStyle(0x7dd3fc, 0.9);
    gIceP.fillCircle(3, 3, 3);
    gIceP.fillStyle(0xffffff, 1);
    gIceP.fillCircle(3, 3, 1.2);
    gIceP.generateTexture('ice_spark', 6, 6);

    const makeGem = (key, color) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.5);
      g.fillTriangle(7, 0, 0, 7, 14, 7);
      g.fillTriangle(7, 15, 0, 7, 14, 7);
      g.fillStyle(color, 1);
      g.fillTriangle(7, 1, 1, 7, 13, 7);
      g.fillTriangle(7, 14, 1, 7, 13, 7);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(7, 7, 2);
      g.generateTexture(key, 14, 16);
    };
    makeGem('gem_blue', 0x38bdf8);
    makeGem('gem_green', 0x10b981);
    makeGem('gem_red', 0xef4444);
  }

  create() {
    // 0. Анимации
    this.anims.create({
      key: 'knight_walk',
      frames: [{ key: 'knight_walk_0' }, { key: 'knight_walk_1' }, { key: 'knight_walk_2' }, { key: 'knight_walk_3' }],
      frameRate: 8,
      repeat: -1
    });
    this.anims.create({ key: 'knight_idle', frames: [{ key: 'knight_idle' }], frameRate: 1 });
    this.anims.create({
      key: 'crawler_crawl',
      frames: [{ key: 'crawler_0' }, { key: 'crawler_1' }, { key: 'crawler_2' }, { key: 'crawler_1' }],
      frameRate: 7,
      repeat: -1
    });
    this.anims.create({
      key: 'golem_walk',
      frames: [{ key: 'golem_0' }, { key: 'golem_1' }, { key: 'golem_2' }, { key: 'golem_3' }],
      frameRate: 6,
      repeat: -1
    });
    this.anims.create({
      key: 'phantom_hover',
      frames: [{ key: 'phantom_0' }, { key: 'phantom_1' }, { key: 'phantom_2' }, { key: 'phantom_1' }],
      frameRate: 6,
      repeat: -1
    });
    this.anims.create({
      key: 'cinder_flow',
      frames: [{ key: 'cinder_0' }, { key: 'cinder_1' }, { key: 'cinder_2' }, { key: 'cinder_1' }],
      frameRate: 6,
      repeat: -1
    });
    this.anims.create({
      key: 'skeleton_walk',
      frames: [{ key: 'skeleton_0' }, { key: 'skeleton_1' }, { key: 'skeleton_2' }, { key: 'skeleton_1' }],
      frameRate: 6,
      repeat: -1
    });
    this.anims.create({
      key: 'gargoyle_fly',
      frames: [{ key: 'gargoyle_0' }, { key: 'gargoyle_1' }, { key: 'gargoyle_2' }, { key: 'gargoyle_1' }],
      frameRate: 8,
      repeat: -1
    });
    this.anims.create({
      key: 'wraith_float',
      frames: [{ key: 'wraith_0' }, { key: 'wraith_1' }, { key: 'wraith_2' }, { key: 'wraith_1' }],
      frameRate: 5,
      repeat: -1
    });

    // 1. Бесшовный пол
    this.bg = this.add.tileSprite(0, 0, 4000, 4000, 'tile_floor').setDepth(0);

    // Парящие частицы звездной пыли
    this.add.particles(0, 0, 'cosmic_spark', {
      x: { min: -1500, max: 1500 },
      y: { min: -1500, max: 1500 },
      speedY: { min: -25, max: -8 },
      speedX: { min: -15, max: 15 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 3500,
      frequency: 250,
      depth: 2
    });

    // 2. Статы игрока
    this.playerStats = {
      hp: 100,
      maxHp: 100,
      speed: 200,
      magnetRadius: 130,
      level: 1,
      xp: 0,
      xpNext: 6,
      kills: 0,
      survivalTime: 0,
      gold: 0,
      regen: 0,
      critChance: 0.05,
      damageMultiplier: 1.0,
      cooldownMultiplier: 1.0,
      durationMultiplier: 1.0,
      projSpeedMultiplier: 1.0,
      extraProjectiles: 0,
      lifestealKillCount: 0,
      damageReduction: 0,
      luckBonus: 0,
      enemySlowPct: 0,
      skullBonusDmg: 0,
      quiverMultiplier: 1.0
    };

    // 3. Инвентарь забега: макс 8 оружий и 8 реликвий
    this.equippedWeapons = ['rift'];
    this.equippedRelics = [];

    // Инициализация структуры всех 16 оружий
    this.weapons = {};
    Object.keys(WEAPONS_DEF).forEach(id => {
      const def = WEAPONS_DEF[id];
      this.weapons[id] = {
        level: id === 'rift' ? 1 : 0,
        cooldown: def.baseCooldown,
        timer: 0,
        damage: def.baseDamage,
        isSynergy: false,
        count: 1,
        speed: 520,
        radius: 90,
        orb: null
      };
    });

    // Инициализация структуры всех 16 реликвий
    this.relics = {};
    Object.keys(RELICS_DEF).forEach(id => {
      this.relics[id] = { level: 0 };
    });

    // 4. Спрайт рыцаря
    this.player = this.physics.add.sprite(0, 0, 'knight_idle').setDepth(10);
    this.player.play('knight_idle');
    this.player.setCircle(13, 7, 9);
    this.player.setCollideWorldBounds(false);

    // 5. Камера: ЖЕСТКАЯ ПРИВЯЗКА (1, 1) ПОЛНОСТЬЮ УСТРАНЯЕТ МИКРО-ДВОЕНИЕ И ДРОЖАНИЕ!
    this.cameras.main.startFollow(this.player, false, 1, 1);

    const updateCameraZoom = (w, h) => {
      // Отдаляем камеру на узких экранах (<768px: 1.55 - 1.65, <480px: 1.45)
      let targetZoom = 1.85;
      if (w < 480) {
        targetZoom = 1.45;
      } else if (w < 768) {
        targetZoom = 1.6;
      } else if (w < 1000) {
        targetZoom = 1.75;
      }
      this.cameras.main.setZoom(targetZoom);
    };
    updateCameraZoom(window.innerWidth, window.innerHeight);

    // Адаптация под изменение размера экрана / мобильные экраны
    this.scale.on('resize', (gameSize) => {
      this.cameras.main.setSize(gameSize.width, gameSize.height);
      updateCameraZoom(gameSize.width, gameSize.height);
      if (this.bg) {
        this.bg.setSize(Math.max(4000, gameSize.width * 3), Math.max(4000, gameSize.height * 3));
      }
    });

    // 6. Физические группы
    this.enemies = this.physics.add.group();
    this.projectiles = this.physics.add.group();
    this.gems = this.physics.add.group();

    this.physics.add.overlap(this.projectiles, this.enemies, (proj, enemy) => this.hitEnemyWithProjectile(proj, enemy));
    this.physics.add.overlap(this.player, this.enemies, (player, enemy) => this.playerHit(enemy));
    this.physics.add.overlap(this.player, this.gems, (player, gem) => this.collectGem(gem));

    // 7. Управление (Клавиатура + Сенсорный виртуальный джойстик)
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });

    this.setupTouchJoystick();

    // 8. Таймеры и флаги
    this.spawnTimer = 0;
    this.spawnInterval = 1350;
    this.regenTimer = 0;
    this.magnetSphereTimer = 0;
    this.bossSpawned = false;
    this.reaperSpawned = false;
    this.spawnedBossCheckpoints = new Set();
    this.isPaused = false;
    this.isGameOver = false;

    // 9. Инициализация UI и слотов
    this.updateHUD();
    this.updateSurvivalTimer();
    this.updateInventoryRack();

    // Пауза и Гримуар (Гримуар доступен исключительно из меню паузы)
    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on('down', () => this.handleEscPress());

    const btnResume = document.getElementById('btnResume');
    if (btnResume) btnResume.addEventListener('click', () => this.togglePause());

    const btnRestartFromPause = document.getElementById('btnRestartFromPause');
    if (btnRestartFromPause) btnRestartFromPause.addEventListener('click', () => location.reload());

    const btnCodex = document.getElementById('btnCodex');
    if (btnCodex) btnCodex.addEventListener('click', () => this.openCodex('synergies'));

    const btnOpenCodexFromPause = document.getElementById('btnOpenCodexFromPause');
    if (btnOpenCodexFromPause) btnOpenCodexFromPause.addEventListener('click', () => this.openCodex('synergies'));

    const btnCloseCodex = document.getElementById('btnCloseCodex');
    if (btnCloseCodex) btnCloseCodex.addEventListener('click', () => this.closeCodex());

    // Вкладки Гримуара
    document.querySelectorAll('.codex-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', (e) => {
        document.querySelectorAll('.codex-tab').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');
        const tab = tabBtn.getAttribute('data-tab');
        this.renderCodexTab(tab);
      });
    });

    const enableAudioOnce = () => {
      SFX.ensure();
      window.removeEventListener('pointerdown', enableAudioOnce);
      window.removeEventListener('keydown', enableAudioOnce);
    };
    window.addEventListener('pointerdown', enableAudioOnce);
    window.addEventListener('keydown', enableAudioOnce);

    const btnPauseAudio = document.getElementById('btnPauseAudio');
    if (btnPauseAudio) {
      btnPauseAudio.addEventListener('click', (e) => {
        e.stopPropagation();
        SFX.toggle();
        this.updateAudioButtonUI();
      });
    }

    // Горячая клавиша M переключает звук
    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
        SFX.toggle();
        this.updateAudioButtonUI();
      }
    });

    document.getElementById('btnRestart').addEventListener('click', () => {
      location.reload();
    });

    // Клавиатурная навигация для меню паузы
    this.setupKeyboardNav();
    this.updateAudioButtonUI();
  }

  updateAudioButtonUI() {
    const btn = document.getElementById('btnPauseAudio');
    if (btn) {
      btn.textContent = SFX.muted ? 'ЗВУК: ВЫКЛ' : 'ЗВУК: ВКЛ';
      btn.style.borderColor = SFX.muted ? '#64748b' : '#38bdf8';
      btn.style.color = SFX.muted ? '#94a3b8' : '#e0f2fe';
    }
  }

  setupTouchJoystick() {
    // Сенсорный джойстик: появляется в месте касания пальцем на мобилке ИЛИ при зажатии ЛКМ на ПК
    this.joystick = { active: false, x: 0, y: 0, pointerId: null, originX: 0, originY: 0 };
    const maxRadius = 55;

    const isUITouch = (target) => {
      return target && (
        target.closest('#hud-overlay') ||
        target.closest('.modal-backdrop') ||
        target.closest('#codex-modal') ||
        target.closest('button') ||
        target.closest('input')
      );
    };

    const createJoystickEl = (cx, cy) => {
      let zone = document.getElementById('dynamic-joystick');
      if (!zone) {
        zone = document.createElement('div');
        zone.id = 'dynamic-joystick';
        zone.innerHTML = '<div id="dj-base"><div id="dj-knob"></div></div>';
        document.body.appendChild(zone);
      }
      zone.style.display = 'block';
      zone.style.left = `${cx - 65}px`;
      zone.style.top = `${cy - 65}px`;
      const knob = document.getElementById('dj-knob');
      if (knob) knob.style.transform = 'translate(-50%, -50%)';
    };

    const removeJoystick = () => {
      const el = document.getElementById('dynamic-joystick');
      if (el) el.style.display = 'none';
    };

    window.addEventListener('pointerdown', (e) => {
      if (this.joystick.active) return;
      if (e.button !== undefined && e.button !== 0) return; // Только основная кнопка мыши / пальца
      if (isUITouch(e.target)) return;
      if (this.isPaused || this.isGameOver) return;

      this.joystick.active = true;
      this.joystick.pointerId = e.pointerId;
      this.joystick.originX = e.clientX;
      this.joystick.originY = e.clientY;
      this.joystick.x = 0;
      this.joystick.y = 0;
      createJoystickEl(e.clientX, e.clientY);
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.joystick.active) return;
      if (e.pointerId !== this.joystick.pointerId) return;

      const dx = e.clientX - this.joystick.originX;
      const dy = e.clientY - this.joystick.originY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const clamped = Math.min(dist, maxRadius);

      this.joystick.x = (Math.cos(angle) * clamped) / maxRadius;
      this.joystick.y = (Math.sin(angle) * clamped) / maxRadius;

      const knob = document.getElementById('dj-knob');
      if (knob) {
        const kx = Math.cos(angle) * clamped;
        const ky = Math.sin(angle) * clamped;
        knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
      }
    });

    const endJoystick = (e) => {
      if (!this.joystick.active) return;
      if (e && e.pointerId !== undefined && e.pointerId !== this.joystick.pointerId) return;
      this.joystick.active = false;
      this.joystick.x = 0;
      this.joystick.y = 0;
      this.joystick.pointerId = null;
      removeJoystick();
    };

    window.addEventListener('pointerup', endJoystick);
    window.addEventListener('pointercancel', endJoystick);
  }

  setupKeyboardNav() {
    // Клавиатурная навигация меню паузы (Up/Down + Enter)
    this._pauseFocusIdx = 0;
    document.addEventListener('keydown', (e) => {
      const pauseModal = document.getElementById('pause-modal');
      if (!pauseModal || pauseModal.style.display !== 'flex') return;

      const btns = pauseModal.querySelectorAll('.pause-nav-btn');
      const updateFocus = () => {
        btns.forEach((b, i) => b.classList.toggle('pause-focused', i === this._pauseFocusIdx));
      };

      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this._pauseFocusIdx = Math.min(btns.length - 1, this._pauseFocusIdx + 1);
        updateFocus();
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        this._pauseFocusIdx = Math.max(0, this._pauseFocusIdx - 1);
        updateFocus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        btns[this._pauseFocusIdx]?.click();
      }
    });

    // Карты улучшения: клавиши 1/2/3, стрелки, Enter
    this._upgradeIdx = 0;
    document.addEventListener('keydown', (e) => {
      const lvlModal = document.getElementById('levelup-modal');
      if (!lvlModal || lvlModal.style.display !== 'flex') return;

      const cards = lvlModal.querySelectorAll('.upgrade-card');
      if (!cards.length) return;

      const focusCard = (idx) => {
        this._upgradeIdx = idx;
        cards.forEach((c, i) => c.classList.toggle('kb-focused', i === idx));
      };

      if (e.key === '1') { e.preventDefault(); cards[0]?.click(); return; }
      if (e.key === '2') { e.preventDefault(); cards[1]?.click(); return; }
      if (e.key === '3') { e.preventDefault(); cards[2]?.click(); return; }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        focusCard(Math.max(0, this._upgradeIdx - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        focusCard(Math.min(cards.length - 1, this._upgradeIdx + 1));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        cards[this._upgradeIdx]?.click();
      }
    });

    // Гримуар: стрелками переключаем вкладки
    document.addEventListener('keydown', (e) => {
      const codexModal = document.getElementById('codex-modal');
      if (!codexModal || codexModal.style.display !== 'flex') return;

      const tabs = Array.from(codexModal.querySelectorAll('.codex-tab'));
      if (e.key === '1') { e.preventDefault(); tabs[0]?.click(); return; }
      if (e.key === '2') { e.preventDefault(); tabs[1]?.click(); return; }
      if (e.key === '3') { e.preventDefault(); tabs[2]?.click(); return; }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const activeIdx = tabs.findIndex(t => t.classList.contains('active'));
        const nextIdx = e.key === 'ArrowRight'
          ? Math.min(tabs.length - 1, activeIdx + 1)
          : Math.max(0, activeIdx - 1);
        tabs[nextIdx]?.click();
        e.preventDefault();
      }
    });
  }

  handleEscPress() {
    const codexModal = document.getElementById('codex-modal');
    if (codexModal && codexModal.style.display === 'flex') {
      this.closeCodex();
      return;
    }
    this.togglePause();
  }

  togglePause() {
    if (this.isGameOver) return;
    const lvlModal = document.getElementById('levelup-modal');
    if (lvlModal && lvlModal.style.display === 'flex') return;

    const pauseModal = document.getElementById('pause-modal');
    if (!this.isPaused) {
      this.isPaused = true;
      this.physics.pause();
      this.updateAudioButtonUI();
      if (pauseModal) pauseModal.style.display = 'flex';
    } else {
      this.isPaused = false;
      this.physics.resume();
      if (pauseModal) pauseModal.style.display = 'none';
    }
  }

  openCodex(tab = 'synergies') {
    this.isPaused = true;
    this.physics.pause();
    const modal = document.getElementById('codex-modal');
    if (modal) modal.style.display = 'flex';

    document.querySelectorAll('.codex-tab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    this.renderCodexTab(tab);
  }

  closeCodex() {
    const modal = document.getElementById('codex-modal');
    if (modal) modal.style.display = 'none';

    // Гримуар открывается только из меню паузы — возвращаемся обратно в меню паузы
    const pauseModal = document.getElementById('pause-modal');
    if (pauseModal) pauseModal.style.display = 'flex';
    this.isPaused = true;
    this.physics.pause();
    this.updateAudioButtonUI();
  }

  renderCodexTab(tab) {
    const scroll = document.getElementById('codex-scroll');
    if (!scroll) return;
    scroll.innerHTML = '';

    if (tab === 'synergies') {
      Object.values(SYNERGIES_DEF).forEach(syn => {
        const item = document.createElement('div');
        item.className = 'codex-synergy-item';

        const wDef = WEAPONS_DEF[syn.weaponId];
        const rDef = RELICS_DEF[syn.relicId];

        item.innerHTML = `
          <div class="synergy-header">
            <div class="synergy-title-wrap">
              <div class="synergy-icon">${GAME_ICONS[syn.iconKey] || ''}</div>
              <div class="synergy-title">${syn.name}</div>
            </div>
            <span class="card-badge" style="position: static; margin-left: auto; background: #451a03; border-color: #f59e0b; color: #fef08a; padding: 2px 8px; font-size: 9px;">СУПЕРРАНГ</span>
          </div>
          <div class="synergy-recipe-row">
            <div class="recipe-tag">
              <div class="recipe-tag-icon">${GAME_ICONS[wDef.iconKey] || ''}</div>
              <span>${wDef.name} (Ур.5)</span>
            </div>
            <span class="recipe-plus">+</span>
            <div class="recipe-tag">
              <div class="recipe-tag-icon">${GAME_ICONS[rDef.iconKey] || ''}</div>
              <span>${rDef.name}</span>
            </div>
            <span class="recipe-arrow">➔</span>
            <span style="font-family:'Cinzel', serif; font-weight:900; color:#fef08a;">${syn.name}</span>
          </div>
          <p class="synergy-desc">${syn.desc}</p>
        `;
        scroll.appendChild(item);
      });
    } else if (tab === 'weapons') {
      const grid = document.createElement('div');
      grid.className = 'codex-items-grid';
      Object.values(WEAPONS_DEF).forEach(w => {
        const card = document.createElement('div');
        card.className = 'codex-item-card';
        const rDef = RELICS_DEF[w.partnerRelic];
        card.innerHTML = `
          <div class="codex-item-header">
            <div class="codex-item-icon">${GAME_ICONS[w.iconKey] || ''}</div>
            <div>
              <div class="codex-item-name">${w.name}</div>
              <span class="card-badge" style="position:static; padding:1px 5px; font-size:8px;">МАКС УР.5</span>
            </div>
          </div>
          <p class="codex-item-desc">${w.desc}</p>
          <div class="codex-item-partner">Партнер синергии: ${rDef ? rDef.name : '—'}</div>
        `;
        grid.appendChild(card);
      });
      scroll.appendChild(grid);
    } else if (tab === 'relics') {
      const grid = document.createElement('div');
      grid.className = 'codex-items-grid';
      Object.values(RELICS_DEF).forEach(r => {
        const card = document.createElement('div');
        card.className = 'codex-item-card';
        const wDef = WEAPONS_DEF[r.evolvesWeapon];
        card.innerHTML = `
          <div class="codex-item-header">
            <div class="codex-item-icon">${GAME_ICONS[r.iconKey] || ''}</div>
            <div>
              <div class="codex-item-name">${r.name}</div>
              <span class="card-badge" style="position:static; padding:1px 5px; font-size:8px; background:#1e1b4b; border-color:#818cf8; color:#c7d2fe;">РЕЛИКВИЯ</span>
            </div>
          </div>
          <p class="codex-item-desc">${r.desc}</p>
          <div class="codex-item-partner">Эволюционирует: ${wDef ? wDef.name : '—'}</div>
        `;
        grid.appendChild(card);
      });
      scroll.appendChild(grid);
    }
  }

  updateInventoryRack() {
    const wGrid = document.getElementById('weapon-slots-grid');
    const rGrid = document.getElementById('relic-slots-grid');
    const wCount = document.getElementById('weapon-count');
    const rCount = document.getElementById('relic-count');

    if (wCount) wCount.textContent = `${this.equippedWeapons.length}/8`;
    if (rCount) rCount.textContent = `${this.equippedRelics.length}/8`;

    if (wGrid) {
      wGrid.innerHTML = '';
      for (let i = 0; i < 8; i++) {
        const slot = document.createElement('div');
        slot.className = 'rack-slot';
        if (i < this.equippedWeapons.length) {
          const id = this.equippedWeapons[i];
          const wData = this.weapons[id];
          const def = WEAPONS_DEF[id];
          const isSyn = wData.isSynergy;
          slot.classList.add(isSyn ? 'synergy' : 'filled');
          slot.title = `${def.name} (${isSyn ? 'СУПЕР' : 'Ур.' + wData.level})`;
          slot.innerHTML = `
            <div class="rack-slot-icon">${GAME_ICONS[isSyn ? def.synergyKey : def.iconKey] || ''}</div>
            <div class="rack-slot-lvl">${isSyn ? '★' : wData.level}</div>
          `;
        } else {
          slot.classList.add('empty');
        }
        wGrid.appendChild(slot);
      }
    }

    if (rGrid) {
      rGrid.innerHTML = '';
      for (let i = 0; i < 8; i++) {
        const slot = document.createElement('div');
        slot.className = 'rack-slot';
        if (i < this.equippedRelics.length) {
          const id = this.equippedRelics[i];
          const rData = this.relics[id];
          const def = RELICS_DEF[id];
          slot.classList.add('filled');
          slot.title = `${def.name} (Ур.${rData.level})`;
          slot.innerHTML = `
            <div class="rack-slot-icon">${GAME_ICONS[def.iconKey] || ''}</div>
            <div class="rack-slot-lvl">${rData.level}</div>
          `;
        } else {
          slot.classList.add('empty');
        }
        rGrid.appendChild(slot);
      }
    }
  }

  update(time, delta) {
    if (this.isPaused || this.isGameOver) return;
    const dt = delta / 1000;

    // 1. Таймер выживания
    this.playerStats.survivalTime += dt;
    this.updateSurvivalTimer();

    // 2. Движение фона за игроком (синхронно, без задержки)
    this.bg.x = this.player.x;
    this.bg.y = this.player.y;
    this.bg.tilePositionX = this.player.x;
    this.bg.tilePositionY = this.player.y;

    // 3. Управление
    this.handleMovement();

    // 4. Поведение всех активных оружий
    this.updateWeapons(delta);

    // 5. Поведение врагов
    this.updateEnemies();

    // 6. Динамическое масштабирование лимита врагов и интервалов (как в Vampire Survivors)
    const t = this.playerStats.survivalTime;
    let maxEnemies = 18;
    let curSpawnInterval = 2400;

    if (t > 300) { // 5+ мин: появление первого босса и переход в среднюю фазу игры
      maxEnemies = Math.min(95, 68 + Math.floor((t - 300) / 25));
      curSpawnInterval = Math.max(950, 1300 - Math.floor((t - 300) / 10));
    } else if (t > 210) { // 3.5 - 5 мин: нарастание перед боссом
      maxEnemies = 52;
      curSpawnInterval = 1450;
    } else if (t > 120) { // 2 - 3.5 мин
      maxEnemies = 36;
      curSpawnInterval = 1750;
    } else if (t > 60) { // 1 - 2 мин
      maxEnemies = 26;
      curSpawnInterval = 2050;
    }

    this.spawnTimer += delta;
    if (this.spawnTimer >= curSpawnInterval) {
      this.spawnTimer = 0;
      if (this.enemies.countActive(true) < maxEnemies) {
        this.spawnEnemyWave();
      }
    }

    // 7. Магнетизм кристаллов опыта
    this.updateGems();

    // 8. Регенерация здоровья
    if (this.playerStats.regen > 0) {
      this.regenTimer += dt;
      if (this.regenTimer >= 1.0) {
        this.regenTimer = 0;
        this.healPlayer(this.playerStats.regen);
      }
    }

    // 9. Реликвия Сфера Притяжения: глобальный сбор начиная с 50 сек, -5с за каждый уровень
    if (this.equippedRelics.includes('magnet')) {
      this.magnetSphereTimer += dt;
      const magnetLevel = this.relics['magnet']?.level || 1;
      const magnetInterval = Math.max(10, 50 - (magnetLevel - 1) * 5);
      if (this.magnetSphereTimer >= magnetInterval) {
        this.magnetSphereTimer = 0;
        this.pullAllGemsToPlayer();
      }
    }

    // 10. Ограничение забега: максимум 35 минут (2100 сек) -> Приход Жнеца Смерти
    if (this.playerStats.survivalTime >= 2100 && !this.reaperSpawned) {
      this.reaperSpawned = true;
      this.spawnReaper();
    }
  }

  handleMovement() {
    const speed = this.playerStats.speed;
    this.player.body.setVelocity(0);

    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.left.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) vx += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) vy += 1;

    if (this.joystick && this.joystick.active) {
      const jDist = Math.hypot(this.joystick.x, this.joystick.y);
      if (jDist > 0.12) {
        vx = this.joystick.x;
        vy = this.joystick.y;
      }
    }

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy) || 1;
      const stickMag = (this.joystick && this.joystick.active)
        ? Math.min(1.0, Math.max(0.35, Math.hypot(this.joystick.x, this.joystick.y)))
        : 1.0;
      const normVx = (vx / len) * speed * stickMag;
      const normVy = (vy / len) * speed * stickMag;
      this.player.body.setVelocity(normVx, normVy);

      if (normVx < -5) this.player.setFlipX(true);
      else if (normVx > 5) this.player.setFlipX(false);

      this.player.play('knight_walk', true);
    } else {
      this.player.body.setVelocity(0, 0);
      this.player.play('knight_idle', true);
    }
  }

  pullAllGemsToPlayer() {
    this.gems.getChildren().forEach(g => {
      g.isPulled = true;
    });
    this.cameras.main.flash(180, 168, 85, 247);
    SFX.gem();
  }

  updateWeapons(delta) {
    const extraProj = this.playerStats.extraProjectiles;
    const cdMult = this.playerStats.cooldownMultiplier;

    this.equippedWeapons.forEach(wId => {
      const w = this.weapons[wId];
      if (!w || w.level <= 0) return;

      const effectiveCd = Math.max(220, w.cooldown * cdMult);
      w.timer += delta;

      if (w.timer >= effectiveCd) {
        w.timer = 0;
        this.fireWeapon(wId);
      }
    });

    // 1. Тесла-сфера: материализуем и плавно вращаем вокруг героя
    if (this.weapons.tesla && this.weapons.tesla.level > 0) {
      if (!this.weapons.tesla.orb || !this.weapons.tesla.orb.active) {
        this.weapons.tesla.orb = this.add.sprite(this.player.x + 65, this.player.y, 'tesla_orb')
          .setDepth(14);
      }
      this.teslaAngle = (this.teslaAngle || 0) + (delta / 1000) * 4.2;
      this.weapons.tesla.orb.x = this.player.x + Math.cos(this.teslaAngle) * 65;
      this.weapons.tesla.orb.y = this.player.y + Math.sin(this.teslaAngle) * 65;
      this.weapons.tesla.orb.rotation += 0.08;
    } else if (this.weapons.tesla && this.weapons.tesla.orb && this.weapons.tesla.orb.active) {
      this.weapons.tesla.orb.destroy();
      this.weapons.tesla.orb = null;
    }

    // 2. Священная аура: сияющий защитный купол вокруг героя с непрерывным уроном и отталкиванием
    if (this.weapons.aura && this.weapons.aura.level > 0) {
      const isSyn = this.weapons.aura.isSynergy;
      const baseRadius = (68 + (this.weapons.aura.level - 1) * 16) * this.playerStats.areaMultiplier;
      const radius = isSyn ? baseRadius * 1.5 : baseRadius;

      if (!this.auraCircle || !this.auraCircle.active) {
        this.auraCircle = this.add.circle(this.player.x, this.player.y, radius, isSyn ? 0x38bdf8 : 0xfbbf24, 0.16)
          .setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
        this.auraRing = this.add.arc(this.player.x, this.player.y, radius, 0, 360, false, undefined, 0, isSyn ? 0x0284c7 : 0xf59e0b, 0.45)
          .setDepth(6);
        this.auraRing.setStrokeStyle(2, isSyn ? 0x67e8f9 : 0xfef08a, 0.65);
      }

      this.auraCircle.setPosition(this.player.x, this.player.y);
      this.auraCircle.setRadius(radius);
      this.auraRing.setPosition(this.player.x, this.player.y);
      this.auraRing.setRadius(radius);
      this.auraRing.rotation += (delta / 1000) * 1.5;

      this.auraPulseTimer = (this.auraPulseTimer || 0) + delta;
      const pulse = Math.sin(this.auraPulseTimer * 0.005) * 0.04;
      this.auraCircle.setScale(1 + pulse);

      this.auraDamageTimer = (this.auraDamageTimer || 0) + delta;
      const tickInterval = isSyn ? 270 : 350;
      if (this.auraDamageTimer >= tickInterval) {
        this.auraDamageTimer = 0;
        let hitAny = false;
        const auraDmg = Math.round(this.weapons.aura.damage * this.playerStats.damageMultiplier);

        this.enemies.getChildren().forEach(e => {
          if (!e.active) return;
          const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
          if (d <= radius) {
            hitAny = true;
            this.damageEnemy(e, auraDmg, isSyn ? '#38bdf8' : '#fbbf24');
            const pushAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, e.x, e.y);
            e.x += Math.cos(pushAngle) * (isSyn ? 16 : 9);
            e.y += Math.sin(pushAngle) * (isSyn ? 16 : 9);
            if (isSyn && Math.random() < 0.08) {
              this.healPlayer(1);
            }
          }
        });

        if (hitAny) {
          SFX.aura();
        }
      }
    } else if (this.auraCircle && this.auraCircle.active) {
      this.auraCircle.destroy();
      this.auraCircle = null;
      if (this.auraRing && this.auraRing.active) {
        this.auraRing.destroy();
        this.auraRing = null;
      }
    }

    // 3. Орбитальные топоры: если активная группа, вращаем и проверяем коллизии
    if (this.orbitAxesGroup && this.orbitAxesGroup.getLength() > 0) {
      this.axesAngle = (this.axesAngle || 0) + (delta / 1000) * 4.2;
      this.orbitAxesGroup.getChildren().forEach((axe, i) => {
        if (!axe.active) return;
        const total = this.orbitAxesGroup.getLength();
        const a = this.axesAngle + (Math.PI * 2 / total) * i;
        const dist = axe.orbitRadius !== undefined ? axe.orbitRadius : 65;
        axe.x = this.player.x + Math.cos(a) * dist;
        axe.y = this.player.y + Math.sin(a) * dist;
        axe.rotation += 0.32;

        // Проверка коллизий
        if (axe.alpha > 0.2 && dist > 10) {
          this.enemies.getChildren().forEach(e => {
            if (Phaser.Math.Distance.Between(axe.x, axe.y, e.x, e.y) < 32) {
              if (!e._lastAxeHit || this.time.now - e._lastAxeHit > 200) {
                e._lastAxeHit = this.time.now;
                this.damageEnemy(e, this.orbitAxesDamage || 65, '#d97706');
              }
            }
          });
        }
      });
    }
  }

  fireWeapon(wId) {
    const w = this.weapons[wId];
    const isSyn = w.isSynergy;
    const dmgMult = this.playerStats.damageMultiplier;
    const extraProj = this.playerStats.extraProjectiles;
    const dmg = Math.floor(w.damage * dmgMult);

    switch (wId) {
      case 'rift':
        this.fireStarRifts(dmg, w.count + extraProj, isSyn);
        break;
      case 'meteor':
        this.castMeteors(dmg, w.count + (isSyn ? 3 : 0), isSyn);
        break;
      case 'tesla':
        this.dischargeTeslaChains(dmg, isSyn);
        break;
      case 'frost':
        this.castFrostNova(dmg, 10 + (isSyn ? 10 : 0) + extraProj * 2, isSyn);
        break;
      case 'solar':
        this.castSolarBeam(dmg, isSyn);
        break;
      case 'daggers':
        this.fireDaggers(dmg, 3 + extraProj * 2, isSyn);
        break;
      case 'spores':
        this.castSpores(dmg, isSyn);
        break;
      case 'axes':
        this.fireOrbitAxes(dmg, isSyn);
        break;
      case 'hammer':
        this.castHolyHammers(dmg, 1 + extraProj, isSyn);
        break;
      case 'flame':
        this.fireGreatFireball(dmg, 1 + extraProj, isSyn);
        break;
      case 'scythe':
        this.castBloodScythe(dmg, isSyn);
        break;
      case 'shurikens':
        this.fireShurikens(dmg, 2 + extraProj, isSyn);
        break;
      case 'aura':
        this.pulseHolyAura(dmg, isSyn);
        break;
      case 'mines':
        this.dropGravityMines(dmg, isSyn);
        break;
      case 'ravens':
        this.launchRavenAttack(dmg, 3 + extraProj, isSyn);
        break;
      case 'flask':
        this.throwHolyFlask(dmg, 1 + extraProj, isSyn);
        break;
    }
  }

  // --- РЕАЛИЗАЦИЯ ОРУЖИЙ И СИНЕРГИЙ ---
  fireStarRifts(damage, count, isSyn) {
    const enemies = this.enemies.getChildren();
    let baseAngle = this.player.flipX ? Math.PI : 0;
    if (enemies.length > 0) {
      const sorted = [...enemies].sort((a, b) => Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y) - Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y));
      baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, sorted[0].x, sorted[0].y);
    }

    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.24;
      const angle = baseAngle + spread;
      const rift = this.projectiles.create(this.player.x, this.player.y, 'star_rift');
      rift.setBlendMode(Phaser.BlendModes.ADD);
      rift.setCircle(8, 6, 0);
      rift.damage = damage;
      rift.weaponType = isSyn ? 'infinite_rift' : 'rift';
      rift.rotation = angle;
      const spd = (520 + (isSyn ? 120 : 0)) * this.playerStats.projSpeedMultiplier;
      rift.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);

      // Космический шлейф звездной пыли
      const trailTimer = this.time.addEvent({
        delay: 70,
        repeat: 18,
        callback: () => {
          if (!rift || !rift.active) { trailTimer.remove(); return; }
          const star = this.add.circle(rift.x, rift.y, isSyn ? 3 : 2, isSyn ? 0xc084fc : 0x818cf8, 0.9)
            .setDepth(18).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: star,
            scale: 0,
            alpha: 0,
            duration: 250,
            onComplete: () => star.destroy()
          });
        }
      });

      this.time.delayedCall(1500, () => {
        if (rift && rift.active) {
          if (isSyn) this.spawnSingularity(rift.x, rift.y, damage * 1.5);
          else this.spawnImplosionRipple(rift.x, rift.y);
          rift.destroy();
        }
      });
    }
    SFX.rift();
  }

  spawnSingularity(x, y, damage) {
    const hole = this.add.circle(x, y, 18, 0x000000, 1).setDepth(20);
    const ring = this.add.circle(x, y, 24, 0x8b5cf6, 0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(19);

    // Втягивающиеся космические частицы в горизонт событий
    for (let p = 0; p < 8; p++) {
      const pAng = Math.random() * Math.PI * 2;
      const pDist = Phaser.Math.Between(50, 110);
      const dot = this.add.circle(x + Math.cos(pAng) * pDist, y + Math.sin(pAng) * pDist, 3, 0xc084fc, 0.8)
        .setDepth(21).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: dot,
        x: x,
        y: y,
        scale: 0.1,
        alpha: 0.1,
        duration: 550,
        ease: 'Cubic.easeIn',
        onComplete: () => dot.destroy()
      });
    }

    this.tweens.add({
      targets: [hole, ring],
      scale: 2.2,
      duration: 700,
      yoyo: true,
      onUpdate: () => {
        this.enemies.getChildren().forEach(e => {
          if (Phaser.Math.Distance.Between(x, y, e.x, e.y) < 140) {
            const ang = Phaser.Math.Angle.Between(e.x, e.y, x, y);
            e.x += Math.cos(ang) * 4;
            e.y += Math.sin(ang) * 4;
          }
        });
      },
      onComplete: () => {
        this.enemies.getChildren().forEach(e => {
          if (Phaser.Math.Distance.Between(x, y, e.x, e.y) < 140) {
            this.damageEnemy(e, damage, '#c084fc');
          }
        });
        hole.destroy();
        ring.destroy();
      }
    });
  }

  spawnImplosionRipple(x, y) {
    const ring = this.add.circle(x, y, 26, 0x818cf8, 0).setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
    ring.setStrokeStyle(3, 0x818cf8, 0.9);
    this.tweens.add({
      targets: ring,
      scaleX: 0.08,
      scaleY: 0.08,
      alpha: 0.2,
      duration: 180,
      ease: 'Cubic.easeIn',
      onComplete: () => ring.destroy()
    });
  }

  getVisibleBounds() {
    const cam = this.cameras.main;
    const zoom = cam.zoom || 1;
    return {
      hw: (cam.width / zoom) * 0.5,
      hh: (cam.height / zoom) * 0.5
    };
  }

  getEnemiesInView() {
    const { hw, hh } = this.getVisibleBounds();
    return this.enemies.getChildren().filter(e => {
      return e.active &&
        Math.abs(e.x - this.player.x) <= hw + 25 &&
        Math.abs(e.y - this.player.y) <= hh + 25;
    });
  }

  castMeteors(damage, count, isSyn) {
    const { hw, hh } = this.getVisibleBounds();

    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 180, () => {
        const inView = this.getEnemiesInView();
        let tx, ty;
        if (inView.length > 0) {
          const target = Phaser.Utils.Array.GetRandom(inView);
          tx = target.x + (Math.random() * 30 - 15);
          ty = target.y + (Math.random() * 30 - 15);
        } else {
          tx = this.player.x + Phaser.Math.Between(-hw * 0.7, hw * 0.7);
          ty = this.player.y + Phaser.Math.Between(-hh * 0.7, hh * 0.7);
        }

        const rock = this.add.sprite(tx - 120, ty - 260, 'meteor_rock').setDepth(25);
        this.tweens.add({
          targets: rock,
          x: tx,
          y: ty,
          duration: 380,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            rock.destroy();
            this.cameras.main.shake(100, 0.004);
            SFX.meteor();

            // 1. Огненная расширяющаяся ударная волна
            const maxR = isSyn ? 190 : 115;
            const fieryWave = this.add.circle(tx, ty, 10, isSyn ? 0xef4444 : 0xf97316, 0.25)
              .setDepth(24).setBlendMode(Phaser.BlendModes.ADD);
            fieryWave.setStrokeStyle(4, 0xfef08a, 1);
            this.tweens.add({
              targets: fieryWave,
              scaleX: maxR / 10,
              scaleY: maxR / 10,
              alpha: 0,
              duration: 420,
              ease: 'Cubic.easeOut',
              onComplete: () => fieryWave.destroy()
            });

            // 2. Разлетающиеся горящие раскаленные осколки
            const emberCount = isSyn ? 22 : 14;
            const emberColors = [0xfef08a, 0xf97316, 0xef4444];
            for (let eIdx = 0; eIdx < emberCount; eIdx++) {
              const eAng = Math.random() * Math.PI * 2;
              const eDist = Phaser.Math.Between(25, maxR);
              const col = Phaser.Utils.Array.GetRandom(emberColors);
              const ember = this.add.circle(tx, ty, Phaser.Math.Between(2, 4), col, 1).setDepth(25).setBlendMode(Phaser.BlendModes.ADD);
              this.tweens.add({
                targets: ember,
                x: tx + Math.cos(eAng) * eDist,
                y: ty + Math.sin(eAng) * eDist + Phaser.Math.Between(5, 25),
                scale: 0,
                alpha: 0,
                duration: Phaser.Math.Between(340, 580),
                ease: 'Cubic.easeOut',
                onComplete: () => ember.destroy()
              });
            }

            const crater = this.add.sprite(tx, ty, 'meteor_crater').setDepth(3).setScale(isSyn ? 1.8 : 1.2);
            this.tweens.add({
              targets: crater,
              alpha: 0,
              duration: 1600,
              onComplete: () => crater.destroy()
            });

            const radius = isSyn ? 170 : 100;
            this.enemies.getChildren().forEach(e => {
              if (Phaser.Math.Distance.Between(tx, ty, e.x, e.y) <= radius) {
                this.damageEnemy(e, damage, '#f97316');
              }
            });
          }
        });
      });
    }
  }

  dischargeTeslaChains(damage, isSyn) {
    const enemies = this.enemies.getChildren();
    if (enemies.length === 0) return;
    const orb = this.weapons.tesla.orb || this.player;

    const maxChains = isSyn ? 12 : (this.weapons.tesla.chains || 3);
    const inRange = enemies.filter(e => Phaser.Math.Distance.Between(orb.x, orb.y, e.x, e.y) < (isSyn ? 380 : 250));
    if (inRange.length === 0) return;

    const hit = inRange.slice(0, maxChains);
    const g = this.add.graphics().setDepth(26);
    g.setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(isSyn ? 4 : 2.5, isSyn ? 0xf43f5e : 0x38bdf8, 1);

    let lastPt = { x: orb.x, y: orb.y };
    hit.forEach(e => {
      // Искрящиеся молниевые сегменты с изломами
      g.beginPath();
      g.moveTo(lastPt.x, lastPt.y);
      const dist = Phaser.Math.Distance.Between(lastPt.x, lastPt.y, e.x, e.y);
      const steps = Math.max(3, Math.floor(dist / 22));
      for (let s = 1; s < steps; s++) {
        const frac = s / steps;
        const jx = (Math.random() - 0.5) * 16;
        const jy = (Math.random() - 0.5) * 16;
        g.lineTo(Phaser.Math.Linear(lastPt.x, e.x, frac) + jx, Phaser.Math.Linear(lastPt.y, e.y, frac) + jy);
      }
      g.lineTo(e.x, e.y);
      g.strokePath();

      // Плазменная вспышка в точке удара
      const sparkNode = this.add.circle(e.x, e.y, isSyn ? 7 : 5, isSyn ? 0xf43f5e : 0x67e8f9, 1)
        .setDepth(27).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: sparkNode,
        scale: 2.2,
        alpha: 0,
        duration: 160,
        onComplete: () => sparkNode.destroy()
      });

      this.damageEnemy(e, damage, isSyn ? '#f43f5e' : '#38bdf8');
      lastPt = { x: e.x, y: e.y };
    });

    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 150,
      onComplete: () => g.destroy()
    });
    SFX.tesla();
  }

  castFrostNova(damage, count, isSyn) {
    const speed = (isSyn ? 460 : 380) * this.playerStats.projSpeedMultiplier;
    const novaR = isSyn ? 250 : 165;

    // 1. Расширяющаяся ледяная морозная волна
    const frostWave = this.add.circle(this.player.x, this.player.y, 15, 0x38bdf8, 0.2)
      .setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
    frostWave.setStrokeStyle(3.5, 0xbae6fd, 0.9);
    this.tweens.add({
      targets: frostWave,
      scaleX: novaR / 15,
      scaleY: novaR / 15,
      alpha: 0,
      duration: 480,
      ease: 'Cubic.easeOut',
      onComplete: () => frostWave.destroy()
    });

    // 2. Искрящиеся осколки льда
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.Between(40, novaR);
      const shard = this.add.rectangle(this.player.x, this.player.y, 4, 9, 0xbae6fd, 0.9)
        .setDepth(20).setBlendMode(Phaser.BlendModes.ADD);
      shard.rotation = a;
      this.tweens.add({
        targets: shard,
        x: this.player.x + Math.cos(a) * d,
        y: this.player.y + Math.sin(a) * d,
        scale: 0,
        alpha: 0,
        duration: Phaser.Math.Between(320, 500),
        ease: 'Quad.easeOut',
        onComplete: () => shard.destroy()
      });
    }

    // 3. Выстрелы ледяными шипами
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i;
      const spike = this.projectiles.create(this.player.x, this.player.y, 'ice_spike');
      spike.setBlendMode(Phaser.BlendModes.ADD);
      spike.rotation = angle + Math.PI / 2;
      spike.damage = damage;
      spike.weaponType = isSyn ? 'absolute_zero' : 'frost';
      spike.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

      this.time.delayedCall(1100, () => {
        if (spike && spike.active) spike.destroy();
      });
    }
    SFX.frost();
  }

  castSolarBeam(damage, isSyn) {
    const enemies = this.enemies.getChildren();
    if (enemies.length === 0) return;

    const sorted = [...enemies].sort((a, b) => Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y) - Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y));
    const target = sorted[0];
    const baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);

    const gBeam = this.add.graphics().setDepth(28);
    gBeam.setBlendMode(Phaser.BlendModes.ADD);
    SFX.solar();

    const beamLen = isSyn ? 560 : 440;
    const dur = isSyn ? 1200 : 750;
    const start = this.time.now;

    this.time.addEvent({
      delay: 30,
      repeat: Math.floor(dur / 30),
      callback: () => {
        const prog = (this.time.now - start) / dur;
        const curAngle = baseAngle - 0.35 + prog * 0.7;

        gBeam.clear();
        // Внешнее свечение
        gBeam.lineStyle(isSyn ? 28 : 16, 0xf59e0b, 0.55);
        gBeam.beginPath();
        gBeam.moveTo(this.player.x, this.player.y);
        gBeam.lineTo(this.player.x + Math.cos(curAngle) * beamLen, this.player.y + Math.sin(curAngle) * beamLen);
        gBeam.strokePath();

        // Центральный раскаленный сердечник
        gBeam.lineStyle(isSyn ? 12 : 6, 0xffffff, 1);
        gBeam.beginPath();
        gBeam.moveTo(this.player.x, this.player.y);
        gBeam.lineTo(this.player.x + Math.cos(curAngle) * beamLen, this.player.y + Math.sin(curAngle) * beamLen);
        gBeam.strokePath();

        const line = new Phaser.Geom.Line(this.player.x, this.player.y, this.player.x + Math.cos(curAngle) * beamLen, this.player.y + Math.sin(curAngle) * beamLen);
        this.enemies.getChildren().forEach(e => {
          if (Phaser.Geom.Intersects.LineToCircle(line, new Phaser.Geom.Circle(e.x, e.y, 20))) {
            if (!e._lastLaserHit || this.time.now - e._lastLaserHit > 160) {
              e._lastLaserHit = this.time.now;
              this.damageEnemy(e, Math.ceil(damage * 0.35), '#fde047');

              // Термические искры при лазерном прожигании
              const flare = this.add.circle(e.x, e.y, 4, 0xfef08a, 1).setDepth(29).setBlendMode(Phaser.BlendModes.ADD);
              this.tweens.add({
                targets: flare,
                scale: 2.2,
                alpha: 0,
                duration: 140,
                onComplete: () => flare.destroy()
              });
            }
          }
        });

        if (prog >= 1) gBeam.destroy();
      }
    });
  }

  fireDaggers(damage, count, isSyn) {
    const angle = this.player.body.velocity.length() > 5
      ? Math.atan2(this.player.body.velocity.y, this.player.body.velocity.x)
      : (this.player.flipX ? Math.PI : 0);

    for (let i = 0; i < count; i++) {
      const sp = (i - (count - 1) / 2) * 0.16;
      const a = angle + sp;
      const d = this.projectiles.create(this.player.x, this.player.y, 'dagger_proj');
      d.rotation = a;
      d.damage = isSyn ? damage * 2 : damage;
      d.weaponType = isSyn ? 'death_dance' : 'daggers';
      const spd = 620 * this.playerStats.projSpeedMultiplier;
      d.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);

      // Свистящий металлический след за кинжалом
      const daggerTrail = this.time.addEvent({
        delay: 50,
        repeat: 12,
        callback: () => {
          if (!d || !d.active) { daggerTrail.remove(); return; }
          const streak = this.add.circle(d.x, d.y, 2, isSyn ? 0x38bdf8 : 0xffffff, 0.7)
            .setDepth(17).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: streak,
            scale: 0,
            alpha: 0,
            duration: 160,
            onComplete: () => streak.destroy()
          });
        }
      });

      this.time.delayedCall(1200, () => { if (d && d.active) d.destroy(); });
    }
    SFX.dagger();
  }

  castSpores(damage, isSyn) {
    const cloud = this.add.circle(this.player.x, this.player.y, isSyn ? 70 : 45, 0x16a34a, 0.45).setDepth(6);
    
    // Всплывающие токсичные пузырьки спор
    const bubbleTimer = this.time.addEvent({
      delay: 180,
      repeat: Math.floor((isSyn ? 3500 : 2200) / 180),
      callback: () => {
        if (!cloud || !cloud.active) { bubbleTimer.remove(); return; }
        const r = (cloud.radius * cloud.scaleX) * Math.sqrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        const bX = cloud.x + r * Math.cos(theta);
        const bY = cloud.y + r * Math.sin(theta);
        const bubble = this.add.circle(bX, bY, Phaser.Math.Between(2, 5), 0x4ade80, 0.8)
          .setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: bubble,
          y: bY - 14,
          scale: 1.4,
          alpha: 0,
          duration: 380,
          ease: 'Sine.easeOut',
          onComplete: () => bubble.destroy()
        });
      }
    });

    this.tweens.add({
      targets: cloud,
      scale: 1.4,
      alpha: 0,
      duration: isSyn ? 3500 : 2200,
      onUpdate: () => {
        this.enemies.getChildren().forEach(e => {
          if (Phaser.Math.Distance.Between(cloud.x, cloud.y, e.x, e.y) < cloud.radius * cloud.scaleX) {
            if (!e._lastSpore || this.time.now - e._lastSpore > 300) {
              e._lastSpore = this.time.now;
              this.damageEnemy(e, damage, '#4ade80');
            }
          }
        });
      },
      onComplete: () => cloud.destroy()
    });
    SFX.spores();
  }

  fireOrbitAxes(damage, isSyn) {
    const count = isSyn ? 4 : (this.weapons.axes.count || 2);
    this.orbitAxesDamage = damage;
    const baseRadius = isSyn ? 95 : 70;

    // Сбросить старый таймер отзыва, если еще тикал
    if (this._axesRetractTimer) {
      this._axesRetractTimer.remove(false);
      this._axesRetractTimer = null;
    }

    // Очистить старую группу топоров
    if (this.orbitAxesGroup) {
      this.orbitAxesGroup.clear(true, true);
    } else {
      this.orbitAxesGroup = this.add.group();
    }

    // Создать новые топоры
    for (let i = 0; i < count; i++) {
      const axe = this.add.sprite(this.player.x, this.player.y, 'orbit_axe').setDepth(12);
      if (isSyn) axe.setTint(0xf59e0b);
      axe.orbitRadius = 15;
      axe.alpha = 0;
      axe.setScale(0.4);

      // Фаза 1: плавное раскрытие от персонажа на рабочую орбиту
      this.tweens.add({
        targets: axe,
        orbitRadius: baseRadius,
        alpha: 1,
        scale: isSyn ? 1.4 : 1.0,
        duration: 350,
        ease: 'Back.easeOut'
      });

      this.orbitAxesGroup.add(axe);
    }

    // Фаза 2 и 3: после 2.4 сек активного кружения — спиральное втягивание в центр персонажа с затуханием
    this._axesRetractTimer = this.time.delayedCall(2400, () => {
      if (!this.orbitAxesGroup || this.orbitAxesGroup.getLength() === 0) return;
      this.orbitAxesGroup.getChildren().forEach(axe => {
        this.tweens.add({
          targets: axe,
          orbitRadius: 0,
          alpha: 0,
          scale: 0.1,
          duration: 800,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            if (axe.active) axe.destroy();
          }
        });
      });
    });

    SFX.axes();
  }

  castHolyHammers(damage, count, isSyn) {
    const { hw, hh } = this.getVisibleBounds();
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 140, () => {
        const inView = this.getEnemiesInView();
        let hx, hy;
        if (inView.length > 0) {
          const target = Phaser.Utils.Array.GetRandom(inView);
          hx = target.x;
          hy = target.y;
        } else {
          hx = this.player.x + Phaser.Math.Between(-hw * 0.6, hw * 0.6);
          hy = this.player.y + Phaser.Math.Between(-hh * 0.6, hh * 0.6);
        }

        const ham = this.add.sprite(hx, hy - 140, 'holy_hammer').setDepth(26);
        this.tweens.add({
          targets: ham,
          y: hy,
          duration: 260,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            ham.destroy();
            this.cameras.main.shake(90, 0.0035);
            SFX.hammer();

            const radius = isSyn ? 165 : 95;

            // 1. Священная расширяющаяся золотая ударная волна
            const holyWave = this.add.circle(hx, hy, 8, 0xfacc15, 0.25)
              .setDepth(24).setBlendMode(Phaser.BlendModes.ADD);
            holyWave.setStrokeStyle(4, 0xfef08a, 1);
            this.tweens.add({
              targets: holyWave,
              scaleX: radius / 8,
              scaleY: radius / 8,
              alpha: 0,
              duration: 380,
              ease: 'Cubic.easeOut',
              onComplete: () => holyWave.destroy()
            });

            // 2. Священные трещины и лучи разлома земли
            const crackG = this.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
            crackG.lineStyle(isSyn ? 3 : 2, 0xfef08a, 1);
            const crackCount = isSyn ? 8 : 6;
            const maxDist = isSyn ? 110 : 70;
            for (let c = 0; c < crackCount; c++) {
              const cAng = (Math.PI * 2 / crackCount) * c + (Math.random() * 0.3 - 0.15);
              crackG.beginPath();
              crackG.moveTo(hx, hy);
              const segments = 3;
              for (let s = 1; s <= segments; s++) {
                const segDist = (maxDist / segments) * s;
                const jx = (Math.random() - 0.5) * 10;
                const jy = (Math.random() - 0.5) * 10;
                crackG.lineTo(hx + Math.cos(cAng) * segDist + jx, hy + Math.sin(cAng) * segDist + jy);
              }
              crackG.strokePath();
            }
            this.tweens.add({
              targets: crackG,
              alpha: 0,
              duration: isSyn ? 650 : 450,
              onComplete: () => crackG.destroy()
            });

            // 3. Золотые искры и частицы божественного сияния
            const sparkCount = isSyn ? 18 : 12;
            for (let p = 0; p < sparkCount; p++) {
              const spAng = Math.random() * Math.PI * 2;
              const spDist = Math.random() * radius;
              const spark = this.add.circle(hx, hy, isSyn ? 3.5 : 2.5, 0xfef08a, 1)
                .setDepth(25).setBlendMode(Phaser.BlendModes.ADD);
              this.tweens.add({
                targets: spark,
                x: hx + Math.cos(spAng) * spDist,
                y: hy + Math.sin(spAng) * spDist,
                scale: 0,
                alpha: 0,
                duration: Phaser.Math.Between(260, 420),
                ease: 'Quad.easeOut',
                onComplete: () => spark.destroy()
              });
            }

            this.enemies.getChildren().forEach(e => {
              if (Phaser.Math.Distance.Between(hx, hy, e.x, e.y) <= radius) {
                this.damageEnemy(e, damage, '#facc15');
              }
            });
          }
        });
      });
    }
  }

  fireGreatFireball(damage, count, isSyn) {
    const live = this.enemies.getChildren().filter(e => e.active);
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 140, () => {
        let tx = this.player.x + (this.player.flipX ? -280 : 280);
        let ty = this.player.y + (Math.random() - 0.5) * 80;

        if (live.length > 0) {
          const sorted = [...live].sort((a, b) => 
            Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y) -
            Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y)
          ).slice(0, 6);
          const chosen = Phaser.Utils.Array.GetRandom(sorted);
          if (chosen && chosen.active) {
            tx = chosen.x;
            ty = chosen.y;
          }
        }

        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, tx, ty);
        const b = this.projectiles.create(this.player.x, this.player.y, 'flame_ball');
        b.damage = damage;
        b.weaponType = isSyn ? 'inferno_vortex' : 'flame';
        b.setScale(isSyn ? 1.6 : 1.2);
        const spd = 460 * this.playerStats.projSpeedMultiplier;
        b.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);

        // Пылающий шлейф летящего огненного шара
        const flameTrail = this.time.addEvent({
          delay: 35,
          repeat: 36,
          callback: () => {
            if (!b || !b.active) { flameTrail.remove(); return; }
            const spark = this.add.circle(
              b.x + (Math.random() - 0.5) * 8, 
              b.y + (Math.random() - 0.5) * 8, 
              isSyn ? 5 : 3.5, 
              isSyn ? 0xf43f5e : 0xf97316, 
              0.85
            ).setDepth(18).setBlendMode(Phaser.BlendModes.ADD);

            this.tweens.add({
              targets: spark,
              scale: 0.1,
              alpha: 0,
              duration: 180,
              onComplete: () => spark.destroy()
            });
          }
        });

        this.time.delayedCall(1350, () => {
          if (b && b.active) {
            this.detonateFireball(b.x, b.y, damage, isSyn);
            b.destroy();
          }
        });
      });
    }
    SFX.flame();
  }

  detonateFireball(x, y, damage, isSyn) {
    const radius = isSyn ? 110 : 70;
    
    // Взрывная огненная волна
    const blast = this.add.circle(x, y, radius, isSyn ? 0xf43f5e : 0xf97316, 0.65)
      .setDepth(21).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: blast,
      scale: 1.35,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => blast.destroy()
    });

    // Разлетающиеся раскаленные угли
    for (let s = 0; s < (isSyn ? 16 : 9); s++) {
      const spAng = Math.random() * Math.PI * 2;
      const spDist = Math.random() * radius;
      const ember = this.add.circle(x, y, isSyn ? 4 : 2.5, 0xfef08a, 1)
        .setDepth(22).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: ember,
        x: x + Math.cos(spAng) * spDist,
        y: y + Math.sin(spAng) * spDist,
        scale: 0,
        alpha: 0,
        duration: Phaser.Math.Between(220, 380),
        onComplete: () => ember.destroy()
      });
    }

    this.enemies.getChildren().forEach(e => {
      if (!e.active) return;
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) <= radius) {
        this.damageEnemy(e, damage, isSyn ? '#f43f5e' : '#f97316');
      }
    });
  }

  castBloodScythe(damage, isSyn) {
    const scythe = this.add.sprite(this.player.x + (this.player.flipX ? -35 : 35), this.player.y, 'blood_scythe')
      .setDepth(15)
      .setScale(isSyn ? 2.2 : 1.4);
    scythe.setFlipX(this.player.flipX);

    this.tweens.add({
      targets: scythe,
      rotation: this.player.flipX ? -2.2 : 2.2,
      duration: 220,
      onComplete: () => scythe.destroy()
    });

    // Светящаяся алая полулунная волна рассечения
    const slashG = this.add.graphics().setDepth(22).setBlendMode(Phaser.BlendModes.ADD);
    const slashRadius = isSyn ? 140 : 85;
    const flip = this.player.flipX;
    const startAngle = flip ? Math.PI * 0.6 : -Math.PI * 0.6;
    const endAngle = flip ? Math.PI * 1.4 : Math.PI * 0.4;
    
    slashG.lineStyle(isSyn ? 10 : 6, isSyn ? 0x991b1b : 0xdc2626, 0.9);
    slashG.beginPath();
    slashG.arc(this.player.x, this.player.y, slashRadius, startAngle, endAngle, flip);
    slashG.strokePath();

    slashG.lineStyle(isSyn ? 4 : 2.5, 0xfca5a5, 1);
    slashG.beginPath();
    slashG.arc(this.player.x, this.player.y, slashRadius * 0.96, startAngle, endAngle, flip);
    slashG.strokePath();

    this.tweens.add({
      targets: slashG,
      alpha: 0,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => slashG.destroy()
    });

    // Кровавые капли энергии в направлении взмаха
    for (let d = 0; d < 8; d++) {
      const dAng = (flip ? Math.PI : 0) + (Math.random() - 0.5) * 1.2;
      const drop = this.add.circle(this.player.x, this.player.y, 2.5, 0xef4444, 0.9)
        .setDepth(23).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: drop,
        x: this.player.x + Math.cos(dAng) * (slashRadius * 0.9),
        y: this.player.y + Math.sin(dAng) * (slashRadius * 0.9),
        scale: 0,
        alpha: 0,
        duration: 240,
        onComplete: () => drop.destroy()
      });
    }

    const range = isSyn ? 160 : 90;
    this.enemies.getChildren().forEach(e => {
      const inFront = this.player.flipX ? (e.x <= this.player.x + 20) : (e.x >= this.player.x - 20);
      if (inFront && Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y) <= range) {
        this.damageEnemy(e, damage, '#ef4444');
        if (isSyn) this.healPlayer(1);
      }
    });
    SFX.scythe();
  }

  fireShurikens(damage, count, isSyn) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = this.projectiles.create(this.player.x, this.player.y, 'shadow_shuriken');
      s.damage = damage;
      s.weaponType = isSyn ? 'shadow_barrage' : 'shurikens';
      s.ricochets = isSyn ? 4 : 2;
      const spd = 500 * this.playerStats.projSpeedMultiplier;
      s.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);

      // Теневой дымчатый шлейф за сюрикеном
      const shurikenTrail = this.time.addEvent({
        delay: 60,
        repeat: 20,
        callback: () => {
          if (!s || !s.active) { shurikenTrail.remove(); return; }
          const shadow = this.add.circle(s.x, s.y, 3, isSyn ? 0xa855f7 : 0x64748b, 0.75)
            .setDepth(17).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: shadow,
            scale: 0,
            alpha: 0,
            duration: 180,
            onComplete: () => shadow.destroy()
          });
        }
      });

      this.time.delayedCall(1600, () => { if (s && s.active) s.destroy(); });
    }
    SFX.shuriken();
  }

  pulseHolyAura(damage, isSyn) {
    if (this.auraCircle && this.auraCircle.active) {
      this.tweens.add({
        targets: this.auraCircle,
        alpha: 0.42,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 120,
        yoyo: true,
        ease: 'Sine.easeOut'
      });
    }
  }

  dropGravityMines(damage, isSyn) {
    const m = this.add.sprite(this.player.x, this.player.y, 'grav_mine').setDepth(4);
    if (isSyn) m.setScale(1.5).setTint(0x8b5cf6);

    // Пульсирующее гравитационное искажение вокруг мины
    const pulseRing = this.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    const pulseTimer = this.time.addEvent({
      delay: 350,
      repeat: 5,
      callback: () => {
        if (!m || !m.active) { pulseTimer.remove(); return; }
        pulseRing.clear();
        pulseRing.lineStyle(2, 0x8b5cf6, 0.7);
        pulseRing.strokeCircle(m.x, m.y, 25);
        this.tweens.add({
          targets: pulseRing,
          alpha: 0,
          duration: 300
        });
      }
    });

    this.time.delayedCall(isSyn ? 1600 : 2000, () => {
      if (!m.active) {
        pulseRing.destroy();
        return;
      }
      pulseTimer.remove();
      pulseRing.destroy();

      const radius = isSyn ? 180 : 100;

      // 1. Втягивание частиц сингулярности внутрь
      for (let p = 0; p < 10; p++) {
        const pAng = Math.random() * Math.PI * 2;
        const pDist = Phaser.Math.Between(40, radius);
        const implote = this.add.circle(m.x + Math.cos(pAng) * pDist, m.y + Math.sin(pAng) * pDist, 3, 0xc084fc, 0.9)
          .setDepth(21).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: implote,
          x: m.x,
          y: m.y,
          scale: 0.1,
          alpha: 0,
          duration: 160,
          ease: 'Cubic.easeIn',
          onComplete: () => implote.destroy()
        });
      }

      // 2. Взрывная ударная волна сингулярности
      const gravWave = this.add.circle(m.x, m.y, 10, 0x8b5cf6, 0.25)
        .setDepth(22).setBlendMode(Phaser.BlendModes.ADD);
      gravWave.setStrokeStyle(4, 0xa855f7, 1);
      this.tweens.add({
        targets: gravWave,
        scaleX: radius / 10,
        scaleY: radius / 10,
        alpha: 0,
        duration: 340,
        ease: 'Cubic.easeOut',
        onComplete: () => gravWave.destroy()
      });

      this.enemies.getChildren().forEach(e => {
        if (Phaser.Math.Distance.Between(m.x, m.y, e.x, e.y) <= radius) {
          this.damageEnemy(e, damage, '#818cf8');
        }
      });
      m.destroy();
      SFX.mines();
    });
  }

  launchRavenAttack(damage, count, isSyn) {
    const live = this.enemies.getChildren();
    if (live.length === 0) return;

    for (let i = 0; i < count; i++) {
      const target = Phaser.Utils.Array.GetRandom(live);
      const r = this.add.sprite(this.player.x, this.player.y, 'raven_sprite').setDepth(14);
      if (isSyn) r.setScale(1.5).setTint(0xf43f5e);

      // Теневые перья по траектории пикирования
      const featherTimer = this.time.addEvent({
        delay: 70,
        repeat: 5,
        callback: () => {
          if (!r || !r.active) { featherTimer.remove(); return; }
          const feather = this.add.circle(r.x, r.y, 2.5, isSyn ? 0xf43f5e : 0x475569, 0.8)
            .setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: feather,
            scale: 0,
            alpha: 0,
            duration: 200,
            onComplete: () => feather.destroy()
          });
        }
      });

      this.tweens.add({
        targets: r,
        x: target.x,
        y: target.y,
        duration: 350,
        onComplete: () => {
          r.destroy();
          if (target && target.active) {
            // Теневой клевок по цели
            const strikeFlash = this.add.circle(target.x, target.y, isSyn ? 10 : 6, isSyn ? 0xf43f5e : 0x94a3b8, 0.9)
              .setDepth(20).setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
              targets: strikeFlash,
              scale: 2,
              alpha: 0,
              duration: 150,
              onComplete: () => strikeFlash.destroy()
            });
            this.damageEnemy(target, damage, '#94a3b8');
          }
        }
      });
    }
    SFX.ravens();
  }

  throwHolyFlask(damage, count, isSyn) {
    const live = this.enemies.getChildren().filter(e => e.active);
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 150, () => {
        let tx = this.player.x + (this.player.flipX ? -160 : 160) + (Math.random() - 0.5) * 60;
        let ty = this.player.y + (Math.random() - 0.5) * 80;

        if (live.length > 0) {
          const t = Phaser.Utils.Array.GetRandom(live);
          if (t && t.active) {
            tx = t.x + (Math.random() - 0.5) * 30;
            ty = t.y + (Math.random() - 0.5) * 30;
          }
        }

        const flask = this.add.sprite(this.player.x, this.player.y - 12, 'holy_flask')
          .setDepth(19).setScale(isSyn ? 1.3 : 1.0);

        const startX = this.player.x;
        const startY = this.player.y - 12;
        const tossDuration = 480;

        this.tweens.add({
          targets: flask,
          rotation: Math.PI * 4,
          duration: tossDuration,
          ease: 'Linear'
        });

        const startTime = this.time.now;
        const flaskUpdate = this.time.addEvent({
          delay: 16,
          repeat: Math.floor(tossDuration / 16),
          callback: () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(1, elapsed / tossDuration);
            flask.x = startX + (tx - startX) * progress;
            const arc = 65 * Math.sin(progress * Math.PI);
            flask.y = (startY + (ty - startY) * progress) - arc;

            if (progress >= 1) {
              flaskUpdate.remove();
              flask.destroy();
              this.createHolyFirePuddle(tx, ty, damage, isSyn);
            }
          }
        });
      });
    }
  }

  createHolyFirePuddle(x, y, damage, isSyn) {
    SFX.flask();

    // Осколки стекла при разбивании фиала
    for (let s = 0; s < 6; s++) {
      const sAng = Math.random() * Math.PI * 2;
      const shard = this.add.circle(x, y, 2, 0xbae6fd, 0.9)
        .setDepth(18).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(sAng) * 24,
        y: y + Math.sin(sAng) * 24,
        scale: 0,
        alpha: 0,
        duration: 220,
        onComplete: () => shard.destroy()
      });
    }

    const radius = isSyn ? 75 : 50;
    const puddle = this.add.circle(x, y, radius, isSyn ? 0x0284c7 : 0xd97706, 0.42)
      .setDepth(5).setBlendMode(Phaser.BlendModes.ADD);

    // Священные языки пламени над лужей
    const puddleTimer = this.time.addEvent({
      delay: 120,
      repeat: Math.floor((isSyn ? 5200 : 3800) / 120),
      callback: () => {
        if (!puddle || !puddle.active) { puddleTimer.remove(); return; }
        const r = (radius * puddle.scaleX) * Math.sqrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        const fx = puddle.x + r * Math.cos(theta);
        const fy = puddle.y + r * Math.sin(theta);
        const flame = this.add.circle(fx, fy, Phaser.Math.Between(2, 4.5), isSyn ? 0x38bdf8 : 0xfacc15, 0.85)
          .setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: flame,
          y: fy - 16,
          scale: 0.2,
          alpha: 0,
          duration: 320,
          ease: 'Sine.easeOut',
          onComplete: () => flame.destroy()
        });
      }
    });

    this.tweens.add({
      targets: puddle,
      alpha: 0,
      duration: isSyn ? 5200 : 3800,
      onUpdate: () => {
        this.enemies.getChildren().forEach(e => {
          if (!e.active) return;
          if (Phaser.Math.Distance.Between(puddle.x, puddle.y, e.x, e.y) <= radius) {
            if (!e._lastFlaskHit || this.time.now - e._lastFlaskHit > 260) {
              e._lastFlaskHit = this.time.now;
              this.damageEnemy(e, Math.round(damage * 0.45), isSyn ? '#38bdf8' : '#f59e0b');
            }
          }
        });
      },
      onComplete: () => puddle.destroy()
    });
  }

  // === СПАВН И ПОВЕДЕНИЕ МОНСТРОВ ===
  getSpawnPosition() {
    const { hw, hh } = this.getVisibleBounds();
    const margin = 45; // прямо за видимой границей экрана игрока
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { // Сверху
      x = this.player.x + Phaser.Math.Between(-hw - margin, hw + margin);
      y = this.player.y - hh - margin;
    } else if (side === 1) { // Снизу
      x = this.player.x + Phaser.Math.Between(-hw - margin, hw + margin);
      y = this.player.y + hh + margin;
    } else if (side === 2) { // Слева
      x = this.player.x - hw - margin;
      y = this.player.y + Phaser.Math.Between(-hh - margin, hh + margin);
    } else { // Справа
      x = this.player.x + hw + margin;
      y = this.player.y + Phaser.Math.Between(-hh - margin, hh + margin);
    }
    return { x, y };
  }

  spawnEnemyWave() {
    const t = this.playerStats.survivalTime;

    // Контрольные точки боссов каждые 5 минут забега
    const BOSS_CHECKPOINTS = [
      { sec: 300, name: 'ТЕНЕВОЙ АРАХНИД (5 мин)', hp: 1400 },
      { sec: 600, name: 'ТИТАНИЧЕСКИЙ ГОЛЕМ (10 мин)', hp: 3200 },
      { sec: 900, name: 'АРХИЛИЧ СКВЕРНЫ (15 мин)', hp: 6500 },
      { sec: 1200, name: 'ПОВЕЛИТЕЛЬ КОСТЕЙ (20 мин)', hp: 11000 },
      { sec: 1500, name: 'ЛЕВИАФАН БЕЗДНЫ (25 мин)', hp: 18000 },
      { sec: 1800, name: 'ПОВЕЛИТЕЛЬ ТЕНЕЙ (30 мин)', hp: 28000 }
    ];

    BOSS_CHECKPOINTS.forEach(bp => {
      if (t >= bp.sec && !this.spawnedBossCheckpoints.has(bp.sec)) {
        this.spawnedBossCheckpoints.add(bp.sec);
        this.spawnEnemy('boss', true, bp.name, bp.hp);
        this.cameras.main.shake(250, 0.007);
        this.showCenterToast(`ПРИБЫЛ БОСС: ${bp.name}!`);
      }
    });

    // Плавный рост волн: от 2 монстров в первую минуту до 28 монстров к 10+ минутам
    let count = Math.min(28, 2 + Math.floor(t / 60));

    // Доступные типы монстров по шкале прогрессии
    let pool = ['crawler'];
    if (t > 75) pool.push('phantom');
    if (t > 240) pool.push('skeleton');
    if (t > 480) pool.push('gargoyle');
    if (t > 780) pool.push('golem');
    if (t > 1100) pool.push('wraith');

    // Кровавый Прилив на 30-35 минутах забега
    if (t >= 1800) {
      count = Math.min(36, count + 6);
    }

    for (let i = 0; i < count; i++) {
      const type = Phaser.Utils.Array.GetRandom(pool);
      this.spawnEnemy(type);
    }
  }

  spawnEnemy(type, isBoss = false, bossName = '', bossHp = 0) {
    const pos = this.getSpawnPosition();
    const x = pos.x;
    const y = pos.y;
    const t = this.playerStats.survivalTime;

    let initKey = 'crawler_0';
    if (type === 'phantom' || type === 'cinder') initKey = 'phantom_0';
    else if (type === 'skeleton') initKey = 'skeleton_0';
    else if (type === 'golem') initKey = 'golem_0';
    else if (type === 'gargoyle') initKey = 'gargoyle_0';
    else if (type === 'wraith') initKey = 'wraith_0';
    else if (type === 'boss') initKey = 'boss';

    const enemy = this.enemies.create(x, y, initKey).setDepth(isBoss ? 10 : 8);

    if (type === 'crawler') {
      enemy.hp = Math.floor(14 * (1 + t * 0.0008));
      enemy.speed = 115;
      enemy.damage = 8 + Math.floor(t * 0.008);
      enemy.xpValue = 2;
      enemy.setCircle(11, 4, 4);
      enemy.play('crawler_crawl');
    } else if (type === 'phantom' || type === 'cinder') {
      enemy.hp = Math.floor(34 * (1 + t * 0.001));
      enemy.speed = 130;
      enemy.damage = 12 + Math.floor(t * 0.01);
      enemy.xpValue = 5;
      enemy.setCircle(13, 5, 6);
      enemy.play('phantom_hover');
    } else if (type === 'skeleton') {
      enemy.hp = Math.floor(70 * (1 + t * 0.0012));
      enemy.speed = 90;
      enemy.damage = 16 + Math.floor(t * 0.012);
      enemy.xpValue = 8;
      enemy.setCircle(14, 3, 5);
      enemy.play('skeleton_walk');
    } else if (type === 'golem') {
      enemy.hp = Math.floor(140 * (1 + t * 0.0015));
      enemy.speed = 75;
      enemy.damage = 24 + Math.floor(t * 0.018);
      enemy.xpValue = 12;
      enemy.setCircle(15, 3, 5);
      enemy.play('golem_walk');
    } else if (type === 'gargoyle') {
      enemy.hp = Math.floor(110 * (1 + t * 0.0014));
      enemy.speed = 150;
      enemy.damage = 20 + Math.floor(t * 0.015);
      enemy.xpValue = 10;
      enemy.setCircle(14, 4, 4);
      enemy.play('gargoyle_fly');
    } else if (type === 'wraith') {
      enemy.hp = Math.floor(240 * (1 + t * 0.002));
      enemy.speed = 135;
      enemy.damage = 34 + Math.floor(t * 0.025);
      enemy.xpValue = 8;
      enemy.setCircle(16, 5, 6);
      enemy.play('wraith_float');
    } else if (type === 'boss') {
      enemy.isBoss = true;
      enemy.bossName = bossName || 'Босс Бездны';
      enemy.hp = bossHp || Math.floor(1400 * (1 + t * 0.003));
      enemy.maxHp = enemy.hp;
      enemy.speed = 65;
      enemy.damage = 45 + Math.floor(t * 0.03);
      enemy.xpValue = 80;
      enemy.setScale(1.25);
      enemy.setCircle(28, 6, 6);
    }
  }

  spawnReaper() {
    this.cameras.main.flash(900, 180, 20, 20);
    this.cameras.main.shake(1400, 0.015);
    SFX.reaperBell();
    this.showCenterToast('35:00 — ПРИШЕЛ ЖНЕЦ СМЕРТИ! ВРЕМЯ ИСТЕКЛО.');

    const pos = this.getSpawnPosition();
    const reaper = this.enemies.create(pos.x, pos.y, 'reaper').setDepth(35);
    reaper.isReaper = true;
    reaper.hp = 9999999;
    reaper.maxHp = 9999999;
    reaper.speed = 340;
    reaper.damage = 99999;
    reaper.xpValue = 0;
    reaper.setCircle(26, 11, 12);
  }

  updateEnemies() {
    const hasSlow = this.equippedRelics.includes('chrono');
    const slowRatio = hasSlow ? Math.max(0.70, 1 - (this.playerStats.enemySlowPct || 0.15)) : 1.0;

    this.enemies.getChildren().forEach(enemy => {
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      let spd = enemy.speed;
      if (!enemy.isReaper) {
        spd *= slowRatio;
      }
      enemy.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);

      if (enemy.body.velocity.x < -6) enemy.setFlipX(true);
      else if (enemy.body.velocity.x > 6) enemy.setFlipX(false);
    });
  }

  hitEnemyWithProjectile(proj, enemy) {
    const isCrit = Math.random() < this.playerStats.critChance;
    let finalDmg = isCrit ? Math.floor(proj.damage * 2) : proj.damage;
    if (this.equippedRelics.includes('skull')) finalDmg = Math.floor(finalDmg * 1.25);

    this.damageEnemy(enemy, finalDmg, isCrit ? '#f43f5e' : '#fef08a');
    SFX.hit();

    if (proj.weaponType === 'flame' || proj.weaponType === 'inferno_vortex') {
      this.detonateFireball(proj.x, proj.y, proj.damage, proj.weaponType === 'inferno_vortex');
      proj.destroy();
      return;
    }

    if (proj.weaponType === 'shurikens' && proj.ricochets > 0) {
      proj.ricochets--;
      const angle = Math.random() * Math.PI * 2;
      proj.setVelocity(Math.cos(angle) * 500, Math.sin(angle) * 500);
      return;
    }

    proj.destroy();
  }

  damageEnemy(enemy, amount, color = '#fef08a') {
    enemy.hp -= amount;
    this.showFloatingDamage(enemy.x, enemy.y, amount, color);

    enemy.setTintFill(0xffffff);
    this.time.delayedCall(70, () => {
      if (enemy && enemy.active) enemy.clearTint();
    });

    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  showFloatingDamage(x, y, amount, color) {
    const text = this.add.text(x, y - 10, `${amount}`, {
      fontFamily: 'Outfit, sans-serif',
      fontSize: '15px',
      fontWeight: '800',
      color: color,
      stroke: '#000000',
      strokeThickness: 3.5
    }).setOrigin(0.5).setDepth(30);

    this.tweens.add({
      targets: text,
      y: y - 35,
      alpha: 0,
      duration: 480,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy()
    });
  }

  killEnemy(enemy) {
    this.playerStats.kills++;
    document.getElementById('kills-count').textContent = this.playerStats.kills;

    // Реликвия Кубок Вампира: +1 HP за 14 убийств
    if (this.equippedRelics.includes('goblet')) {
      this.playerStats.lifestealKillCount++;
      if (this.playerStats.lifestealKillCount >= 14) {
        this.playerStats.lifestealKillCount = 0;
        this.healPlayer(1);
      }
    }

    let gemKey = 'gem_blue';
    if (enemy.xpValue >= 20) gemKey = 'gem_red';
    else if (enemy.xpValue >= 3) gemKey = 'gem_green';

    // Босс дает несколько жемчужин
    if (enemy.xpValue >= 20) {
      for (let i = 0; i < 3; i++) {
        const extraGem = this.gems.create(
          enemy.x + (Math.random() * 40 - 20),
          enemy.y + (Math.random() * 40 - 20),
          i === 0 ? 'gem_red' : 'gem_green'
        ).setDepth(7);
        extraGem.xpAmount = i === 0 ? Math.floor(enemy.xpValue * 0.5) : Math.floor(enemy.xpValue * 0.25);
      }
    }

    const gem = this.gems.create(enemy.x, enemy.y, gemKey).setDepth(7);
    gem.xpAmount = enemy.xpValue;

    enemy.destroy();
  }

  updateGems() {
    const magnetDist = this.playerStats.magnetRadius;
    this.gems.getChildren().forEach(gem => {
      const dist = Phaser.Math.Distance.Between(gem.x, gem.y, this.player.x, this.player.y);
      if (dist < magnetDist || gem.isPulled) {
        const ang = Phaser.Math.Angle.Between(gem.x, gem.y, this.player.x, this.player.y);
        const magnetSpeed = gem.isPulled ? 650 : 420;
        gem.setVelocity(Math.cos(ang) * magnetSpeed, Math.sin(ang) * magnetSpeed);
      } else {
        gem.setVelocity(0);
      }
    });
  }

  collectGem(gem) {
    const amount = gem.xpAmount || 1;
    gem.destroy();
    SFX.gem();

    this.playerStats.xp += amount;
    if (this.playerStats.xp >= this.playerStats.xpNext) {
      this.triggerLevelUp();
    } else {
      this.updateXPBar();
    }
  }

  updateXPBar() {
    const pct = Math.min(100, (this.playerStats.xp / this.playerStats.xpNext) * 100);
    const bar = document.getElementById('xp-bar');
    if (bar) bar.style.width = `${pct}%`;

    const txt = document.getElementById('xp-text');
    if (txt) txt.textContent = `${this.playerStats.xp} / ${this.playerStats.xpNext} XP`;
  }

  triggerLevelUp() {
    this.playerStats.level++;
    this.playerStats.xp -= this.playerStats.xpNext;

    // Плавная и сбалансированная шкала опыта в стиле Vampire Survivors
    const lvl = this.playerStats.level;
    if (lvl <= 20) {
      this.playerStats.xpNext = 6 + (lvl - 1) * 8;
    } else if (lvl <= 40) {
      this.playerStats.xpNext = 158 + (lvl - 20) * 14;
    } else {
      this.playerStats.xpNext = 438 + (lvl - 40) * 22;
    }

    document.getElementById('hud-level').textContent = this.playerStats.level;
    this.updateXPBar();

    SFX.levelUp();
    this.showUpgradeModal();
  }

  showUpgradeModal() {
    this.isPaused = true;
    this.physics.pause();

    const pool = [];

    // 1. Проверяем возможность СУПЕРСИНЕРГИИ (Оружие ур.5 + Реликвия есть)
    this.equippedWeapons.forEach(wId => {
      const w = this.weapons[wId];
      const def = WEAPONS_DEF[wId];
      if (w.level === 5 && !w.isSynergy && this.equippedRelics.includes(def.partnerRelic)) {
        const synDef = SYNERGIES_DEF[def.synergyKey];
        pool.push({
          id: `synergy_${def.synergyKey}`,
          title: `✦ ${synDef.name}`,
          desc: synDef.desc,
          iconKey: synDef.iconKey,
          type: 'СУПЕРСИНЕРГИЯ',
          rarity: 'legendary',
          isSynergy: true,
          apply: () => {
            w.isSynergy = true;
            w.damage = Math.floor(w.damage * 1.8);
            w.cooldown = Math.floor(w.cooldown * 0.75);
            SFX.synergyUnlock();
            this.showCenterToast(`СУПЕРСИНЕРГИЯ: ${synDef.name}!`);
            this.updateInventoryRack();
          }
        });
      }
    });

    // 2. Улучшение уже имеющихся оружий (< 5 ур.)
    this.equippedWeapons.forEach(wId => {
      const w = this.weapons[wId];
      const def = WEAPONS_DEF[wId];
      if (w.level < 5 && !w.isSynergy) {
        pool.push({
          id: `upgrade_${wId}`,
          title: `Оружие: ${def.name} (Ур.${w.level + 1})`,
          desc: def.upgradeDesc || 'Повышение боевых характеристик оружия.',
          iconKey: def.iconKey,
          category: 'weapon',
          type: 'ОРУЖИЕ',
          rarity: def.rarity || 'common',
          apply: () => {
            this.upgradeWeapon(wId);
            this.updateInventoryRack();
          }
        });
      }
    });

    // 3. Улучшение имеющихся реликвий (< 5 ур.)
    this.equippedRelics.forEach(rId => {
      const r = this.relics[rId];
      const def = RELICS_DEF[rId];
      if (r.level < 5) {
        pool.push({
          id: `upgrade_relic_${rId}`,
          title: `Реликвия: ${def.name} (Ур.${r.level + 1})`,
          desc: def.upgradeDesc || 'Увеличение силы пассивного эффекта.',
          iconKey: def.iconKey,
          category: 'relic',
          type: 'РЕЛИКВИЯ',
          rarity: def.rarity || 'common',
          apply: () => {
            r.level++;
            this.applyRelicStats(rId);
            this.updateInventoryRack();
          }
        });
      }
    });

    // 4. Новые оружия (если слотов оружия < 8)
    if (this.equippedWeapons.length < 8) {
      Object.keys(WEAPONS_DEF).forEach(wId => {
        if (!this.equippedWeapons.includes(wId)) {
          const def = WEAPONS_DEF[wId];
          pool.push({
            id: `unlock_${wId}`,
            title: `Оружие: ${def.name} (Новое)`,
            desc: def.desc,
            iconKey: def.iconKey,
            category: 'weapon',
            type: 'ОРУЖИЕ',
            rarity: def.rarity || 'common',
            apply: () => {
              this.equippedWeapons.push(wId);
              this.weapons[wId].level = 1;
              this.updateInventoryRack();
            }
          });
        }
      });
    }

    // 5. Новые реликвии (если слотов реликвий < 8)
    if (this.equippedRelics.length < 8) {
      Object.keys(RELICS_DEF).forEach(rId => {
        if (!this.equippedRelics.includes(rId)) {
          const def = RELICS_DEF[rId];
          pool.push({
            id: `unlock_relic_${rId}`,
            title: `Реликвия: ${def.name} (Новое)`,
            desc: def.desc,
            iconKey: def.iconKey,
            category: 'relic',
            type: 'РЕЛИКВИЯ',
            rarity: def.rarity || 'common',
            apply: () => {
              this.equippedRelics.push(rId);
              this.relics[rId].level = 1;
              this.applyRelicStats(rId);
              this.updateInventoryRack();
            }
          });
        }
      });
    }

    // Если всё максимально прокачано (8 оружий ур.5/синергия и 8 реликвий ур.5)
    // Предлагаем выбор из 3 наград золотыми монетами + лечение
    if (pool.length === 0) {
      pool.push({
        id: 'gold_pouch',
        title: 'Кошель Золота',
        desc: '+50 золотых монет и восстановление 20 HP.',
        iconKey: 'gold_pouch',
        type: 'ЗОЛОТО',
        rarity: 'rare',
        isGold: true,
        apply: () => {
          this.playerStats.gold = (this.playerStats.gold || 0) + 50;
          this.healPlayer(20);
          this.showCenterToast('+50 ЗОЛОТА!');
          SFX.gem();
        }
      });
      pool.push({
        id: 'gold_chest',
        title: 'Кованый Сундук Золота',
        desc: '+120 золотых монет и восстановление 50 HP.',
        iconKey: 'gold_chest',
        type: 'ЗОЛОТО',
        rarity: 'epic',
        isGold: true,
        apply: () => {
          this.playerStats.gold = (this.playerStats.gold || 0) + 120;
          this.healPlayer(50);
          this.showCenterToast('+120 ЗОЛОТА!');
          SFX.gem();
        }
      });
      pool.push({
        id: 'gold_vault',
        title: 'Царская Казна',
        desc: '+300 золотых монет и полное исцеление (100 HP).',
        iconKey: 'gold_vault',
        type: 'ЗОЛОТО',
        rarity: 'legendary',
        isGold: true,
        apply: () => {
          this.playerStats.gold = (this.playerStats.gold || 0) + 300;
          this.healPlayer(100);
          this.showCenterToast('+300 ЗОЛОТА!');
          SFX.levelUp();
        }
      });
    }

    // Суперсинергии имеют абсолютный приоритет
    const synergiesInPool = pool.filter(c => c.isSynergy);
    const normalInPool = pool.filter(c => !c.isSynergy);

    // Взвешенная выборка по редкости с учетом бонуса клевера
    const luck = this.playerStats.luckBonus || 0;
    const RARITY_WEIGHTS = {
      common: 50,
      rare: 30,
      epic: Math.round(15 * (1 + luck * 1.5)),
      legendary: Math.round(5 * (1 + luck * 2.5))
    };

    const getItemWeight = (it) => {
      let w = RARITY_WEIGHTS[it.rarity] || 25;
      if (it.id && it.id.startsWith('upgrade_')) {
        w *= 3.8; // Приоритет улучшения уже имеющихся предметов над открытием новых!
      }
      return w;
    };

    const weightedSample = (items, n) => {
      const remaining = [...items];
      const selected = [];
      while (selected.length < n && remaining.length > 0) {
        const totalW = remaining.reduce((acc, it) => acc + getItemWeight(it), 0);
        let rnd = Math.random() * totalW;
        let pickedIdx = 0;
        for (let i = 0; i < remaining.length; i++) {
          rnd -= getItemWeight(remaining[i]);
          if (rnd <= 0) {
            pickedIdx = i;
            break;
          }
        }
        selected.push(remaining.splice(pickedIdx, 1)[0]);
      }
      return selected;
    };

    const choices = [...synergiesInPool, ...weightedSample(normalInPool, 3 - synergiesInPool.length)].slice(0, 3);

    const container = document.getElementById('upgrade-cards');
    container.innerHTML = '';

    choices.forEach((c, cardIdx) => {
      const card = document.createElement('div');
      card.className = `upgrade-card rarity-${c.rarity || 'common'}`;
      if (c.isSynergy) card.classList.add('rarity-legendary');
      if (c.isGold) card.classList.add('gold-card');

      const rarityTitles = {
        common: 'ОБЫЧНЫЙ',
        rare: 'РЕДКИЙ',
        epic: 'ЭПИЧЕСКИЙ',
        legendary: 'ЛЕГЕНДАРНЫЙ'
      };
      const rarityText = rarityTitles[c.rarity] || 'ОБЫЧНЫЙ';
      const badgeText = c.isSynergy ? 'СУПЕРСИНЕРГИЯ' : (c.isGold ? 'СОКРОВИЩЕ' : rarityText);
      const badgeClass = c.isSynergy ? 'rarity-badge-legendary' : `rarity-badge-${c.rarity || 'common'}`;

      const catTagClass = `tag-${c.category || (c.type === 'ОРУЖИЕ' ? 'weapon' : (c.type === 'РЕЛИКВИЯ' ? 'relic' : 'weapon'))}`;
      const typeBadgeHtml = c.type ? `<div class="card-type-tag ${catTagClass}">${c.type}</div>` : '';

      const iconSvg = GAME_ICONS[c.iconKey] || '';
      card.innerHTML = `
        <div class="upgrade-card-number">${cardIdx + 1}</div>
        <div class="card-header-row">
          ${typeBadgeHtml}
          <div class="card-badge ${badgeClass}">${badgeText}</div>
        </div>
        <div class="card-icon-frame">${iconSvg}</div>
        <div class="card-title">${c.title}</div>
        <div class="card-desc">${c.desc}</div>
      `;
      card.addEventListener('click', () => {
        c.apply();
        document.getElementById('levelup-modal').style.display = 'none';
        this.isPaused = false;
        this.physics.resume();
        this.cameras.main.flash(200, 245, 158, 11);
      });
      container.appendChild(card);
    });

    // Сбросить навигацию на первую карту
    this._upgradeIdx = 0;
    requestAnimationFrame(() => {
      const cards = container.querySelectorAll('.upgrade-card');
      cards.forEach((c, i) => c.classList.toggle('kb-focused', i === 0));
    });

    document.getElementById('levelup-modal').style.display = 'flex';
  }

  upgradeWeapon(wId) {
    const w = this.weapons[wId];
    if (!w) return;
    w.level++;

    switch (wId) {
      case 'rift':
        w.damage = Math.floor(w.damage * 1.22);
        w.cooldown = Math.max(350, Math.floor(w.cooldown * 0.88));
        if (w.level === 2 || w.level === 4) w.count++;
        break;
      case 'meteor':
        w.damage = Math.floor(w.damage * 1.25);
        w.cooldown = Math.max(1600, Math.floor(w.cooldown * 0.92));
        if (w.level === 2 || w.level === 4 || w.level === 5) w.count++;
        break;
      case 'tesla':
        w.damage = Math.floor(w.damage * 1.25);
        w.chains = (w.chains || 3) + 1;
        w.cooldown = Math.max(700, Math.floor(w.cooldown * 0.92));
        break;
      case 'frost':
        w.damage = Math.floor(w.damage * 1.25);
        w.count += 2;
        w.cooldown = Math.max(1100, Math.floor(w.cooldown * 0.92));
        break;
      case 'solar':
        w.damage = Math.floor(w.damage * 1.30);
        w.cooldown = Math.max(1400, Math.floor(w.cooldown * 0.92));
        break;
      case 'daggers':
        w.damage = Math.floor(w.damage * 1.25);
        w.cooldown = Math.max(360, Math.floor(w.cooldown * 0.90));
        if (w.level === 2 || w.level === 4 || w.level === 5) w.count++;
        break;
      case 'spores':
        w.damage = Math.floor(w.damage * 1.30);
        break;
      case 'axes':
        w.damage = Math.floor(w.damage * 1.26);
        w.cooldown = Math.max(1800, Math.floor(w.cooldown * 0.90));
        if (w.level === 2 || w.level === 4) w.count++;
        break;
      case 'hammer':
      case 'hammers':
        w.damage = Math.floor(w.damage * 1.26);
        w.cooldown = Math.max(1400, Math.floor(w.cooldown * 0.92));
        if (w.level === 2 || w.level === 4 || w.level === 5) w.count++;
        break;
      case 'flame':
        w.damage = Math.floor(w.damage * 1.25);
        w.count += 2;
        w.cooldown = Math.max(900, Math.floor(w.cooldown * 0.92));
        break;
      case 'scythe':
        w.damage = Math.floor(w.damage * 1.28);
        w.cooldown = Math.max(800, Math.floor(w.cooldown * 0.90));
        break;
      case 'shurikens':
        w.damage = Math.floor(w.damage * 1.26);
        w.cooldown = Math.max(550, Math.floor(w.cooldown * 0.92));
        if (w.level === 2 || w.level === 4) w.count++;
        break;
      case 'aura':
        w.damage = Math.floor(w.damage * 1.35);
        w.cooldown = Math.max(220, Math.floor(w.cooldown * 0.92));
        break;
      case 'mines':
        w.damage = Math.floor(w.damage * 1.26);
        w.cooldown = Math.max(1800, Math.floor(w.cooldown * 0.92));
        if (w.level === 2 || w.level === 4) w.count++;
        break;
      case 'ravens':
        w.damage = Math.floor(w.damage * 1.27);
        w.cooldown = Math.max(900, Math.floor(w.cooldown * 0.92));
        if (w.level === 2 || w.level === 4) w.count++;
        break;
      case 'flask':
        w.damage = Math.floor(w.damage * 1.30);
        w.cooldown = Math.max(1600, Math.floor(w.cooldown * 0.90));
        if (w.level === 2 || w.level === 4) w.count++;
        break;
      default:
        w.damage = Math.floor(w.damage * 1.25);
        w.cooldown = Math.max(300, Math.floor(w.cooldown * 0.90));
        break;
    }
  }

  applyRelicStats(rId) {
    const lvl = this.relics[rId]?.level || 1;
    switch (rId) {
      case 'boots':
        this.playerStats.speed = Math.floor(200 * (1 + 0.08 * lvl));
        break;
      case 'titan':
        this.playerStats.damageMultiplier = 1.0 + 0.10 * lvl;
        break;
      case 'soul':
        this.playerStats.magnetRadius = Math.floor(130 * (1 + 0.25 * lvl));
        break;
      case 'well':
        this.playerStats.cooldownMultiplier = Math.max(0.45, 1.0 - 0.06 * lvl);
        break;
      case 'lens':
        this.playerStats.durationMultiplier = 1.0 + 0.10 * lvl;
        break;
      case 'edge':
        this.playerStats.critChance = 0.05 + 0.05 * lvl;
        break;
      case 'bracers':
        this.playerStats.damageReduction = 0.05 * lvl;
        break;
      case 'cross':
        const oldMax = this.playerStats.maxHp;
        this.playerStats.maxHp = 100 + 20 * lvl;
        this.playerStats.hp += (this.playerStats.maxHp - oldMax);
        this.updateHUD();
        break;
      case 'heart':
        this.playerStats.regen = 1.0 * lvl;
        break;
      case 'mask':
        this.playerStats.projSpeedMultiplier = 1.0 + 0.10 * lvl;
        break;
      case 'feather':
        this.playerStats.extraProjectiles = lvl >= 4 ? 2 : (lvl >= 2 ? 1 : 0);
        break;
      case 'clover':
        this.playerStats.luckBonus = 0.15 * lvl;
        break;
      case 'quiver':
        this.playerStats.quiverMultiplier = Math.max(0.60, 1.0 - 0.07 * lvl);
        break;
      case 'goblet':
        this.playerStats.gobletTargetKills = Math.max(6, 16 - (lvl - 1) * 2.5);
        break;
      case 'chrono':
        this.playerStats.enemySlowPct = 0.05 * lvl;
        break;
      case 'skull':
        this.playerStats.skullBonusDmg = 0.08 * lvl;
        break;
    }
  }

  playerHit(enemy) {
    if (this._invulnerable && !enemy.isReaper) return;

    let dmg = enemy.damage;
    if (enemy.isReaper) {
      dmg = 99999;
    } else {
      if (this.playerStats.damageReduction) {
        dmg = Math.max(1, Math.round(dmg * (1 - this.playerStats.damageReduction)));
      }
    }

    this.playerStats.hp -= dmg;
    this.updateHUD();

    this.cameras.main.shake(70, 0.003);
    SFX.playerHurt();

    const knockAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    this.player.x += Math.cos(knockAngle) * 16;
    this.player.y += Math.sin(knockAngle) * 16;

    if (enemy.isReaper || this.playerStats.hp <= 0) {
      this.triggerGameOver();
      return;
    }

    this._invulnerable = true;
    this.tweens.add({
      targets: this.player,
      alpha: 0.2,
      duration: 70,
      yoyo: true,
      repeat: 4,
      onComplete: () => {
        this._invulnerable = false;
        if (this.player) this.player.setAlpha(1);
      }
    });
  }

  healPlayer(amount) {
    this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + amount);
    this.updateHUD();
  }

  updateHUD() {
    const hpPct = Math.max(0, (this.playerStats.hp / this.playerStats.maxHp) * 100);
    const fill = document.getElementById('hp-bar-fill');
    if (fill) fill.style.width = `${hpPct}%`;

    const txt = document.getElementById('hp-text');
    if (txt) txt.textContent = `${Math.max(0, Math.ceil(this.playerStats.hp))} / ${this.playerStats.maxHp}`;
  }

  updateSurvivalTimer() {
    const totalSecs = Math.floor(this.playerStats.survivalTime);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const str = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const el = document.getElementById('survival-timer');
    if (el) el.textContent = str;
  }

  showCenterToast(msg) {
    const toast = this.add.text(this.player.x, this.player.y - 70, msg, {
      fontFamily: 'Cinzel, serif',
      fontSize: '18px',
      fontWeight: '900',
      color: '#fef08a',
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(40);

    this.tweens.add({
      targets: toast,
      y: toast.y - 35,
      alpha: 0,
      duration: 1800,
      onComplete: () => toast.destroy()
    });
  }

  triggerGameOver() {
    this.isGameOver = true;
    this.physics.pause();

    const titleEl = document.querySelector('.gameover-title');
    const subEl = document.querySelector('.gameover-subtitle');
    if (this.playerStats.survivalTime >= 2100) {
      if (titleEl) titleEl.textContent = 'ПОБЕДА: ЗАБЕГ ЗАВЕРШЕН!';
      if (subEl) subEl.textContent = 'Вы выжили 35 минут! Прибывший Жнец забрал вашу душу.';
    } else {
      if (titleEl) titleEl.textContent = 'ВЫ ПОГИБЛИ';
      if (subEl) subEl.textContent = 'Орда поглотила вас...';
    }

    document.getElementById('go-time').textContent = document.getElementById('survival-timer').textContent;
    document.getElementById('go-kills').textContent = `${this.playerStats.kills}`;
    document.getElementById('go-level').textContent = `LVL ${this.playerStats.level}`;

    document.getElementById('gameover-modal').style.display = 'flex';
  }
}

// ========================================================
// КОНФИГУРАЦИЯ PHASER 3 С РЕСАЙЗОМ ПОД ЛЮБОЙ ЭКРАН
// ========================================================
const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight
  },
  pixelArt: true,
  roundPixels: false,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: [RogueliteScene]
};

window.addEventListener('DOMContentLoaded', () => {
  new Phaser.Game(config);
});
