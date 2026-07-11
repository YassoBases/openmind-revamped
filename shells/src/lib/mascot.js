/**
 * Mascot.js — OpenMind's brand character duo, drawn 100% with Phaser Graphics
 * (no images), implemented twice by design (Flutter CustomPainters mirror this).
 *
 * HUDHUD the hoopoe — exploration, curiosity & hints. Warm-orange body, big
 *   curious eyes with expressive brows, long down-curved beak, and the signature
 *   fan crest of orange feathers each with a white band + black rounded tip.
 *   The crest is his tell: it sways while idle, fans wide on a hint ("an idea!"),
 *   and droops when consoling a wrong answer. He leads missions and teach cards.
 *
 * NAHLA the bee — companionship, progress & accomplishment. Round fuzzy
 *   yellow body with soft brown stripes, big friendly eyes + brows, a teal
 *   scarf, two blue translucent wings that flutter constantly, and her
 *   signature glowing golden **XP hexagon** which she proudly holds up whenever
 *   the student earns something. She never has a sad face — rewards only.
 *
 * Both wear the student's accent color (Hudhud: crest-feather glow + scarf;
 * Nahla: scarf trim + sparkle tint) and are never perfectly still.
 *
 * Expressions: idle, happy, cheering, thinking, sad*, celebrating, sleeping,
 * surprised. (*hoopoe only.)
 */
