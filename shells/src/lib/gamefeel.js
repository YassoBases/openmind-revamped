/**
 * GameFeel.js — the juice library shared by all EduMind shells.
 *
 * Screen shake, pooled particles (hard cap 36 alive), score/XP/combo popups,
 * candy buttons (the ONLY button style), typewriter text, cascade entrances,
 * breathing CTAs, and a Web Audio synthesizer (no audio files, no buzzers).
 *
 * Budget rules baked in:
 *  - particle pools: 3 emitters x 12 maxAliveParticles = 36 cap
 *  - flashes clamped to <=100ms, pure red rewritten to amber (photosensitivity)
 *  - touch targets >= 44px enforced in candyButton
 *  - liveliness is choreography: tween existing objects, don't spawn new ones
 */
(function () {
  'use strict';

  const TOUCH_MIN = 44; // px, minimum touch target (enforced)
  const PARTICLE_CAP_PER_POOL = 12; // 3 pools x 12 = 36 total cap

  // ---------------------------------------------------------------- colors
  function hexToInt(hex) {
    return parseInt(String(hex).replace('#', ''), 16) >>> 0;
  }
  function intToRgb(c) {
    return { r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255 };
  }
  function rgbToInt(r, g, b) {
    return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
  }
  function darken(color, amount) {
    const c = typeof color === 'string' ? hexToInt(color) : color;
    const { r, g, b } = intToRgb(c);
    const f = 1 - (amount == null ? 0.18 : amount);
    return rgbToInt(Math.round(r * f), Math.round(g * f), Math.round(b * f));
  }
  function lighten(color, amount) {
    const c = typeof color === 'string' ? hexToInt(color) : color;
    const { r, g, b } = intToRgb(c);
    const a = amount == null ? 0.25 : amount;
    return rgbToInt(
      Math.round(r + (255 - r) * a),
      Math.round(g + (255 - g) * a),
      Math.round(b + (255 - b) * a)
    );
  }
  /** Photosensitivity guard: pure/harsh reds become warm amber for flashes. */
  function safeFlashColor(color) {
    const c = typeof color === 'string' ? hexToInt(color) : color;
    const { r, g, b } = intToRgb(c);
    if (r > 200 && g < 90 && b < 90) return 0xffb020; // amber
    return c;
  }
  /** Readable text color (white/dark) for a given background. */
  function contrastOn(color) {
    const c = typeof color === 'string' ? hexToInt(color) : color;
    const { r, g, b } = intToRgb(c);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 190 ? 0x131f24 : 0xffffff;
  }

  // ---------------------------------------------------------------- audio
  // Pure Web Audio synthesis. Soft, rounded, never harsh.
  const Audio = {
    ctx: null,
    master: null,
    muted: false,
    _crowdTimer: null,

    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.5;
    },

    /** One soft synth note. type: sine/triangle/square. */
    tone(freq, opts) {
      const o = opts || {};
      const ctx = this.ensure();
      if (!ctx || this.muted) return;
      const t0 = ctx.currentTime + (o.delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t0 + (o.dur || 0.18));
      const vol = o.vol == null ? 0.22 : o.vol;
      const dur = o.dur == null ? 0.18 : o.dur;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    },

    /** Combo-aware correct chime: climbs a semitone per combo, caps at +12 (one octave). */
    correctChain(combo) {
      const steps = Math.min(Math.max(combo || 0, 0), 12);
      const base = 523.25; // C5
      const f = base * Math.pow(2, steps / 12);
      this.tone(f, { type: 'triangle', vol: 0.2, dur: 0.12 });
      this.tone(f * 1.25, { type: 'triangle', vol: 0.16, dur: 0.16, delay: 0.09 });
      this.tone(f * 1.5, { type: 'sine', vol: 0.12, dur: 0.22, delay: 0.18 });
    },

    /** Gentle wrong-answer: soft descending two-tone E4 -> C4. Never a buzzer. */
    wrongTone() {
      this.tone(329.63, { type: 'sine', vol: 0.14, dur: 0.16 });
      this.tone(261.63, { type: 'sine', vol: 0.12, dur: 0.24, delay: 0.14 });
    },

    pop() {
      this.tone(880, { type: 'sine', vol: 0.1, dur: 0.06, glideTo: 1320 });
    },

    tick() {
      this.tone(1567, { type: 'sine', vol: 0.05, dur: 0.03 });
    },

    /** Typewriter blip (very quiet). */
    blip() {
      this.tone(740 + Math.random() * 120, { type: 'sine', vol: 0.025, dur: 0.025 });
    },

    /** Theme sting: tiny 3-note motif. */
    sting(theme) {
      const motifs = {
        fantasy: [392, 523.25, 659.25],
        sci_fi: [440, 554.37, 880],
        detective: [311.13, 369.99, 466.16],
        anime: [523.25, 659.25, 783.99],
        football: [392, 493.88, 587.33],
        basketball: [349.23, 440, 523.25],
        hockey: [329.63, 415.3, 493.88],
        archery: [440, 587.33, 659.25],
        blueprint: [523.25, 587.33, 783.99],
        notebook: [493.88, 587.33, 740],
        whiteboard: [523.25, 659.25, 698.46],
        chalkboard: [466.16, 554.37, 698.46],
      };
      const m = motifs[theme] || motifs.fantasy;
      m.forEach((f, i) => this.tone(f, { type: 'triangle', vol: 0.16, dur: 0.22, delay: i * 0.11 }));
    },

    /** Level-complete celebration arpeggio. */
    celebration() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        this.tone(f, { type: 'triangle', vol: 0.18, dur: 0.2, delay: i * 0.09 })
      );
      this.tone(1568, { type: 'sine', vol: 0.1, dur: 0.4, delay: 0.4 });
    },

    /** Boss/dramatic sting. */
    drama() {
      this.tone(98, { type: 'triangle', vol: 0.22, dur: 0.5 });
      this.tone(110, { type: 'triangle', vol: 0.18, dur: 0.45, delay: 0.18 });
      this.tone(196, { type: 'sine', vol: 0.12, dur: 0.6, delay: 0.3 });
    },

    /** Stadium crowd murmur — retriggers every 4.5s, NOT continuous. */
    crowdStart() {
      if (this._crowdTimer) return;
      const fire = () => {
        const ctx = this.ensure();
        if (ctx && !this.muted) this._murmurOnce();
      };
      fire();
      this._crowdTimer = setInterval(fire, 4500);
    },
    crowdStop() {
      if (this._crowdTimer) {
        clearInterval(this._crowdTimer);
        this._crowdTimer = null;
      }
    },
    _murmurOnce() {
      const ctx = this.ctx;
      const t0 = ctx.currentTime;
      const dur = 2.2;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 420;
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(t0);
      src.stop(t0 + dur);
    },

    /** Crowd cheer burst (goal scored). */
    cheer() {
      const ctx = this.ensure();
      if (!ctx || this.muted) return;
      const t0 = ctx.currentTime;
      const dur = 1.4;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(700, t0);
      filter.frequency.exponentialRampToValueAtTime(1400, t0 + 0.35);
      filter.frequency.exponentialRampToValueAtTime(500, t0 + dur);
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(t0);
      src.stop(t0 + dur);
    },
  };

  // ------------------------------------------------------------- textures
  /** Generate the small shared particle textures once per scene boot. */
  function ensureParticleTextures(scene) {
    const tm = scene.textures;
    if (!tm.exists('gf_dot')) {
      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(8, 8, 8);
      g.generateTexture('gf_dot', 16, 16);
      g.clear();
      // soft star (rounded diamond sparkle)
      g.fillStyle(0xffffff, 1);
      g.beginPath();
      g.moveTo(12, 0);
      g.lineTo(16, 8);
      g.lineTo(24, 12);
      g.lineTo(16, 16);
      g.lineTo(12, 24);
      g.lineTo(8, 16);
      g.lineTo(0, 12);
      g.lineTo(8, 8);
      g.closePath();
      g.fillPath();
      g.generateTexture('gf_star', 24, 24);
      g.clear();
      // confetti rectangle
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(0, 0, 12, 7, 2);
      g.generateTexture('gf_confetti', 12, 7);
      g.destroy();
    }
  }

  // ------------------------------------------------------------- Feel rig
  /**
   * Per-scene juice rig. Create with GameFeel.attach(scene) in create().
   * Owns the particle pools, popup pool and camera effects for that scene.
   */
  class Feel {
    constructor(scene) {
      this.scene = scene;
      ensureParticleTextures(scene);

      // Three pooled emitters, 12 alive max each => hard cap 36 particles.
      this.burstEmitter = scene.add.particles(0, 0, 'gf_dot', {
        speed: { min: 90, max: 260 },
        scale: { start: 0.9, end: 0 },
        lifespan: 600,
        gravityY: 300,
        emitting: false,
        maxAliveParticles: PARTICLE_CAP_PER_POOL,
      }).setDepth(900);

      this.sparkleEmitter = scene.add.particles(0, 0, 'gf_star', {
        speed: { min: 30, max: 120 },
        scale: { start: 0.8, end: 0 },
        angle: { min: 0, max: 360 },
        rotate: { min: -180, max: 180 },
        lifespan: 700,
        emitting: false,
        maxAliveParticles: PARTICLE_CAP_PER_POOL,
      }).setDepth(900);

      this.confettiEmitter = scene.add.particles(0, 0, 'gf_confetti', {
        speedX: { min: -120, max: 120 },
        speedY: { min: -40, max: 60 },
        gravityY: 260,
        rotate: { min: -360, max: 360 },
        scale: { start: 1, end: 0.5 },
        alpha: { start: 1, end: 0.4 },
        lifespan: 1400,
        emitting: false,
        maxAliveParticles: PARTICLE_CAP_PER_POOL,
      }).setDepth(901);

      // Popup text pool (score/XP/combo) — reused, never allocated mid-game.
      this.popupPool = [];
      for (let i = 0; i < 4; i++) {
        const t = scene.add.text(0, 0, '', {
          fontFamily: 'Nunito, Tajawal, sans-serif',
          fontSize: '34px',
          fontStyle: '800',
          color: '#FFC800',
          stroke: '#131F24',
          strokeThickness: 6,
        }).setOrigin(0.5).setDepth(950).setVisible(false);
        this.popupPool.push(t);
      }
    }

    // -- camera juice ------------------------------------------------------
    shake(intensity, dur) {
      this.scene.cameras.main.shake(dur || 120, intensity == null ? 0.004 : intensity);
    }

    /** Flash clamped to 100ms; harsh red auto-rewritten to amber. */
    flash(color, dur) {
      const c = intToRgb(safeFlashColor(color == null ? 0xffffff : color));
      this.scene.cameras.main.flash(Math.min(dur || 90, 100), c.r, c.g, c.b);
    }

    zoomPunch(amount, dur) {
      const cam = this.scene.cameras.main;
      const base = cam.zoom;
      this.scene.tweens.add({
        targets: cam,
        zoom: base * (amount || 1.04),
        duration: (dur || 160) / 2,
        ease: 'Cubic.easeOut',
        yoyo: true,
        onComplete: () => cam.setZoom(base),
      });
    }

    // -- particles ---------------------------------------------------------
    burst(x, y, color, count) {
      this.burstEmitter.setParticleTint(color == null ? 0xffffff : color);
      this.burstEmitter.explode(Math.min(count || 10, PARTICLE_CAP_PER_POOL), x, y);
    }

    sparkle(x, y, color, count) {
      this.sparkleEmitter.setParticleTint(color == null ? 0xffe27a : color);
      this.sparkleEmitter.explode(Math.min(count || 8, PARTICLE_CAP_PER_POOL), x, y);
    }

    confetti(x, y, colors, count) {
      const palette = colors && colors.length ? colors : [0x58cc02, 0x1cb0f6, 0xffc800, 0xce82ff];
      this.confettiEmitter.setParticleTint(palette[Math.floor(Math.random() * palette.length)]);
      this.confettiEmitter.explode(Math.min(count || 12, PARTICLE_CAP_PER_POOL), x, y);
    }

    /** Big celebration: confetti from both top corners + sparkles center. */
    celebrate(colors) {
      const w = this.scene.scale.width;
      this.confetti(w * 0.2, 80, colors, 12);
      this.scene.time.delayedCall(160, () => this.confetti(w * 0.8, 80, colors, 12));
      this.scene.time.delayedCall(320, () => this.sparkle(w / 2, 320, 0xffe27a, 10));
      Audio.celebration();
    }

    // -- popups --------------------------------------------------------------
    popText(x, y, str, opts) {
      const o = opts || {};
      const t = this.popupPool.find((p) => !p.visible) || this.popupPool[0];
      t.setText(str);
      t.setColor(o.color || '#FFC800');
      t.setFontSize(o.size || 34);
      t.setPosition(x, y);
      t.setAlpha(0);
      t.setScale(0.6);
      t.setVisible(true);
      this.scene.tweens.add({
        targets: t,
        y: y - 64,
        alpha: { value: 1, duration: 120 },
        scale: 1,
        duration: 420,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.scene.tweens.add({
            targets: t,
            alpha: 0,
            y: t.y - 24,
            duration: 260,
            ease: 'Cubic.easeIn',
            onComplete: () => t.setVisible(false),
          });
        },
      });
    }

    // -- impact animation helpers -------------------------------------------
    /** Squash & stretch impact on any object with scale. */
    squash(target, intensity, dur) {
      const i = intensity == null ? 0.18 : intensity;
      const sx = target.scaleX, sy = target.scaleY;
      this.scene.tweens.add({
        targets: target,
        scaleX: sx * (1 + i),
        scaleY: sy * (1 - i),
        duration: (dur || 180) * 0.35,
        ease: 'Cubic.easeOut',
        yoyo: true,
        onComplete: () => target.setScale(sx, sy),
      });
    }

    /** Anticipation wiggle on touch-down (answer options). */
    wiggle(target, angle) {
      this.scene.tweens.add({
        targets: target,
        angle: { from: -(angle || 1.4), to: angle || 1.4 },
        duration: 60,
        yoyo: true,
        repeat: 1,
        onComplete: () => (target.angle = 0),
      });
    }

    /** Subtle 2-3% breathing pulse for primary CTAs. Returns the tween. */
    breathe(target, amount) {
      const a = amount == null ? 0.025 : amount;
      return this.scene.tweens.add({
        targets: target,
        scaleX: target.scaleX * (1 + a),
        scaleY: target.scaleY * (1 + a),
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    /** Staggered entrance cascade: objects pop in 60-80ms apart. */
    cascadeIn(targets, opts) {
      const o = opts || {};
      const stagger = o.stagger == null ? 70 : o.stagger;
      const dy = o.dy == null ? 26 : o.dy;
      return new Promise((resolve) => {
        let done = 0;
        targets.forEach((t, i) => {
          const fy = t.y;
          t.y = fy + dy;
          t.setAlpha(0);
          if (t.setScale) t.setScale(0.92);
          this.scene.tweens.add({
            targets: t,
            y: fy,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: 300,
            delay: i * stagger,
            ease: 'Back.easeOut',
            onComplete: () => {
              done++;
              if (done === targets.length) resolve();
            },
          });
        });
        if (!targets.length) resolve();
      });
    }

    /** Typewriter effect on a Phaser Text. Resolves when complete. skipOn: gameobject tap skips. */
    typewriter(textObj, fullString, opts) {
      const o = opts || {};
      const cps = o.cps || 36;
      textObj.setText('');
      return new Promise((resolve) => {
        let i = 0;
        let finished = false;
        const timer = this.scene.time.addEvent({
          delay: 1000 / cps,
          repeat: fullString.length - 1,
          callback: () => {
            i++;
            textObj.setText(fullString.slice(0, i));
            if (i % 3 === 0) Audio.blip();
            if (i >= fullString.length && !finished) {
              finished = true;
              resolve();
            }
          },
        });
        if (o.skipOn) {
          o.skipOn.once('pointerdown', () => {
            if (!finished) {
              finished = true;
              timer.remove();
              textObj.setText(fullString);
              resolve();
            }
          });
        }
      });
    }
  }

  // ----------------------------------------------------------- candy button
  /**
   * The ONLY button style in EduMind: solid top face, ~5px darker shadow band,
   * presses down 5px on tap. Returns a Container with .onTap, .setLabel,
   * .setEnabled, .face/.label exposed and >=44px touch target enforced.
   */
  function candyButton(scene, x, y, w, h, label, opts) {
    const o = opts || {};
    const width = Math.max(w, TOUCH_MIN);
    const height = Math.max(h, TOUCH_MIN);
    const colorInt = typeof o.color === 'string' ? hexToInt(o.color) : (o.color == null ? 0x58cc02 : o.color);
    const radius = Math.min(o.radius == null ? 16 : o.radius, height / 2);
    const drop = 5;

    const container = scene.add.container(x, y);

    const shadow = scene.add.graphics();
    shadow.fillStyle(darken(colorInt, 0.3), 1);
    shadow.fillRoundedRect(-width / 2, -height / 2 + drop, width, height, radius);

    const face = scene.add.graphics();
    face.fillStyle(colorInt, 1);
    face.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    // glossy top highlight
    face.fillStyle(lighten(colorInt, 0.18), 0.35);
    face.fillRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, Math.max(height * 0.28, 10), Math.max(radius - 5, 4));

    const isAr = !!o.arabic;
    const text = scene.add.text(0, 0, label, {
      fontFamily: isAr ? 'Tajawal, sans-serif' : 'Nunito, sans-serif',
      fontSize: (o.fontSize || (isAr ? 30 : 28)) + 'px',
      fontStyle: '800',
      color: o.labelColor || '#' + contrastOn(colorInt).toString(16).padStart(6, '0'),
      align: 'center',
      rtl: isAr,
      wordWrap: o.wrap ? { width: width - 36, useAdvancedWrap: true } : undefined,
    }).setOrigin(0.5);

    container.add([shadow, face, text]);
    // Phaser 4: containers need setSize() then a plain setInteractive()
    // (explicit Geom.Rectangle hit areas misalign on containers in v4).
    container.setSize(width, height + drop);
    container.setInteractive({ useHandCursor: true });

    let enabled = true;
    let pressed = false;

    container.on('pointerdown', () => {
      if (!enabled) return;
      pressed = true;
      face.y = drop;
      text.y = drop;
      Audio.tick();
    });
    const release = (fire) => {
      if (!pressed) return;
      pressed = false;
      face.y = 0;
      text.y = 0;
      if (fire && enabled) {
        Audio.pop();
        if (container.onTap) container.onTap();
      }
    };
    container.on('pointerup', () => release(true));
    container.on('pointerout', () => release(false));

    container.onTap = o.onTap || null;
    container.btnWidth = width;
    container.btnHeight = height;
    container.face = face;
    container.labelText = text;
    container.setLabel = (s) => text.setText(s);
    container.setEnabled = (e) => {
      enabled = e;
      container.setAlpha(e ? 1 : 0.55);
    };
    container.isCandyButton = true;
    return container;
  }

  // ------------------------------------------------------------------ panel
  /** Rounded card panel (radius 24 per design system). Returns Graphics. */
  function cardPanel(scene, x, y, w, h, opts) {
    const o = opts || {};
    const g = scene.add.graphics();
    const color = o.color == null ? 0xffffff : o.color;
    const alpha = o.alpha == null ? 1 : o.alpha;
    const radius = o.radius == null ? 24 : o.radius;
    if (o.shadow !== false) {
      g.fillStyle(0x000000, 0.18);
      g.fillRoundedRect(x - w / 2 + 3, y - h / 2 + 6, w, h, radius);
    }
    g.fillStyle(color, alpha);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, radius);
    if (o.stroke) {
      g.lineStyle(o.strokeWidth || 3, o.stroke, 1);
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, radius);
    }
    return g;
  }

  window.GameFeel = {
    TOUCH_MIN,
    PARTICLE_CAP: PARTICLE_CAP_PER_POOL * 3,
    attach: (scene) => new Feel(scene),
    candyButton,
    cardPanel,
    audio: Audio,
    hexToInt,
    darken,
    lighten,
    contrastOn,
    safeFlashColor,
  };
})();
