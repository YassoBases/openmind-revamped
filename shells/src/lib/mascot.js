/**
 * Mascot.js — OpenMind's character duo, drawn 100% with Phaser Graphics
 * (no images), implemented twice by design: here for the shells and as
 * Flutter CustomPainters in the app.
 *
 * HUDHUD the hoopoe — the exploration guide. Leads missions, presents
 *   questions, delivers hints (the crest fans open when an idea strikes),
 *   and handles every gentle moment: wrong answers, waiting rooms, breaks.
 *   Signature look: buff-orange body, long curved beak, black-and-white
 *   striped wing, and the iconic fan crest with black tips.
 *
 * NAHLA the bee — the rewards partner. Appears for XP, combos, streaks,
 *   level-complete celebrations and the summary screen. Constantly
 *   fluttering wings, loop-the-loop on combos. DESIGN RULE: the bee never
 *   goes sad — rewards only; Hudhud owns guidance and consolation.
 *
 * Both wear the student's accent color (Hudhud: scarf; Nahla: pollen dot)
 * and are never perfectly still: bob/hover, blink, crest/wing motion.
 *
 * Expressions: idle, happy, cheering, thinking, sad*, celebrating,
 * sleeping, surprised. (*Hoopoe only — see design rule.)
 */
(function () {
  'use strict';

  const INK = 0x2b2017;

  // ------------------------------------------------------------- HOOPOE
  const HP = {
    body: 0xe2a266,
    bodyShade: 0xc9854a,
    cream: 0xf6e3c8,
    dark: 0x2b2b2b,
    white: 0xf7f3ec,
    beak: 0x4a3b30,
  };

  class Hoopoe extends Phaser.GameObjects.Container {
    constructor(scene, x, y, opts) {
      super(scene, x, y);
      const o = opts || {};
      this.accent = o.accent == null ? 0x58cc02 : o.accent;
      this.expression = 'idle';
      this._blinking = false;
      this._crestPose = 'folded'; // folded | half | fan | droop

      this.tailG = scene.add.graphics();
      this.bodyG = scene.add.graphics();
      this.crestG = scene.add.graphics();
      this.headG = scene.add.graphics();
      this.faceG = scene.add.graphics();
      this.wingG = scene.add.graphics();
      this.extraG = scene.add.graphics(); // zzz / sparkle / sweat
      this.add([this.tailG, this.crestG, this.bodyG, this.wingG, this.headG, this.faceG, this.extraG]);

      this.drawBase();
      this.drawCrest('folded');
      this.drawFace('idle');

      scene.add.existing(this);
      if (o.scale) this.setScale(o.scale);

      // idle bob — never perfectly still
      this.bobTween = scene.tweens.add({
        targets: this, y: y - 6, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.scheduleBlink();
      this.on('destroy', () => { if (this.blinkTimer) this.blinkTimer.remove(); });
    }

    scheduleBlink() {
      this.blinkTimer = this.scene.time.delayedCall(4000 + Math.random() * 2000, () => {
        if (!this.active) return;
        if (this.expression === 'idle' || this.expression === 'thinking') {
          this._blinking = true;
          this.drawFace(this.expression);
          this.scene.time.delayedCall(130, () => {
            this._blinking = false;
            if (this.active) this.drawFace(this.expression);
          });
        }
        this.scheduleBlink();
      });
    }

    drawBase() {
      const t = this.tailG;
      t.clear();
      // black tail with a white band, sweeping back-left and slightly down
      t.fillStyle(HP.dark, 1);
      t.fillTriangle(-22, 2, -54, 8, -22, 16);
      t.fillStyle(HP.white, 1);
      t.fillTriangle(-38, 5.5, -45, 7.6, -38, 12.4);

      const b = this.bodyG;
      b.clear();
      // plump buff body
      b.fillStyle(HP.body, 1);
      b.fillEllipse(0, 10, 54, 44);
      b.fillStyle(HP.cream, 1);
      b.fillEllipse(4, 18, 34, 24); // belly
      // legs
      b.lineStyle(3.5, HP.beak, 1);
      b.beginPath(); b.moveTo(-6, 30); b.lineTo(-8, 44); b.strokePath();
      b.beginPath(); b.moveTo(6, 30); b.lineTo(6, 44); b.strokePath();
      b.beginPath(); b.moveTo(-12, 44); b.lineTo(-4, 44); b.strokePath();
      b.beginPath(); b.moveTo(2, 44); b.lineTo(10, 44); b.strokePath();
      // accent scarf at the neck — the student's color, worn by the guide
      b.fillStyle(this.accent, 1);
      b.fillRoundedRect(2, -12, 22, 8, 4);
      b.fillRoundedRect(16, -8, 8, 16, 4);

      this.drawWing(false);

      const h = this.headG;
      h.clear();
      h.fillStyle(HP.body, 1);
      h.fillCircle(16, -22, 16);
      // long, thin, slightly curved beak — the hoopoe signature
      h.fillStyle(HP.beak, 1);
      h.fillTriangle(28, -27, 28, -20, 56, -16);
      h.fillTriangle(40, -22.5, 40, -18.5, 56, -16); // droop at the tip
    }

    /** Black-and-white striped wing folded on the flank; raised = flap pose. */
    drawWing(raised) {
      const w = this.wingG;
      w.clear();
      w.fillStyle(HP.dark, 1);
      if (raised) {
        // wing thrown up behind the back
        w.fillEllipse(-14, -22, 30, 15);
        w.fillStyle(HP.white, 1);
        w.fillRect(-20, -28, 4.5, 12);
        w.fillRect(-11, -29, 4.5, 13);
      } else {
        // folded along the side, pointing back toward the tail
        w.fillEllipse(-8, 6, 32, 17);
        w.fillStyle(HP.white, 1);
        w.fillRect(-16, -1, 4.5, 14);
        w.fillRect(-7, -2, 4.5, 16);
      }
    }

    /**
     * The famous crest: feathers fanning from the head top, black tips.
     * folded (calm) | half (pondering) | fan (idea! / celebration) | droop.
     */
    drawCrest(pose) {
      this._crestPose = pose;
      const g = this.crestG;
      g.clear();
      const bx = 10, by = -32;
      const setups = {
        folded: { angles: [-2.55, -2.74, -2.93], len: 26 },
        half: { angles: [-2.9, -2.4, -1.92], len: 28 },
        fan: { angles: [-2.97, -2.62, -2.18, -1.75, -1.31, -0.96], len: 31 },
        droop: { angles: [-3.05, -2.93, -2.8], len: 23 },
      };
      const s = setups[pose] || setups.folded;
      for (const a of s.angles) {
        const tx = bx + Math.cos(a) * s.len;
        const ty = by + Math.sin(a) * s.len;
        g.lineStyle(7, HP.body, 1);
        g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.strokePath();
        g.fillStyle(HP.dark, 1);
        g.fillCircle(tx, ty, 4.2);
      }
    }

    /** Pop the crest open with a springy scale punch. */
    crestPop(pose) {
      this.drawCrest(pose);
      this.crestG.setScale(0.4);
      this.scene.tweens.add({
        targets: this.crestG, scaleX: 1, scaleY: 1, duration: 320, ease: 'Back.easeOut',
      });
    }

    drawFace(expr) {
      const f = this.faceG;
      const x = this.extraG;
      f.clear();
      x.clear();
      const ex = 20, ey = -26;

      const openEye = (r) => {
        f.fillStyle(0xffffff, 1);
        f.fillCircle(ex, ey, r);
        f.fillStyle(INK, 1);
        f.fillCircle(ex + 1, ey + 0.5, r * 0.55);
        f.fillStyle(0xffffff, 1);
        f.fillCircle(ex + r * 0.3, ey - r * 0.3, r * 0.18);
      };
      const closedEye = () => {
        f.lineStyle(3.5, INK, 1);
        f.beginPath(); f.moveTo(ex - 5, ey + 1); f.lineTo(ex + 5, ey + 1); f.strokePath();
      };
      const crescentEye = () => {
        f.lineStyle(3.5, INK, 1);
        f.beginPath(); f.arc(ex, ey + 1.5, 5, Math.PI * 1.15, Math.PI * 1.85, false); f.strokePath();
      };
      const blushDot = () => {
        f.fillStyle(0xff9d8a, 0.4);
        f.fillCircle(10, -14, 4.5);
      };

      switch (expr) {
        case 'happy':
          crescentEye(); blushDot();
          break;
        case 'cheering':
        case 'celebrating':
          crescentEye(); blushDot();
          // open beak cheer
          f.fillStyle(0x7c3b2a, 1);
          f.fillTriangle(30, -19, 38, -14, 30, -12);
          x.fillStyle(0xffe27a, 1);
          x.fillCircle(-30, -44, 3.5);
          x.fillCircle(44, -44, 3);
          break;
        case 'thinking':
          if (this._blinking) closedEye(); else openEye(5.5);
          // gaze up + floating "?" bubble
          x.fillStyle(0xffffff, 0.94);
          x.fillCircle(44, -52, 11);
          x.fillCircle(35, -42, 4);
          x.fillStyle(INK, 1);
          x.fillCircle(44, -49, 1.6);
          x.lineStyle(2.5, INK, 1);
          x.beginPath(); x.arc(44, -54, 4, Math.PI * 0.9, Math.PI * 2.05, false); x.strokePath();
          break;
        case 'sad':
          f.fillStyle(0xffffff, 1); f.fillCircle(ex, ey + 1, 5.5);
          f.fillStyle(INK, 1); f.fillCircle(ex, ey + 2.5, 3.2);
          f.lineStyle(3, HP.bodyShade, 1);
          f.beginPath(); f.moveTo(ex - 6, ey - 7); f.lineTo(ex + 5, ey - 4); f.strokePath();
          x.fillStyle(0x9adcff, 1);
          x.fillEllipse(ex - 2, ey + 10, 4, 6);
          break;
        case 'sleeping':
          closedEye();
          x.fillStyle(0xffffff, 0.9);
          x.fillRoundedRect(36, -58, 14, 4, 2);
          x.fillRoundedRect(40, -50, 10, 3.5, 1.5);
          x.fillRoundedRect(44, -43, 7, 3, 1.5);
          break;
        case 'surprised':
          openEye(7);
          f.fillStyle(0x7c3b2a, 1);
          f.fillEllipse(31, -15, 7, 8);
          break;
        case 'idle':
        default:
          if (this._blinking) closedEye(); else openEye(5.5);
          break;
      }
      this.expression = expr;
    }

    setExpression(expr) {
      if (this.expression === expr) return;
      // crest follows the mood
      const crest = {
        idle: 'folded', happy: 'half', cheering: 'fan', celebrating: 'fan',
        thinking: 'half', sad: 'droop', sleeping: 'folded', surprised: 'fan',
      }[expr] || 'folded';
      if (crest !== this._crestPose) {
        if (crest === 'fan') this.crestPop('fan');
        else this.drawCrest(crest);
      }
      this.drawWing(expr === 'cheering' || expr === 'celebrating');
      this.drawFace(expr);
    }

    /** Guide-side reactions: hints, gentle wrongs, level moments. */
    react(event) {
      const s = this.scene;
      switch (event) {
        case 'hint':
          // an idea strikes — the crest snaps open
          this.setExpression('thinking');
          this.crestPop('fan');
          s.time.delayedCall(900, () => this.active && this.drawCrest('half'));
          break;
        case 'correct':
          this.setExpression('happy');
          this.hop(8);
          s.time.delayedCall(1300, () => this.active && this.setExpression('idle'));
          break;
        case 'wrong':
          // briefly sad, recovers fast — gentle-feedback rule
          this.setExpression('sad');
          s.time.delayedCall(950, () => this.active && this.setExpression('idle'));
          break;
        case 'levelComplete':
        case 'combo':
        case 'streak':
          this.setExpression('celebrating');
          this.hop(16);
          s.time.delayedCall(2000, () => this.active && this.setExpression('happy'));
          break;
        case 'sleep':
          this.setExpression('sleeping');
          break;
        default:
          this.setExpression('idle');
      }
    }

    hop(height) {
      if (this._hopping) return;
      this._hopping = true;
      const bob = this.bobTween;
      if (bob) bob.pause();
      const startY = this.y;
      this.scene.tweens.add({
        targets: this, y: startY - (height || 12), duration: 150, yoyo: true, ease: 'Cubic.easeOut',
        onComplete: () => {
          this.y = startY;
          this._hopping = false;
          if (bob && this.active) bob.resume();
        },
      });
    }

    setAccent(color) {
      this.accent = color;
      this.drawBase();
    }
  }

  // ---------------------------------------------------------------- BEE
  const BEE = {
    yellow: 0xffd24a,
    yellowShade: 0xe8b426,
    stripe: 0x2b2b2b,
    wing: 0xffffff,
  };

  class Bee extends Phaser.GameObjects.Container {
    constructor(scene, x, y, opts) {
      super(scene, x, y);
      const o = opts || {};
      this.accent = o.accent == null ? 0x58cc02 : o.accent;
      this.expression = 'idle';
      this._blinking = false;

      this.wingsG = scene.add.graphics();
      this.bodyG = scene.add.graphics();
      this.faceG = scene.add.graphics();
      this.add([this.wingsG, this.bodyG, this.faceG]);

      this.drawBody();
      this.drawWings();
      this.drawFace('idle');

      scene.add.existing(this);
      if (o.scale) this.setScale(o.scale);

      // constant wing flutter — a bee is NEVER still
      this.flutter = scene.tweens.add({
        targets: this.wingsG, scaleY: 0.45, duration: 70, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      // quick hover bob (faster than the hoopoe's)
      this.hover = scene.tweens.add({
        targets: this, y: y - 5, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.scheduleBlink();
      this.on('destroy', () => { if (this.blinkTimer) this.blinkTimer.remove(); });
    }

    scheduleBlink() {
      this.blinkTimer = this.scene.time.delayedCall(3500 + Math.random() * 2500, () => {
        if (!this.active) return;
        if (this.expression === 'idle') {
          this._blinking = true;
          this.drawFace(this.expression);
          this.scene.time.delayedCall(120, () => {
            this._blinking = false;
            if (this.active) this.drawFace(this.expression);
          });
        }
        this.scheduleBlink();
      });
    }

    drawBody() {
      const b = this.bodyG;
      b.clear();
      // round striped body
      b.fillStyle(BEE.yellow, 1);
      b.fillEllipse(2, 0, 40, 32);
      b.fillStyle(BEE.stripe, 1);
      b.fillRoundedRect(-2, -15, 8, 30, 4);
      b.fillRoundedRect(10, -13, 7, 26, 3.5);
      // rounded tail (no stinger — friendly!)
      b.fillStyle(BEE.yellow, 1);
      b.fillCircle(20, 0, 7);
      // head
      b.fillStyle(BEE.yellow, 1);
      b.fillCircle(-18, -3, 12);
      // antennae with rounded tips
      b.lineStyle(2.5, BEE.stripe, 1);
      b.beginPath(); b.moveTo(-22, -13); b.lineTo(-27, -22); b.strokePath();
      b.beginPath(); b.moveTo(-16, -14); b.lineTo(-15, -24); b.strokePath();
      b.fillStyle(BEE.stripe, 1);
      b.fillCircle(-27.5, -23, 2.2);
      b.fillCircle(-15, -25, 2.2);
      // accent pollen basket — the student's color, carried by the bee
      b.fillStyle(this.accent, 1);
      b.fillCircle(2, 14, 4.5);
    }

    drawWings() {
      const w = this.wingsG;
      w.clear();
      w.fillStyle(BEE.wing, 0.68);
      w.fillEllipse(-4, -20, 26, 17);
      w.fillEllipse(12, -18, 21, 14);
      w.lineStyle(1.8, BEE.wing, 0.95);
      w.strokeEllipse(-4, -20, 26, 17);
      w.strokeEllipse(12, -18, 21, 14);
    }

    drawFace(expr) {
      const f = this.faceG;
      f.clear();
      const ex = -21, ey = -6;

      const openEyes = (r) => {
        for (const dx of [0, 7]) {
          f.fillStyle(0xffffff, 1);
          f.fillCircle(ex + dx, ey, r);
          f.fillStyle(INK, 1);
          f.fillCircle(ex + dx + 0.7, ey + 0.5, r * 0.55);
        }
      };
      const happyEyes = () => {
        f.lineStyle(2.8, INK, 1);
        for (const dx of [0, 7]) {
          f.beginPath();
          f.arc(ex + dx, ey + 1, 3.4, Math.PI * 1.15, Math.PI * 1.85, false);
          f.strokePath();
        }
      };
      const closedEyes = () => {
        f.lineStyle(2.8, INK, 1);
        for (const dx of [0, 7]) {
          f.beginPath(); f.moveTo(ex + dx - 3, ey + 1); f.lineTo(ex + dx + 3, ey + 1); f.strokePath();
        }
      };
      const smile = (big) => {
        f.lineStyle(2.6, INK, 1);
        f.beginPath();
        f.arc(ex + 3, ey + 6, big ? 5 : 3.5, Math.PI * 0.15, Math.PI * 0.85, false);
        f.strokePath();
      };

      // Design rule: the bee has NO sad face — rewards partner only.
      switch (expr) {
        case 'happy':
          happyEyes(); smile(false);
          f.fillStyle(0xff9d8a, 0.4);
          f.fillCircle(ex - 4, ey + 5, 2.6);
          f.fillCircle(ex + 11, ey + 5, 2.6);
          break;
        case 'cheering':
        case 'celebrating':
          happyEyes(); smile(true);
          f.fillStyle(0x7c3b2a, 1);
          f.fillEllipse(ex + 3, ey + 7.5, 5.5, 4);
          break;
        case 'sleeping':
          closedEyes();
          break;
        case 'idle':
        default:
          if (this._blinking) closedEyes(); else openEyes(3.6);
          smile(false);
          break;
      }
      this.expression = expr;
    }

    setExpression(expr) {
      if (expr === 'sad' || expr === 'wrong') return; // never sad, by design
      if (this.expression !== expr) this.drawFace(expr);
    }

    /** Rewards-side reactions: XP, combos, streaks, completions. */
    react(event) {
      const s = this.scene;
      switch (event) {
        case 'correct':
          this.setExpression('happy');
          this.spin(1);
          s.time.delayedCall(1300, () => this.active && this.setExpression('idle'));
          break;
        case 'combo':
        case 'streak':
          this.setExpression('cheering');
          this.loopTheLoop();
          s.time.delayedCall(1700, () => this.active && this.setExpression('idle'));
          break;
        case 'levelComplete':
        case 'mastery':
          this.setExpression('celebrating');
          this.spin(2);
          s.time.delayedCall(2200, () => this.active && this.setExpression('happy'));
          break;
        case 'sleep':
          this.setExpression('sleeping');
          break;
        default:
          this.setExpression('idle');
      }
    }

    spin(turns) {
      this.scene.tweens.add({
        targets: this, angle: 360 * (turns || 1), duration: 450 * (turns || 1), ease: 'Cubic.easeOut',
        onComplete: () => (this.angle = 0),
      });
    }

    /** Victory lap: a quick aerial loop around the home position. */
    loopTheLoop() {
      if (this._looping) return;
      this._looping = true;
      if (this.hover) this.hover.pause();
      const cx = this.x, cy = this.y, r = 16;
      this.scene.tweens.addCounter({
        from: 0, to: 1, duration: 800, ease: 'Sine.easeInOut',
        onUpdate: (tw) => {
          const t = tw.getValue() * Math.PI * 2;
          this.x = cx + Math.sin(t) * r;
          this.y = cy - Math.sin(t / 2) * r * 1.4;
          this.angle = Math.sin(t) * 25;
        },
        onComplete: () => {
          this.setPosition(cx, cy);
          this.angle = 0;
          this._looping = false;
          if (this.hover && this.active) this.hover.resume();
        },
      });
    }

    setAccent(color) {
      this.accent = color;
      this.drawBody();
    }
  }

  // --------------------------------------------------------------- Companion
  /**
   * Interest companions — one per archetype, same rounded big-eye style
   * family. Small (~56px), idles near the HUD, celebrates with the student.
   */
  class Companion extends Phaser.GameObjects.Container {
    constructor(scene, x, y, archetype, accent) {
      super(scene, x, y);
      this.archetype = archetype || 'space';
      this.accent = accent == null ? 0x58cc02 : accent;
      this.g = scene.add.graphics();
      this.add(this.g);
      this.draw();
      scene.add.existing(this);
      this.bob = scene.tweens.add({
        targets: this,
        y: y - 5,
        duration: 1500 + Math.random() * 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    eyes(g, dx, dy, r) {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(-dx, dy, r); g.fillCircle(dx, dy, r);
      g.fillStyle(0x131f24, 1);
      g.fillCircle(-dx + 1, dy + 1, r * 0.5); g.fillCircle(dx + 1, dy + 1, r * 0.5);
    }

    draw() {
      const g = this.g;
      const A = this.accent;
      g.clear();
      switch (this.archetype) {
        case 'dinosaurs':
          g.fillStyle(0x6fcf5a, 1);
          g.fillRoundedRect(-22, -18, 44, 38, 16);
          g.fillTriangle(-20, -18, -12, -32, -4, -18);
          g.fillTriangle(-6, -18, 2, -34, 10, -18);
          g.fillTriangle(8, -18, 16, -30, 24, -18);
          g.fillStyle(A, 0.9);
          g.fillCircle(-24, 8, 5); g.fillCircle(24, 8, 5);
          this.eyes(g, 9, -4, 6);
          g.fillStyle(0x35261c, 1);
          g.fillEllipse(0, 12, 10, 5);
          break;
        case 'space':
          g.fillStyle(0xe8edf2, 1);
          g.fillRoundedRect(-14, -26, 28, 44, 12); // rocket body
          g.fillStyle(A, 1);
          g.fillTriangle(-14, -26, 0, -42, 14, -26); // nose cone
          g.fillTriangle(-14, 8, -24, 22, -14, 18);
          g.fillTriangle(14, 8, 24, 22, 14, 18);
          g.fillStyle(0x1cb0f6, 1);
          g.fillCircle(0, -8, 9); // porthole
          this.eyes(g, 4, -8, 3);
          g.fillStyle(0xffc800, 1);
          g.fillTriangle(-7, 18, 0, 32, 7, 18); // flame
          break;
        case 'football':
          g.fillStyle(0xffffff, 1);
          g.fillCircle(0, 0, 24);
          g.fillStyle(0x131f24, 1);
          g.fillCircle(0, 8, 7);
          g.fillCircle(-15, -6, 5); g.fillCircle(15, -6, 5);
          g.fillStyle(A, 0.85);
          g.fillCircle(0, -16, 5);
          this.eyes(g, 8, -4, 5);
          break;
        case 'cats':
          g.fillStyle(0x9aa7b8, 1);
          g.fillRoundedRect(-22, -16, 44, 36, 17);
          g.fillTriangle(-20, -14, -14, -30, -4, -16);
          g.fillTriangle(20, -14, 14, -30, 4, -16);
          g.fillStyle(0xf7b1c4, 1);
          g.fillTriangle(-16, -16, -13, -25, -8, -17);
          g.fillTriangle(16, -16, 13, -25, 8, -17);
          this.eyes(g, 9, -2, 5);
          g.fillStyle(0xf7b1c4, 1);
          g.fillTriangle(-3, 6, 3, 6, 0, 11);
          g.lineStyle(2, 0x5d6878, 1);
          g.beginPath(); g.moveTo(-22, 4); g.lineTo(-34, 2); g.strokePath();
          g.beginPath(); g.moveTo(22, 4); g.lineTo(34, 2); g.strokePath();
          g.fillStyle(A, 0.9);
          g.fillRoundedRect(-8, 14, 16, 6, 3); // collar
          break;
        case 'robots':
          g.fillStyle(0xb8c4d4, 1);
          g.fillRoundedRect(-20, -20, 40, 38, 10);
          g.fillStyle(A, 1);
          g.fillCircle(0, -28, 4);
          g.lineStyle(3, 0xb8c4d4, 1);
          g.beginPath(); g.moveTo(0, -24); g.lineTo(0, -20); g.strokePath();
          g.fillStyle(0x131f24, 0.85);
          g.fillRoundedRect(-14, -12, 28, 14, 6);
          g.fillStyle(0x6ef3ff, 1);
          g.fillCircle(-7, -5, 4); g.fillCircle(7, -5, 4);
          g.fillStyle(0x131f24, 0.6);
          g.fillRoundedRect(-9, 8, 18, 4, 2);
          break;
        case 'ocean':
          g.fillStyle(0x57c7f7, 1);
          g.fillEllipse(0, 0, 46, 30);
          g.fillTriangle(20, 0, 36, -12, 36, 12); // tail
          g.fillStyle(A, 0.85);
          g.fillTriangle(-4, -14, 4, -26, 10, -14); // top fin
          this.eyes(g, 9, -3, 5);
          g.lineStyle(3, 0x2b8ec9, 1);
          g.beginPath(); g.arc(-2, 6, 6, Math.PI * 0.1, Math.PI * 0.9); g.strokePath();
          break;
        case 'cars':
          g.fillStyle(A, 1);
          g.fillRoundedRect(-26, -8, 52, 18, 8);
          g.fillRoundedRect(-14, -20, 28, 16, 7);
          g.fillStyle(0xbfe8ff, 1);
          g.fillRoundedRect(-10, -17, 20, 10, 4);
          g.fillStyle(0x131f24, 1);
          g.fillCircle(-14, 12, 7); g.fillCircle(14, 12, 7);
          g.fillStyle(0xe8edf2, 1);
          g.fillCircle(-14, 12, 3); g.fillCircle(14, 12, 3);
          this.eyes(g, 5, -12, 3);
          break;
        case 'royalty':
          g.fillStyle(0xffc800, 1);
          g.fillTriangle(-22, 10, -22, -16, -8, 2);
          g.fillTriangle(-10, 10, 0, -22, 10, 10);
          g.fillTriangle(8, 2, 22, -16, 22, 10);
          g.fillRoundedRect(-24, 6, 48, 12, 5);
          g.fillStyle(A, 1);
          g.fillCircle(0, -2, 5);
          g.fillStyle(0xce82ff, 1);
          g.fillCircle(-16, 2, 3.5); g.fillCircle(16, 2, 3.5);
          this.eyes(g, 8, 11, 3.5);
          break;
        case 'art':
          g.fillStyle(0xd9a066, 1);
          g.fillEllipse(0, 2, 48, 34);
          g.fillStyle(0xfff3e0, 1);
          g.fillEllipse(6, 6, 14, 9); // thumb hole
          g.fillStyle(0xff4b4b, 0.9); g.fillCircle(-13, -6, 5);
          g.fillStyle(0x1cb0f6, 0.9); g.fillCircle(-1, -10, 5);
          g.fillStyle(0xffc800, 0.9); g.fillCircle(11, -6, 5);
          g.fillStyle(A, 0.95); g.fillCircle(-16, 6, 5);
          this.eyes(g, 6, 12, 3.5);
          break;
        case 'music':
        default:
          g.fillStyle(0x131f24, 1);
          g.fillEllipse(-10, 14, 18, 13);
          g.fillEllipse(14, 18, 18, 13);
          g.fillRoundedRect(-4, -26, 5, 40, 2);
          g.fillRoundedRect(20, -30, 5, 48, 2);
          g.fillStyle(A, 1);
          g.fillRoundedRect(-4, -28, 29, 8, 4);
          this.eyes(g, 5, 14, 3); // eyes on the left note head
          break;
      }
    }

    celebrate() {
      this.scene.tweens.add({
        targets: this,
        angle: { from: -12, to: 12 },
        duration: 110,
        yoyo: true,
        repeat: 3,
        onComplete: () => (this.angle = 0),
      });
      if (this.bob) this.bob.pause();
      const startY = this.y;
      this.scene.tweens.add({
        targets: this,
        y: startY - 16,
        duration: 160,
        yoyo: true,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          this.y = startY;
          if (this.bob && this.active) this.bob.resume();
        },
      });
    }
  }

  window.Hoopoe = Hoopoe;
  window.Bee = Bee;
  window.Companion = Companion;
})();