(function () {
  'use strict';

  const INK = 0x2b2017;

  // ------------------------------------------------------------- HOOPOE
  const HP = {
    body: 0xf3993d,        // warm orange
    bodyLight: 0xf8b766,   // face / upper body
    belly: 0xf7c98a,       // cream-orange belly
    bodyDark: 0xdd7a26,    // shading
    crest: 0xf3993d,
    crestBand: 0xf6efe2,   // white band below the tip
    crestTip: 0x2c2c2c,    // black rounded tip
    beak: 0x6f6a64,        // grey-brown
    beakDark: 0x514c46,
    wingBand: 0xf6efe2,    // cream wing stripe
    wingDark: 0x2c2c2c,    // black wing stripe
    wingTip: 0x4a382c,     // brown flight feathers
    leg: 0x5a4a3e,
  };

  class Hoopoe extends Phaser.GameObjects.Container {
    constructor(scene, x, y, opts) {
      super(scene, x, y);
      const o = opts || {};
      this.accent = o.accent == null ? 0x58cc02 : o.accent;
      this.expression = 'idle';
      this._blinking = false;
      this._crestPose = 'folded';

      this.legsG = scene.add.graphics();
      this.tailG = scene.add.graphics();
      this.crestG = scene.add.graphics();   // positioned at crest base, rotates to sway
      this.bodyG = scene.add.graphics();
      this.headG = scene.add.graphics();
      this.beakG = scene.add.graphics();
      this.wingG = scene.add.graphics();     // positioned at shoulder, rotates to point
      this.faceG = scene.add.graphics();
      this.extraG = scene.add.graphics();    // thought bubble / sparkle / tear / zzz

      this.crestBase = { x: 4, y: -50 };
      this.shoulder = { x: -16, y: 8 };
      this.crestG.setPosition(this.crestBase.x, this.crestBase.y);
      this.wingG.setPosition(this.shoulder.x, this.shoulder.y);

      this.add([this.legsG, this.tailG, this.crestG, this.bodyG, this.headG, this.beakG, this.wingG, this.faceG, this.extraG]);

      this.drawBase();
      this.drawCrest('folded');
      this.drawFace('idle');

      scene.add.existing(this);
      if (o.scale) this.setScale(o.scale);

      // idle bob — never perfectly still
      this.bobTween = scene.tweens.add({
        targets: this, y: y - 6, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      // constant gentle crest sway (curiosity)
      this.crestSway = scene.tweens.add({
        targets: this.crestG, rotation: { from: -0.06, to: 0.06 },
        duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.scheduleBlink();
      this.scheduleCurious();
      this.on('destroy', () => {
        if (this.blinkTimer) this.blinkTimer.remove();
        if (this.curiousTimer) this.curiousTimer.remove();
      });
    }

    scheduleBlink() {
      this.blinkTimer = this.scene.time.delayedCall(3800 + Math.random() * 2200, () => {
        if (!this.active) return;
        if (this.expression === 'idle' || this.expression === 'thinking' || this.expression === 'happy') {
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

    /** Occasional curious head-cock + crest ruffle while idle. */
    scheduleCurious() {
      this.curiousTimer = this.scene.time.delayedCall(4500 + Math.random() * 3500, () => {
        if (!this.active) return;
        if (this.expression === 'idle') {
          this.scene.tweens.add({
            targets: this, angle: { from: 0, to: -5 }, duration: 280, yoyo: true,
            hold: 380, ease: 'Sine.easeInOut',
          });
          this.crestPop('half');
          this.scene.time.delayedCall(950, () => this.active && this._crestPose === 'half' && this.drawCrest('folded'));
        }
        this.scheduleCurious();
      });
    }

    drawBase() {
      // legs + feet
      const lg = this.legsG;
      lg.clear();
      lg.lineStyle(4, HP.leg, 1);
      for (const lx of [-9, 9]) {
        lg.beginPath(); lg.moveTo(lx, 34); lg.lineTo(lx + (lx < 0 ? -1 : 1), 58); lg.strokePath();
        // three little toes
        lg.beginPath(); lg.moveTo(lx - 1, 58); lg.lineTo(lx - 8, 63); lg.strokePath();
        lg.beginPath(); lg.moveTo(lx, 58); lg.lineTo(lx, 64); lg.strokePath();
        lg.beginPath(); lg.moveTo(lx + 1, 58); lg.lineTo(lx + 8, 63); lg.strokePath();
      }

      // tail — banded black/white, sweeping down-left behind
      const t = this.tailG;
      t.clear();
      t.fillStyle(HP.wingDark, 1);
      t.fillTriangle(-14, 24, -52, 50, -10, 44);
      t.fillStyle(HP.wingBand, 1);
      t.fillTriangle(-22, 33, -40, 44, -16, 41);

      // body: plump egg, cream belly
      const b = this.bodyG;
      b.clear();
      b.fillStyle(HP.body, 1);
      b.fillEllipse(0, 16, 66, 86);
      b.fillStyle(HP.bodyLight, 1);
      b.fillEllipse(2, 6, 54, 60); // upper/chest lighter
      b.fillStyle(HP.belly, 1);
      b.fillEllipse(4, 26, 38, 46); // belly patch

      // head: round, blends into body, slightly forward
      const h = this.headG;
      h.clear();
      h.fillStyle(HP.bodyLight, 1);
      h.fillCircle(8, -34, 27);
      // soft brow ridge shading
      h.fillStyle(HP.body, 0.5);
      h.fillEllipse(8, -48, 40, 18);

      this.drawBeak();
      this.drawWing(false);
    }

    drawBeak() {
      // long, thin, down-curved beak via a quadratic bezier wedge
      const k = this.beakG;
      k.clear();
      const root = new Phaser.Math.Vector2(30, -30);
      const ctrl = new Phaser.Math.Vector2(74, -22);
      const tip = new Phaser.Math.Vector2(96, -2);
      const upper = new Phaser.Curves.QuadraticBezier(root, ctrl, tip);
      const lowerRoot = new Phaser.Math.Vector2(30, -22);
      const lowerCtrl = new Phaser.Math.Vector2(70, -16);
      const lower = new Phaser.Curves.QuadraticBezier(lowerRoot, lowerCtrl, tip);
      const pts = upper.getPoints(16).concat(lower.getPoints(16).reverse());
      k.fillStyle(HP.beak, 1);
      k.fillPoints(pts, true);
      k.fillStyle(HP.beakDark, 1);
      // subtle lower-mandible shadow
      const lpts = lower.getPoints(16);
      k.lineStyle(2, HP.beakDark, 0.6);
      k.strokePoints(lpts);
    }

    /** Folded striped wing on the flank; raised = extended point pose. */
    drawWing(raised) {
      const w = this.wingG;
      w.clear();
      if (raised) {
        // extended wing pointing forward-down (for hints / "look over there")
        w.setRotation(0);
        w.fillStyle(HP.wingTip, 1);
        w.fillEllipse(46, 8, 64, 26);
        w.fillStyle(HP.wingBand, 1);
        w.fillEllipse(26, 2, 30, 20);
        w.fillStyle(HP.wingDark, 1);
        w.fillEllipse(38, 5, 16, 18);
      } else {
        // folded along the flank, tilted back: stacked cream/black bands
        // like the reference, ending in brown flight feathers
        w.setRotation(-0.55);
        w.fillStyle(HP.wingDark, 1);
        w.fillEllipse(0, 14, 30, 52);
        w.fillStyle(HP.wingBand, 1);
        w.fillEllipse(-1, 2, 27, 12);
        w.fillEllipse(0, 20, 25, 10);
        w.fillStyle(HP.wingDark, 1);
        w.fillEllipse(0, 11, 23, 8);
        w.fillStyle(HP.wingTip, 1);
        w.fillEllipse(2, 34, 20, 16); // brown flight-feather tip
      }
    }

    /**
     * The fan crest. Each feather: orange shaft + white band + black rounded
     * tip. Drawn from the crest-graphics local origin so the whole crest can
     * sway/rotate around its base. folded → half → fan → droop.
     */
    drawCrest(pose) {
      this._crestPose = pose;
      const g = this.crestG;
      g.clear();
      const setups = {
        folded: { angles: [-2.32, -2.06, -1.8, -1.54, -1.28, -1.02], len: 42 },
        half:   { angles: [-2.5, -2.16, -1.82, -1.48, -1.14, -0.8], len: 50 },
        fan:    { angles: [-2.74, -2.4, -2.06, -1.72, -1.38, -1.04, -0.7, -0.36], len: 58 },
        droop:  { angles: [-2.75, -2.52, -2.29, -2.06], len: 36 },
      };
      const s = setups[pose] || setups.folded;
      // center feathers a touch longer for a natural fan
      const mid = (s.angles.length - 1) / 2;
      s.angles.forEach((a, i) => {
        const L = s.len * (1 - Math.abs(i - mid) / (mid + 2) * 0.28);
        const cos = Math.cos(a), sin = Math.sin(a);
        const tipX = cos * L, tipY = sin * L;
        // bold orange shaft, rooted in the head
        g.lineStyle(8, HP.crest, 1);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(cos * (L - 13), sin * (L - 13)); g.strokePath();
        g.fillStyle(HP.crest, 1);
        g.fillCircle(0, 0, 4);
        // white band — a short thick segment so it reads as a band, not a dot
        g.lineStyle(8.6, HP.crestBand, 1);
        g.beginPath();
        g.moveTo(cos * (L - 13.5), sin * (L - 13.5));
        g.lineTo(cos * (L - 7.5), sin * (L - 7.5));
        g.strokePath();
        // black rounded tip
        g.fillStyle(HP.crestTip, 1);
        g.fillCircle(tipX, tipY, 5.6);
        // tiny accent glow at the very tip (the student's color)
        g.fillStyle(this.accent, 0.5);
        g.fillCircle(tipX, tipY, 2.2);
      });
    }

    /** Pop the crest open with a springy scale punch (idea! / celebration). */
    crestPop(pose) {
      this.drawCrest(pose);
      this.crestG.setScale(0.5);
      this.scene.tweens.add({
        targets: this.crestG, scaleX: 1, scaleY: 1, duration: 340, ease: 'Back.easeOut',
      });
    }

    drawFace(expr) {
      const f = this.faceG;
      const x = this.extraG;
      f.clear();
      x.clear();
      const eL = { x: 2, y: -36 };   // left eye (back)
      const eR = { x: 18, y: -34 };  // right eye (toward beak)

      const openEye = (e, r) => {
        f.fillStyle(0xffffff, 1);
        f.fillCircle(e.x, e.y, r);
        f.fillStyle(INK, 1);
        f.fillCircle(e.x + 1.2, e.y + 0.6, r * 0.62);
        f.fillStyle(0xffffff, 1);
        f.fillCircle(e.x + r * 0.32, e.y - r * 0.34, r * 0.24);
      };
      const closedEye = (e, r) => {
        f.lineStyle(3, INK, 1);
        f.beginPath(); f.arc(e.x, e.y, r, Math.PI * 0.15, Math.PI * 0.85, false); f.strokePath();
      };
      const crescentEye = (e, r) => {
        f.lineStyle(3.2, INK, 1);
        f.beginPath(); f.arc(e.x, e.y + 2, r, Math.PI * 1.12, Math.PI * 1.88, false); f.strokePath();
      };
      // expressive dark brows above the eyes (key to the reference's look)
      const brows = (lift, angle) => {
        f.lineStyle(3.4, HP.bodyDark, 1);
        f.beginPath(); f.moveTo(eL.x - 7, eL.y - 9 - lift + angle); f.lineTo(eL.x + 6, eL.y - 11 - lift); f.strokePath();
        f.beginPath(); f.moveTo(eR.x - 6, eR.y - 11 - lift); f.lineTo(eR.x + 8, eR.y - 9 - lift + angle); f.strokePath();
      };
      const blush = () => {
        f.fillStyle(0xff9d6a, 0.32);
        f.fillCircle(-4, -22, 6);
        f.fillCircle(26, -20, 6);
      };

      switch (expr) {
        case 'happy':
          crescentEye(eL, 7); crescentEye(eR, 7); brows(2, 0); blush();
          break;
        case 'cheering':
        case 'celebrating':
          crescentEye(eL, 8); crescentEye(eR, 8); brows(3, 0); blush();
          x.fillStyle(0xffe27a, 1);
          x.fillStar ? x.fillStar(-22, -58, 5, 6, 3) : x.fillCircle(-22, -58, 3.5);
          x.fillCircle(40, -56, 3);
          break;
        case 'thinking':
          if (this._blinking) { closedEye(eL, 7); closedEye(eR, 7); }
          else { openEye(eL, 7); openEye(eR, 8); }
          brows(5, -3); // one raised — quizzical
          // thought bubble
          x.fillStyle(0xffffff, 0.96);
          x.fillCircle(44, -62, 12);
          x.fillCircle(33, -50, 4.5);
          x.fillStyle(INK, 1);
          x.fillCircle(40, -64, 1.8); x.fillCircle(44, -62, 1.8); x.fillCircle(48, -60, 1.8);
          break;
        case 'sad':
          openEye(eL, 6.5); openEye(eR, 7);
          // worried up-tilted brows
          f.lineStyle(3.2, HP.bodyDark, 1);
          f.beginPath(); f.moveTo(eL.x - 7, eL.y - 6); f.lineTo(eL.x + 6, eL.y - 11); f.strokePath();
          f.beginPath(); f.moveTo(eR.x - 6, eR.y - 11); f.lineTo(eR.x + 8, eR.y - 6); f.strokePath();
          x.fillStyle(0x9adcff, 1);
          x.fillEllipse(eL.x - 6, eL.y + 8, 4, 6);
          break;
        case 'sleeping':
          closedEye(eL, 6); closedEye(eR, 6);
          x.fillStyle(0xffffff, 0.9);
          x.fillRoundedRect(34, -64, 14, 4, 2);
          x.fillRoundedRect(40, -56, 10, 3.5, 1.5);
          x.fillRoundedRect(45, -49, 7, 3, 1.5);
          break;
        case 'surprised':
          openEye(eL, 9); openEye(eR, 9); brows(7, 0);
          break;
        case 'idle':
        default:
          if (this._blinking) { closedEye(eL, 7); closedEye(eR, 7); }
          else { openEye(eL, 7); openEye(eR, 8); }
          brows(2, 0);
          break;
      }
      this.expression = expr;
    }

    setExpression(expr) {
      if (this.expression === expr) return;
      const crest = {
        idle: 'folded', happy: 'half', cheering: 'fan', celebrating: 'fan',
        thinking: 'half', sad: 'droop', sleeping: 'folded', surprised: 'fan',
      }[expr] || 'folded';
      if (crest !== this._crestPose) {
        if (crest === 'fan') this.crestPop('fan'); else this.drawCrest(crest);
      }
      this.drawWing(expr === 'cheering' || expr === 'celebrating');
      this.drawFace(expr);
    }

    /** Guide-side reactions: hints, gentle wrongs, level moments. */
    react(event) {
      const s = this.scene;
      switch (event) {
        case 'hint':
          // an idea strikes — crest fans wide, wing points, eager lean
          this.setExpression('thinking');
          this.crestPop('fan');
          this.drawWing(true);
          s.tweens.add({ targets: this, angle: { from: 0, to: 6 }, duration: 260, yoyo: true, hold: 500, ease: 'Sine.easeInOut' });
          s.time.delayedCall(1400, () => { if (this.active) { this.drawCrest('half'); this.drawWing(false); } });
          break;
        case 'correct':
          this.setExpression('happy');
          this.hop(9);
          s.time.delayedCall(1300, () => this.active && this.setExpression('idle'));
          break;
        case 'wrong':
          this.setExpression('sad');
          s.time.delayedCall(950, () => this.active && this.setExpression('idle'));
          break;
        case 'levelComplete':
        case 'combo':
        case 'streak':
          this.setExpression('celebrating');
          this.hop(18);
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
      this.drawCrest(this._crestPose);
    }
  }

  // ---------------------------------------------------------------- BEE
  const BEE = {
    body: 0xffc83d,        // warm yellow
    bodyLight: 0xffd862,
    stripe: 0x6b4a2b,      // soft brown stripes (not harsh black)
    limb: 0x5a3d22,
    scarf: 0x2bc4c4,       // teal
    scarfDark: 0x1f9c9c,
    wing: 0xa9dcf2,        // light translucent blue
    wingEdge: 0x7cc4e6,
    xpGold: 0xffc62e,
    xpGoldLight: 0xffe07a,
    xpGoldDark: 0xe0a318,
    sparkle: 0xffe08a,
  };

  class Bee extends Phaser.GameObjects.Container {
    constructor(scene, x, y, opts) {
      super(scene, x, y);
      const o = opts || {};
      this.accent = o.accent == null ? 0x58cc02 : o.accent;
      this.expression = 'idle';
      this._blinking = false;
      this._xpShown = false;

      this.wingsG = scene.add.graphics();      // back wings, flutter via scaleY
      this.bodyG = scene.add.graphics();
      this.antennaG = scene.add.graphics();    // sways
      this.faceG = scene.add.graphics();
      this.armsG = scene.add.graphics();
      this.glowG = scene.add.graphics();       // XP glow halo (behind coin)
      this.coinG = scene.add.graphics();       // the XP hexagon
      this.sparkG = scene.add.graphics();      // sparkles around the XP

      this.wingAnchor = { x: 16, y: -20 };
      this.antennaAnchor = { x: -2, y: -44 };
      this.wingsG.setPosition(this.wingAnchor.x, this.wingAnchor.y);
      this.antennaG.setPosition(this.antennaAnchor.x, this.antennaAnchor.y);

      this.add([this.wingsG, this.glowG, this.bodyG, this.armsG, this.antennaG, this.faceG, this.coinG, this.sparkG]);

      this.drawWings();
      this.drawBody();
      this.drawAntenna();
      this.drawArms(false);
      this.drawFace('idle');
      this.coinG.setVisible(false);
      this.glowG.setVisible(false);
      this.sparkG.setVisible(false);

      scene.add.existing(this);
      if (o.scale) this.setScale(o.scale);

      // constant fast wing flutter — a bee is never still
      this.flutter = scene.tweens.add({
        targets: this.wingsG, scaleY: 0.5, duration: 70, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      // gentle hover bob
      this.hover = scene.tweens.add({
        targets: this, y: y - 5, duration: 720, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      // antenna sway
      this.antSway = scene.tweens.add({
        targets: this.antennaG, rotation: { from: -0.08, to: 0.08 },
        duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.scheduleBlink();
      // Full cleanup: the bee is transient now (brief success celebrations),
      // so every looping timer/tween must die with her — a leaked 60ms
      // sparkle timer drawing on destroyed Graphics freezes the whole game.
      this.on('destroy', () => {
        if (this.blinkTimer) this.blinkTimer.remove();
        if (this._sparkTimer) { this._sparkTimer.remove(); this._sparkTimer = null; }
        if (this._glowPulse) this._glowPulse.stop();
        for (const t of [this.flutter, this.hover, this.antSway]) if (t) t.stop();
      });
    }

    scheduleBlink() {
      this.blinkTimer = this.scene.time.delayedCall(3500 + Math.random() * 2500, () => {
        if (!this.active) return;
        if (this.expression === 'idle' || this.expression === 'happy') {
          this._blinking = true;
          this.drawFace(this.expression);
          this.scene.time.delayedCall(110, () => {
            this._blinking = false;
            if (this.active) this.drawFace(this.expression);
          });
        }
        this.scheduleBlink();
      });
    }

    drawWings() {
      const w = this.wingsG;
      w.clear();
      // two overlapping translucent blue wings — big enough to read clearly
      w.fillStyle(BEE.wing, 0.62);
      w.fillEllipse(12, -10, 42, 26);  // upper, larger
      w.fillEllipse(26, 6, 32, 18);    // lower
      w.lineStyle(2, BEE.wingEdge, 0.85);
      w.strokeEllipse(12, -10, 42, 26);
      w.strokeEllipse(26, 6, 32, 18);
      // faint veins
      w.lineStyle(1, BEE.wingEdge, 0.5);
      w.beginPath(); w.moveTo(0, -12); w.lineTo(26, -8); w.strokePath();
      w.beginPath(); w.moveTo(8, 4); w.lineTo(34, 6); w.strokePath();
    }

    drawBody() {
      const b = this.bodyG;
      b.clear();
      // round fuzzy abdomen with brown stripes
      b.fillStyle(BEE.body, 1);
      b.fillEllipse(0, 12, 50, 46);
      b.fillStyle(BEE.stripe, 1);
      // curved stripe bands
      b.fillEllipse(0, 4, 46, 10);
      b.fillEllipse(0, 20, 40, 10);
      b.fillStyle(BEE.body, 1);
      b.fillEllipse(0, 12, 46, 7); // gap highlight between stripes
      b.fillStyle(BEE.bodyLight, 0.5);
      b.fillEllipse(-8, 6, 18, 14); // sheen
      // big round head — almost half the character, like the reference
      b.fillStyle(BEE.body, 1);
      b.fillCircle(-2, -26, 25);
      b.fillStyle(BEE.bodyLight, 0.45);
      b.fillEllipse(-10, -34, 16, 12); // forehead sheen
      // teal scarf at the neck
      b.fillStyle(BEE.scarf, 1);
      b.fillRoundedRect(-16, -7, 32, 9, 4);
      b.fillStyle(BEE.scarfDark, 1);
      b.fillRoundedRect(-16, -3, 32, 4, 2);
      b.fillStyle(BEE.scarf, 1);
      b.fillRoundedRect(8, -2, 9, 16, 4); // dangling end
      // accent trim on the scarf — the student's color
      b.fillStyle(this.accent, 1);
      b.fillRoundedRect(-16, -7, 32, 3, 2);
    }

    drawAntenna() {
      const a = this.antennaG;
      a.clear();
      a.lineStyle(4.2, BEE.limb, 1);
      // two curved antennae
      let c = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(-6, 2), new Phaser.Math.Vector2(-12, -14), new Phaser.Math.Vector2(-17, -24));
      c.draw(a, 10);
      c = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(8, 2), new Phaser.Math.Vector2(12, -14), new Phaser.Math.Vector2(18, -24));
      c.draw(a, 10);
      a.fillStyle(BEE.limb, 1);
      a.fillCircle(-17, -24, 4.2);
      a.fillCircle(18, -24, 4.2);
    }

    drawArms(holding) {
      const a = this.armsG;
      a.clear();
      a.fillStyle(BEE.limb, 1);
      if (holding) {
        // both little arms up, holding the XP coin in front
        a.fillRoundedRect(-26, 0, 9, 16, 4);
        a.fillRoundedRect(17, 0, 9, 16, 4);
        a.fillCircle(-22, 2, 5);
        a.fillCircle(22, 2, 5);
      } else {
        // arms relaxed at sides
        a.fillRoundedRect(-26, 6, 8, 14, 4);
        a.fillRoundedRect(18, 6, 8, 14, 4);
        a.fillCircle(-22, 19, 4.5);
        a.fillCircle(22, 19, 4.5);
      }
      // little feet
      a.fillStyle(BEE.limb, 1);
      a.fillEllipse(-8, 36, 12, 8);
      a.fillEllipse(9, 36, 12, 8);
    }

    drawFace(expr) {
      const f = this.faceG;
      f.clear();
      const eL = { x: -11, y: -27 }, eR = { x: 7, y: -27 };

      const openEyes = (r) => {
        for (const e of [eL, eR]) {
          f.fillStyle(0xffffff, 1);
          f.fillCircle(e.x, e.y, r);
          f.fillStyle(0x4a2e1a, 1);
          f.fillCircle(e.x + 0.8, e.y + 0.6, r * 0.62);
          f.fillStyle(0xffffff, 1);
          f.fillCircle(e.x + r * 0.3, e.y - r * 0.3, r * 0.22);
        }
      };
      const happyEyes = () => {
        f.lineStyle(3.2, 0x4a2e1a, 1);
        for (const e of [eL, eR]) {
          f.beginPath(); f.arc(e.x, e.y + 1, 5.2, Math.PI * 1.12, Math.PI * 1.88, false); f.strokePath();
        }
      };
      const closedEyes = () => {
        f.lineStyle(3.2, 0x4a2e1a, 1);
        for (const e of [eL, eR]) {
          f.beginPath(); f.arc(e.x, e.y, 5.2, Math.PI * 0.12, Math.PI * 0.88, false); f.strokePath();
        }
      };
      const brows = () => {
        f.lineStyle(3, 0x4a2e1a, 1);
        f.beginPath(); f.moveTo(eL.x - 5, eL.y - 8); f.lineTo(eL.x + 5, eL.y - 9); f.strokePath();
        f.beginPath(); f.moveTo(eR.x - 5, eR.y - 9); f.lineTo(eR.x + 5, eR.y - 8); f.strokePath();
      };
      const smile = (big) => {
        f.lineStyle(2.8, 0x4a2e1a, 1);
        f.beginPath(); f.arc(-2, -20, big ? 6.5 : 5, Math.PI * 0.12, Math.PI * 0.88, false); f.strokePath();
        if (big) { f.fillStyle(0x7c3b2a, 1); f.fillEllipse(-2, -14.5, 6, 4); }
      };
      const cheeks = () => {
        f.fillStyle(0xff9d6a, 0.32);
        f.fillCircle(-19, -21, 4.5); f.fillCircle(15, -21, 4.5);
      };

      // the bee never goes sad — rewards partner only
      switch (expr) {
        case 'cheering':
        case 'celebrating':
          brows(); happyEyes(); smile(true); cheeks();
          break;
        case 'happy':
          brows(); happyEyes(); smile(false); cheeks();
          break;
        case 'sleeping':
          brows(); closedEyes(); smile(false);
          break;
        case 'idle':
        default:
          brows();
          if (this._blinking) closedEyes(); else openEyes(5.4);
          smile(false);
          break;
      }
      this.expression = expr;
    }

    /** The signature glowing XP hexagon, held up for rewards. */
    drawCoin() {
      const c = this.coinG;
      c.clear();
      const cx = 0, cy = 6, R = 17;
      const hex = (rad, col, alpha) => {
        const pts = [];
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 3;
          pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad));
        }
        c.fillStyle(col, alpha == null ? 1 : alpha);
        c.fillPoints(pts, true);
      };
      hex(R, BEE.xpGoldDark);
      hex(R - 2.4, BEE.xpGold);
      hex(R - 6, BEE.xpGoldLight, 0.9);
      // "XP" text drawn as chunky strokes
      c.lineStyle(2.6, BEE.xpGoldDark, 1);
      // X
      c.beginPath(); c.moveTo(cx - 8, cy - 5); c.lineTo(cx - 2, cy + 5); c.strokePath();
      c.beginPath(); c.moveTo(cx - 2, cy - 5); c.lineTo(cx - 8, cy + 5); c.strokePath();
      // P
      c.beginPath(); c.moveTo(cx + 2, cy + 5); c.lineTo(cx + 2, cy - 5); c.strokePath();
      c.beginPath(); c.arc(cx + 4, cy - 2.6, 3, Math.PI * 1.5, Math.PI * 0.5, false); c.strokePath();

      // glow halo
      const g = this.glowG;
      g.clear();
      g.fillStyle(BEE.xpGoldLight, 0.28);
      g.fillCircle(cx, cy, R + 10);
      g.fillStyle(BEE.xpGoldLight, 0.18);
      g.fillCircle(cx, cy, R + 18);
    }

    drawSparkles(phase) {
      const s = this.sparkG;
      s.clear();
      const spots = [[-26, -8], [-30, 6], [-24, 18], [22, -10], [28, 8]];
      spots.forEach((p, i) => {
        const tw = 0.5 + 0.5 * Math.sin(phase * 6.28 + i * 1.3);
        s.fillStyle(BEE.sparkle, 0.5 + 0.5 * tw);
        const r = 1.6 + 2.2 * tw;
        // four-point sparkle
        s.fillTriangle(p[0], p[1] - r, p[0] - r * 0.4, p[1], p[0] + r * 0.4, p[1]);
        s.fillTriangle(p[0], p[1] + r, p[0] - r * 0.4, p[1], p[0] + r * 0.4, p[1]);
        s.fillTriangle(p[0] - r, p[1], p[0], p[1] - r * 0.4, p[0], p[1] + r * 0.4);
        s.fillTriangle(p[0] + r, p[1], p[0], p[1] - r * 0.4, p[0], p[1] + r * 0.4);
      });
    }

    showXp(on) {
      if (on === this._xpShown) return;
      this._xpShown = on;
      this.coinG.setVisible(on);
      this.glowG.setVisible(on);
      this.sparkG.setVisible(on);
      this.drawArms(on);
      if (on) {
        this.drawCoin();
        this.coinG.setScale(0.4);
        this.scene.tweens.add({ targets: this.coinG, scaleX: 1, scaleY: 1, duration: 360, ease: 'Back.easeOut' });
        // glow pulse
        this._glowPulse = this.scene.tweens.add({
          targets: this.glowG, alpha: { from: 0.6, to: 1 }, scaleX: 1.12, scaleY: 1.12,
          duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        // sparkle twinkle
        this._sparkTimer = this.scene.time.addEvent({
          delay: 60, loop: true, callback: () => this.drawSparkles((this.scene.time.now % 1600) / 1600),
        });
      } else {
        if (this._glowPulse) { this._glowPulse.stop(); this.glowG.setAlpha(1).setScale(1); }
        if (this._sparkTimer) { this._sparkTimer.remove(); this._sparkTimer = null; }
      }
    }

    setExpression(expr) {
      if (expr === 'sad' || expr === 'wrong') return;
      if (this.expression !== expr) this.drawFace(expr);
    }

    /** Rewards-side reactions: XP, combos, streaks, completions. */
    react(event) {
      const s = this.scene;
      switch (event) {
        case 'correct':
          this.setExpression('happy');
          this.showXp(true);
          this.bounce();
          s.time.delayedCall(1500, () => { if (this.active) { this.showXp(false); this.setExpression('idle'); } });
          break;
        case 'combo':
        case 'streak':
          this.setExpression('cheering');
          this.showXp(true);
          this.loopTheLoop();
          s.time.delayedCall(2000, () => { if (this.active) { this.showXp(false); this.setExpression('idle'); } });
          break;
        case 'levelComplete':
        case 'mastery':
          this.setExpression('celebrating');
          this.showXp(true);
          this.spin(1);
          // on big moments, keep the coin up a bit longer
          s.time.delayedCall(2600, () => { if (this.active) { this.setExpression('happy'); } });
          break;
        case 'sleep':
          this.setExpression('sleeping');
          break;
        default:
          this.setExpression('idle');
      }
    }

    bounce() {
      if (this.hover) this.hover.pause();
      const startY = this.y;
      this.scene.tweens.add({
        targets: this, y: startY - 12, duration: 160, yoyo: true, repeat: 1, ease: 'Cubic.easeOut',
        onComplete: () => { this.y = startY; if (this.hover && this.active) this.hover.resume(); },
      });
    }

    spin(turns) {
      this.scene.tweens.add({
        targets: this, angle: 360 * (turns || 1), duration: 460 * (turns || 1), ease: 'Cubic.easeOut',
        onComplete: () => (this.angle = 0),
      });
    }

    /** Victory lap: a quick aerial loop around the home position. */
    loopTheLoop() {
      if (this._looping) return;
      this._looping = true;
      if (this.hover) this.hover.pause();
      const cx = this.x, cy = this.y, r = 18;
      this.scene.tweens.addCounter({
        from: 0, to: 1, duration: 850, ease: 'Sine.easeInOut',
        onUpdate: (tw) => {
          const t = tw.getValue() * Math.PI * 2;
          this.x = cx + Math.sin(t) * r;
          this.y = cy - Math.sin(t / 2) * r * 1.5;
          this.angle = Math.sin(t) * 22;
        },
        onComplete: () => {
          this.setPosition(cx, cy); this.angle = 0; this._looping = false;
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
   * Interest companions — one per archetype, same rounded big-eye style family.
   * Small (~56px), idles near the HUD, celebrates with the student.
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
        targets: this, y: y - 5, duration: 1500 + Math.random() * 400,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
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
          g.fillRoundedRect(-14, -26, 28, 44, 12);
          g.fillStyle(A, 1);
          g.fillTriangle(-14, -26, 0, -42, 14, -26);
          g.fillTriangle(-14, 8, -24, 22, -14, 18);
          g.fillTriangle(14, 8, 24, 22, 14, 18);
          g.fillStyle(0x1cb0f6, 1);
          g.fillCircle(0, -8, 9);
          this.eyes(g, 4, -8, 3);
          g.fillStyle(0xffc800, 1);
          g.fillTriangle(-7, 18, 0, 32, 7, 18);
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
          g.fillRoundedRect(-8, 14, 16, 6, 3);
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
          g.fillTriangle(20, 0, 36, -12, 36, 12);
          g.fillStyle(A, 0.85);
          g.fillTriangle(-4, -14, 4, -26, 10, -14);
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
          g.fillEllipse(6, 6, 14, 9);
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
          this.eyes(g, 5, 14, 3);
          break;
      }
    }

    celebrate() {
      this.scene.tweens.add({
        targets: this, angle: { from: -12, to: 12 }, duration: 110, yoyo: true, repeat: 3,
        onComplete: () => (this.angle = 0),
      });
      if (this.bob) this.bob.pause();
      const startY = this.y;
      this.scene.tweens.add({
        targets: this, y: startY - 16, duration: 160, yoyo: true, ease: 'Cubic.easeOut',
        onComplete: () => { this.y = startY; if (this.bob && this.active) this.bob.resume(); },
      });
    }
  }

  window.Hoopoe = Hoopoe;
  window.Bee = Bee;
  window.Companion = Companion;
})();
