/**
 * Number City — the primary learning world. First district: the Shapes
 * District (Grade-1 geometry, "Shapes Around Us").
 *
 * Interaction-first: every educational level runs the six-beat flow
 * observe → try → notice → explain → practice → checkpoint while the session
 * climbs the four-rung ladder recognize → understand → apply → challenge.
 * Four manipulation mechanics render the scene item kinds — tap_scene,
 * drag_collect, sequence, build_complete — each used only where it serves
 * the objective. Evaluation is 100% programmatic against the spec's
 * canonical objects; the interest wrapper (nature / construction) re-skins
 * scenery, shape decorations, ambient life and the success moment, and can
 * never touch items, verification, difficulty or evidence.
 */
(function () {
  'use strict';

  const W = 720;
  const H = 1280;
  const P = EduCore.PALETTE;

  // City districts (themes). The Shapes District is the Grade-1 geometry MVP.
  const THEMES = {
    shapes_district: {
      skyTop: 0xceebf0, skyBottom: 0xfdf2e2,
      skyline: 0x19725e, // distant city silhouette — built from shapes, of course
    },
  };

  /**
   * Interest wrappers — PRESENTATION ONLY. Same spec, same answers, same
   * difficulty, same evidence; only what the shapes look like and what the
   * city district feels like changes with the child's interest.
   */
  const WRAPPERS = {
    nature: {
      ground: 0x84a253, groundDeep: 0x6d8a42,
      ambient: 'leaves',
      confetti: [0x84a253, 0x4d8c58, 0xef9722, 0xceebf0],
      containerColor: 0xb5702f, // a woven basket
      shapeFill: { circle: 0xef9722, square: 0x84a253, triangle: 0x4d8c58, rect: 0xb5702f },
      decor: { circle: 'rays', square: 'vein', triangle: 'trunk', rect: 'grain' },
      flavor: {
        en: 'The city park is full of shapes!',
        ar: 'حديقة المدينة مليئة بالأشكال!',
      },
    },
    construction: {
      ground: 0xfae9d0, groundDeep: 0xe8d3b0,
      ambient: 'dust',
      confetti: [0xef9722, 0x079a90, 0xb5702f, 0xfadbb0],
      containerColor: 0x079a90, // a site crate
      shapeFill: { circle: 0xb5702f, square: 0x079a90, triangle: 0xef9722, rect: 0x4d8c58 },
      decor: { circle: 'spokes', square: 'window', triangle: 'shingles', rect: 'bricks' },
      flavor: {
        en: 'The building site is full of shapes!',
        ar: 'ورشة البناء مليئة بالأشكال!',
      },
    },
  };

  // Beat chips (canonical UI copy — NOT wrapper content).
  const BEAT_CHIP = {
    try: { en: 'TRY IT!', ar: 'جرّب!' },
    practice: { en: 'PRACTICE', ar: 'تدرّب' },
    checkpoint: { en: 'SHOW WHAT YOU KNOW!', ar: 'لنتأكد!' },
  };

  const TUTORIAL = {
    en: {
      intro: 'Welcome to Number City! In the Shapes District, you learn by touching.',
      prompt: 'Tap the circle!',
      done: 'That is how it works — look, then tap. Off we go!',
    },
    ar: {
      intro: 'أهلًا بك في مدينة الأعداد! في حي الأشكال نتعلم باللمس.',
      prompt: 'اضغط على الدائرة!',
      done: 'هكذا نلعب — انظر ثم اضغط. هيا بنا!',
    },
  };

  /** Canonical shape from a (canonical, wrapper-independent) label. */
  function shapeFromLabel(label) {
    const s = String(label || '');
    if (/دائر|circle/i.test(s)) return 'circle';
    if (/مستطيل|rectangle/i.test(s)) return 'rect';
    if (/مربع|square/i.test(s)) return 'square';
    if (/مثلث|triangle/i.test(s)) return 'triangle';
    return null;
  }

  /** Draw a geometric shape centered on (0,0) into a Graphics object. */
  function drawShape(g, shape, size, fill, strokeColor) {
    const r = size / 2;
    g.fillStyle(fill, 1);
    g.lineStyle(4, strokeColor == null ? GameFeel.darken(fill, 0.3) : strokeColor, 1);
    if (shape === 'circle') {
      g.fillCircle(0, 0, r);
      g.strokeCircle(0, 0, r);
    } else if (shape === 'square') {
      g.fillRoundedRect(-r, -r, size, size, 10);
      g.strokeRoundedRect(-r, -r, size, size, 10);
    } else if (shape === 'rect') {
      g.fillRoundedRect(-r * 1.25, -r * 0.7, size * 1.25, size * 0.7, 10);
      g.strokeRoundedRect(-r * 1.25, -r * 0.7, size * 1.25, size * 0.7, 10);
    } else { // triangle
      g.fillTriangle(0, -r, r, r * 0.85, -r, r * 0.85);
      g.strokeTriangle(0, -r, r, r * 0.85, -r, r * 0.85);
    }
  }

  /** Wrapper decoration on top of a drawn shape (presentation only). */
  function drawDecor(g, shape, decor, size, fill) {
    const r = size / 2;
    const ink = GameFeel.darken(fill, 0.35);
    g.lineStyle(3, ink, 0.8);
    if (decor === 'rays') { // a little sun
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6));
        g.lineTo(Math.cos(a) * (r + 16), Math.sin(a) * (r + 16));
        g.strokePath();
      }
    } else if (decor === 'spokes') { // a wheel
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        g.beginPath();
        g.moveTo(-Math.cos(a) * r * 0.8, -Math.sin(a) * r * 0.8);
        g.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
        g.strokePath();
      }
      g.fillStyle(ink, 1);
      g.fillCircle(0, 0, 7);
    } else if (decor === 'vein') { // a leafy tile
      g.beginPath(); g.moveTo(-r * 0.5, r * 0.5); g.lineTo(r * 0.5, -r * 0.5); g.strokePath();
    } else if (decor === 'window') { // a window cross
      g.beginPath(); g.moveTo(0, -r * 0.7); g.lineTo(0, r * 0.7); g.strokePath();
      g.beginPath(); g.moveTo(-r * 0.7, 0); g.lineTo(r * 0.7, 0); g.strokePath();
    } else if (decor === 'trunk') { // a tiny tree trunk
      g.fillStyle(0xb5702f, 1);
      g.fillRect(-6, r * 0.85, 12, 14);
    } else if (decor === 'shingles') { // roof lines
      g.beginPath(); g.moveTo(-r * 0.55, r * 0.3); g.lineTo(r * 0.55, r * 0.3); g.strokePath();
      g.beginPath(); g.moveTo(-r * 0.3, -r * 0.15); g.lineTo(r * 0.3, -r * 0.15); g.strokePath();
    } else if (decor === 'grain' || decor === 'bricks') { // wood grain / brick courses
      g.beginPath(); g.moveTo(-r * 0.9, 0); g.lineTo(r * 0.9, 0); g.strokePath();
      g.beginPath(); g.moveTo(-r * 0.35, -r * 0.35); g.lineTo(-r * 0.35, 0); g.strokePath();
      g.beginPath(); g.moveTo(r * 0.35, 0); g.lineTo(r * 0.35, r * 0.35); g.strokePath();
    }
  }

  class NumberCityScene extends EduCore.BaseGameScene {
    buildStage() {
      this.theme = THEMES[EduCore.spec.meta.theme] || THEMES.shapes_district;
      this.wrapper = WRAPPERS[EduCore.spec.meta.wrapper] || WRAPPERS.nature;
      this.hintPos = { x: EduCore.isRTL ? 70 : W - 70, y: 1226 };
      this.hintBubbleY = 1090;

      this.drawDistrict();

      // All per-item scene objects live here — cleared between items.
      this.playLayer = this.add.container(0, 0).setDepth(5);

      // Prompt panel (warm sand card, same reading surface as draw_connect).
      this.promptPanel = GameFeel.cardPanel(this, W / 2, 150, 664, 132, {
        color: P.sand, alpha: 0.97, stroke: 0xdccdb7, strokeWidth: 3,
      }).setDepth(8).setAlpha(0);
      this.promptText = this.add.text(EduCore.isRTL ? W / 2 + 296 : W / 2 - 296, 104, '',
        EduCore.textStyle(26, { color: '#19725E', wrap: 500, lineSpacing: 6 }))
        .setOrigin(EduCore.isRTL ? 1 : 0, 0).setDepth(9);

      // Beat chip — where in the six-beat flow the learner is right now.
      this.beatChip = this.add.container(W / 2, 248).setDepth(9).setAlpha(0);
      this.beatChipBg = this.add.graphics();
      this.beatChipText = this.add.text(0, 0, '',
        EduCore.textStyle(24, { weight: '800', color: '#FDF2E2', align: 'center' })).setOrigin(0.5);
      this.beatChip.add([this.beatChipBg, this.beatChipText]);

      // Progress pill ("١/٣") for multi-target mechanics.
      this.progressPill = this.add.graphics().setDepth(9);
      this.progressText = this.add.text(EduCore.isRTL ? 84 : W - 84, 150, '',
        EduCore.textStyle(24, { weight: '800', color: '#FDF2E2', align: 'center' }))
        .setOrigin(0.5).setDepth(10);

      this.guide = new Hoopoe(this, EduCore.isRTL ? W - 78 : 78, 1224, {
        accent: EduCore.accentInt, scale: 0.52,
      });
      this.guide.setDepth(8);

      this.teachStyle = { panelColor: P.sand };
      this._plan = [];
      this.currentBeat = null;

      // One drag rig for the whole scene (attachDrag registers scene input
      // listeners — attach ONCE, delegate per item; never stack rigs).
      this._dragOpts = null;
      this.dragRig = Interact.attachDrag(this, {
        findTarget: (x, y) => (this._dragOpts ? this._dragOpts.findTarget(x, y) : null),
        onGrab: (t, p) => { if (this._dragOpts) this._dragOpts.onGrab(t, p); },
        onMove: (p, pts, s) => { if (this._dragOpts) this._dragOpts.onMove(p, pts, s); },
        onDrop: (s, p, pts) => { if (this._dragOpts) this._dragOpts.onDrop(s, p, pts); },
      });
    }

    // ---------------------------------------------------------- district art
    drawDistrict() {
      const t = this.theme;
      const wrap = this.wrapper;
      const g = this.add.graphics().setDepth(0);

      // sky bands (soft gradient, plain bit math — no color-class dependency)
      for (let i = 0; i < 8; i++) {
        const f = i / 7;
        const rr = Math.round(((t.skyTop >> 16) & 255) * (1 - f) + ((t.skyBottom >> 16) & 255) * f);
        const gg = Math.round(((t.skyTop >> 8) & 255) * (1 - f) + ((t.skyBottom >> 8) & 255) * f);
        const bb = Math.round((t.skyTop & 255) * (1 - f) + (t.skyBottom & 255) * f);
        g.fillStyle((rr << 16) | (gg << 8) | bb, 1);
        g.fillRect(0, (H * 0.75 * i) / 8, W, H * 0.75 / 8 + 2);
      }

      // distant skyline — the city itself is built from the four shapes
      g.fillStyle(t.skyline, 0.14);
      g.fillRect(40, 780, 90, 180);   // tower (rect)
      g.fillRect(150, 840, 80, 120);  // house body (square-ish)
      g.fillTriangle(190, 840, 110, 840, 150, 780); // its roof
      g.fillCircle(300, 850, 55);     // a dome
      g.fillRect(380, 800, 70, 160);
      g.fillTriangle(455, 800, 375, 800, 415, 740);
      g.fillRect(500, 860, 110, 100);
      g.fillCircle(650, 820, 40);
      g.fillRect(620, 860, 60, 100);

      // ground band (wrapper)
      g.fillStyle(wrap.groundDeep, 1);
      g.fillRect(0, 950, W, H - 950);
      g.fillStyle(wrap.ground, 1);
      g.fillEllipse(W / 2, 965, W * 1.3, 70);

      if (EduCore.spec.meta.wrapper === 'construction') {
        // crane silhouette + brick stack
        g.fillStyle(0x19725e, 0.25);
        g.fillRect(608, 560, 14, 300);
        g.fillRect(520, 560, 190, 12);
        g.lineStyle(3, 0x19725e, 0.25);
        g.beginPath(); g.moveTo(540, 572); g.lineTo(540, 640); g.strokePath();
        g.fillRect(528, 640, 24, 18);
        g.fillStyle(0xb5702f, 0.5);
        g.fillRect(60, 920, 46, 20); g.fillRect(84, 898, 46, 20);
      } else {
        // park trees + pond
        g.fillStyle(0xb5702f, 0.9);
        g.fillRect(84, 880, 14, 50);
        g.fillStyle(0x4d8c58, 0.9);
        g.fillCircle(91, 856, 44);
        g.fillStyle(0x84a253, 0.9);
        g.fillCircle(120, 878, 30);
        g.fillStyle(0xceebf0, 0.85);
        g.fillEllipse(600, 940, 170, 44);
      }

      this.buildAmbient(wrap.ambient);
    }

    buildAmbient(kind) {
      // drifting leaves (nature) or site dust motes (construction)
      for (let i = 0; i < 6; i++) {
        const isLeaf = kind === 'leaves';
        const fleck = isLeaf
          ? this.add.ellipse(Math.random() * W, 200 + Math.random() * 700, 14, 8, 0x84a253, 0.5)
          : this.add.circle(Math.random() * W, 300 + Math.random() * 600, 3, 0xb5702f, 0.3);
        fleck.setDepth(1);
        this.tweens.add({
          targets: fleck,
          y: fleck.y + 120 + Math.random() * 80,
          x: fleck.x + (isLeaf ? 60 - Math.random() * 120 : 24 - Math.random() * 48),
          angle: isLeaf ? 180 : 0,
          alpha: 0,
          duration: 5200 + Math.random() * 2800,
          repeat: -1,
          delay: Math.random() * 4000,
          onRepeat: () => {
            fleck.y = 200 + Math.random() * 500;
            fleck.x = Math.random() * W;
            fleck.alpha = kind === 'leaves' ? 0.5 : 0.3;
          },
        });
      }
    }

    // -------------------------------------------------- six-beat level flow
    /**
     * observe → try → notice → explain. The engine calls teachPhase before
     * practicePhase inside every educational level; Number City opens with
     * watching, then a real (gently supported) first interaction, then names
     * the pattern, and only THEN lets Hudhud explain — interaction before
     * explanation, always.
     */
    async teachPhase(level) {
      this._plan = EduCore.engine.pickItems(level.items, 3);

      await this.observeBeat(level);

      if (this._plan.length) {
        this.currentBeat = 'try';
        await this.runItem(this._plan[0], level.index);
        await this.maybeBreak();
      }

      await this.noticeBeat(level);

      this.currentBeat = 'explain';
      await super.teachPhase(level); // Hudhud's teach cards
    }

    /** practice → checkpoint (the remaining picked items). */
    async practicePhase(level, levelIndex) {
      const rest = this._plan.slice(1);
      for (let i = 0; i < rest.length; i++) {
        this.currentBeat = i === rest.length - 1 ? 'checkpoint' : 'practice';
        await this.runItem(rest[i], levelIndex);
        await this.maybeBreak();
      }
      this.currentBeat = null;
    }

    async maybeBreak() {
      if (EduCore.session.strain >= EduCore.ADAPT.strain) {
        EduCore.session.strain = 0;
        await this.takeABreak();
      }
    }

    /** Observe: the district comes alive with shapes — just watch, no task. */
    observeBeat(level) {
      if (!level.observe) return Promise.resolve();
      EduCore.setState('observe');
      return new Promise((resolve) => {
        const c = this.add.container(0, 0).setDepth(this.uiDepth + 20);

        // a soft parade of the four shapes drifting through the district
        const parade = [];
        const shapes = ['circle', 'square', 'triangle', 'rect'];
        shapes.forEach((shape, i) => {
          const sc = this.add.container(
            EduCore.isRTL ? W + 90 + i * 150 : -90 - i * 150, 460 + (i % 2) * 150);
          const g = this.add.graphics();
          drawShape(g, shape, 104, this.wrapper.shapeFill[shape]);
          drawDecor(g, shape, this.wrapper.decor[shape], 104, this.wrapper.shapeFill[shape]);
          sc.add(g);
          this.tweens.add({
            targets: sc,
            x: EduCore.isRTL ? -120 : W + 120,
            duration: 7000,
            delay: i * 350,
            repeat: -1,
            ease: 'Linear',
          });
          this.tweens.add({
            targets: sc, y: sc.y - 26, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          });
          parade.push(sc);
          c.add(sc);
        });

        const panel = GameFeel.cardPanel(this, W / 2, 940, 640, 200, {
          color: P.sand, alpha: 0.97, stroke: EduCore.accentInt, strokeWidth: 3,
        });
        const caption = this.add.text(W / 2, 890, level.observe,
          EduCore.textStyle(28, { color: '#19725E', align: 'center', wrap: 560, lineSpacing: 8 }))
          .setOrigin(0.5, 0);
        // wrapper flavor — one light line of scene dressing (presentation only)
        const flavor = this.add.text(W / 2, 862, this.wrapper.flavor[EduCore.lang] || this.wrapper.flavor.en,
          EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5);
        const tapTxt = this.add.text(W / 2, 1000, EduCore.t('tapToContinue'),
          EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5);
        this.tweens.add({ targets: tapTxt, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
        c.add([panel, flavor, caption, tapTxt]);
        c.setAlpha(0);
        this.tweens.add({ targets: c, alpha: 1, duration: 260 });
        GameFeel.audio.tick();

        const zone = this.add.zone(W / 2, H / 2, W, H).setInteractive().setDepth(this.uiDepth + 21);
        zone.once('pointerdown', () => {
          zone.destroy();
          this.tweens.add({
            targets: c, alpha: 0, duration: 220,
            onComplete: () => { c.destroy(); resolve(); },
          });
        });
      });
    }

    /** Notice: name the pattern the learner just felt with their fingers. */
    noticeBeat(level) {
      if (!level.notice) return Promise.resolve();
      EduCore.setState('notice');
      return new Promise((resolve) => {
        const c = this.add.container(0, 0).setDepth(this.uiDepth + 20);
        const panel = GameFeel.cardPanel(this, W / 2, 620, 620, 240, {
          color: P.peach, alpha: 0.98, stroke: EduCore.accentInt, strokeWidth: 3,
        });
        const bulb = this.add.text(W / 2, 540, '💡',
          EduCore.textStyle(40, { align: 'center' })).setOrigin(0.5);
        const caption = this.add.text(W / 2, 590, level.notice,
          EduCore.textStyle(28, { color: '#19725E', align: 'center', wrap: 540, lineSpacing: 8 }))
          .setOrigin(0.5, 0);
        const tapTxt = this.add.text(W / 2, 706, EduCore.t('tapToContinue'),
          EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5);
        this.tweens.add({ targets: tapTxt, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
        this.tweens.add({ targets: bulb, scale: { from: 0.6, to: 1 }, duration: 420, ease: 'Back.easeOut' });
        c.add([panel, bulb, caption, tapTxt]);
        c.setAlpha(0);
        this.tweens.add({ targets: c, alpha: 1, duration: 260 });
        this.guide.react('hint'); // the crest fans — an idea!
        this.feel.sparkle(W / 2, 520, 0xef9722, 8);

        const zone = this.add.zone(W / 2, H / 2, W, H).setInteractive().setDepth(this.uiDepth + 21);
        zone.once('pointerdown', () => {
          zone.destroy();
          this.tweens.add({
            targets: c, alpha: 0, duration: 220,
            onComplete: () => { c.destroy(); resolve(); },
          });
        });
      });
    }

    // ------------------------------------------------------------ mechanics
    async presentItem(item, hintApi) {
      this.clearPlayArea();
      await this.showPrompt(item);
      let result;
      if (item.kind === 'tap_scene') result = await this.playTapScene(item, hintApi);
      else if (item.kind === 'drag_collect') result = await this.playDragCollect(item, hintApi);
      else if (item.kind === 'sequence') result = await this.playSequence(item, hintApi);
      else result = await this.playBuildComplete(item, hintApi);
      this.clearPlayArea();
      return result;
    }

    clearPlayArea() {
      this.playLayer.removeAll(true);
      EduCore.setTappables([]);
      window.EduMindDebug.getDrag = null;
      this._dragOpts = null;
      this.dragRig.disable();
      this.setProgress(0, 0);
    }

    /** Objects spawn disarmed and arm a moment later — a tap meant for a
     *  dialog that lands on a just-spawned shape must never count as wrong. */
    armLater(objs) {
      for (const o of objs) o.tapDisabled = true;
      this.time.delayedCall(450, () => {
        for (const o of objs) {
          if (o.scene && !o.done) o.tapDisabled = false;
        }
      });
    }

    /** Glow pulse used by hint-2 narrowing on every mechanic. Guarded so the
     *  delayed reset never touches an object destroyed between items. */
    pulseTarget(o) {
      o.glow.setAlpha(0.5);
      this.tweens.add({ targets: o, scale: 1.14, duration: 280, yoyo: true, repeat: 2 });
      this.time.delayedCall(1800, () => {
        if (o.glow && o.glow.scene) o.glow.setAlpha(0);
      });
    }

    showPrompt(item) {
      const beat = this.currentBeat;
      const chip = BEAT_CHIP[beat];
      if (chip) {
        const label = chip[EduCore.lang] || chip.en;
        this.beatChipText.setText(label);
        const cw = this.beatChipText.width + 44;
        this.beatChipBg.clear();
        this.beatChipBg.fillStyle(beat === 'checkpoint' ? P.orange : P.teal, 1);
        this.beatChipBg.fillRoundedRect(-cw / 2, -24, cw, 48, 24);
        this.beatChip.setAlpha(0).setScale(0.7);
        this.tweens.add({ targets: this.beatChip, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
      } else {
        this.beatChip.setAlpha(0);
      }
      this.promptText.setText('');
      this.tweens.add({ targets: this.promptPanel, alpha: 1, duration: 200 });
      return this.feel.typewriter(this.promptText, item.prompt, { cps: 46 });
    }

    setProgress(done, total) {
      if (!total) {
        this.progressText.setText('');
        this.progressPill.clear();
        return;
      }
      this.progressText.setText(EduCore.fmtNum(done) + '/' + EduCore.fmtNum(total));
      this.progressPill.clear();
      this.progressPill.fillStyle(P.deepTeal, 0.9);
      const px = EduCore.isRTL ? 84 : W - 84;
      this.progressPill.fillRoundedRect(px - 46, 128, 92, 44, 22);
      this.feel.squash(this.progressText, 0.2, 180);
    }

    /** Build one scene shape object (canonical label → wrapper-skinned art). */
    buildShapeObject(def, size) {
      const shape = shapeFromLabel(def.label);
      const c = this.add.container(0, 0);
      const glow = this.add.circle(0, 0, size * 0.62, EduCore.accentInt, 0);
      c.add(glow);
      const g = this.add.graphics();
      if (shape) {
        const fill = this.wrapper.shapeFill[shape];
        drawShape(g, shape, size, fill);
        drawDecor(g, shape, this.wrapper.decor[shape], size, fill);
        c.add(g);
      } else {
        // unknown label → readable chip (generic contract support)
        const tmp = this.add.text(0, 0, def.label, EduCore.textStyle(24, {
          weight: '700', color: '#19725E', align: 'center', wrap: 200,
        })).setOrigin(0.5);
        const chipW = Math.max(tmp.width + 34, 90);
        const chipH = Math.max(tmp.height + 22, 56);
        g.fillStyle(P.sand, 1);
        g.fillRoundedRect(-chipW / 2, -chipH / 2, chipW, chipH, 16);
        g.lineStyle(3, EduCore.accentInt, 0.85);
        g.strokeRoundedRect(-chipW / 2, -chipH / 2, chipW, chipH, 16);
        c.add([g, tmp]);
      }
      c.glow = glow;
      c.shapeKind = shape;
      c.def = def;
      this.playLayer.add(c);
      return c;
    }

    /** Scatter positions across the play area (grid + jitter, no overlap). */
    scatterPositions(count, area) {
      const a = area || { x: 90, y: 360, w: W - 180, h: 520 };
      const cols = count <= 4 ? 2 : 3;
      const rows = Math.ceil(count / cols);
      const cells = [];
      for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        cells.push({
          x: a.x + ((col + 0.5) / cols) * a.w + (Math.random() * 30 - 15),
          y: a.y + ((row + 0.5) / rows) * a.h + (Math.random() * 24 - 12),
        });
      }
      // shuffle cells so answers never live in a predictable corner
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      return cells;
    }

    exposeTappables(objs) {
      EduCore.setTappables(objs.map((o) => ({
        id: o.def.id, label: o.def.label, x: o.x, y: o.y, w: 120, h: 120, correct: !!o.def.correct,
      })));
    }

    wrongTouch(obj) {
      this.feel.wiggle(obj, 2.6);
      GameFeel.audio.wrongTone();
      if (this.guide) this.guide.react('wrong');
    }

    /** tap_scene — recognize: tap every correct object living in the scene. */
    playTapScene(item, hintApi) {
      const positions = this.scatterPositions(item.objects.length);
      const objs = item.objects.map((def, i) => {
        const o = this.buildShapeObject(def, 116);
        o.setPosition(positions[i].x, positions[i].y);
        this.feel.breathe(o, 0.025);
        return o;
      });
      const targets = objs.filter((o) => o.def.correct);
      let found = 0;
      let wrongAttempts = 0;
      this.setProgress(0, targets.length);

      hintApi.onNarrow(() => {
        for (const o of objs) {
          if (o.def.correct && !o.done) this.pulseTarget(o);
        }
      });

      return new Promise((resolve) => {
        const refresh = () => this.exposeTappables(objs.filter((o) => !o.done));
        this.armLater(objs);
        for (const o of objs) {
          Interact.makeTappable(this, o, {
            w: 120, h: 120,
            onTap: () => {
              if (o.done) return;
              EduCore.reportLearning('object_interacted', {
                itemId: item.id, kind: 'scene_object', objectId: o.def.id,
              });
              if (o.def.correct) {
                o.done = true;
                o.tapDisabled = true;
                found++;
                this.setProgress(found, targets.length);
                this.feel.sparkle(o.x, o.y, EduCore.accentInt, 8);
                this.feel.squash(o, 0.22, 220);
                GameFeel.audio.correctChain(found);
                const check = this.add.text(o.x, o.y - 66, '✓',
                  EduCore.textStyle(30, { weight: '800', color: '#4D8C58', align: 'center' })).setOrigin(0.5);
                this.playLayer.add(check);
                refresh();
                if (found >= targets.length) {
                  this.time.delayedCall(420, () =>
                    resolve({ correct: wrongAttempts === 0, final: true, completed: true }));
                }
              } else {
                wrongAttempts++;
                this.wrongTouch(o);
              }
            },
          });
        }
        refresh();
      });
    }

    /** drag_collect — understand: drag every family member into its home. */
    playDragCollect(item, hintApi) {
      // container (basket / crate) on the ground
      const boxY = 880;
      const box = this.add.container(W / 2, boxY);
      const bg = this.add.graphics();
      bg.fillStyle(GameFeel.darken(this.wrapper.containerColor, 0.25), 1);
      bg.fillRoundedRect(-170, -62, 340, 132, 22);
      bg.fillStyle(this.wrapper.containerColor, 1);
      bg.fillRoundedRect(-170, -70, 340, 132, 22);
      bg.lineStyle(4, GameFeel.darken(this.wrapper.containerColor, 0.4), 1);
      bg.strokeRoundedRect(-170, -70, 340, 132, 22);
      const label = this.add.text(0, 40, item.containerLabel,
        EduCore.textStyle(24, { weight: '800', color: '#FDF2E2', align: 'center' })).setOrigin(0.5);
      box.add([bg, label]);
      this.playLayer.add(box);
      const inBox = (x, y) => x > W / 2 - 190 && x < W / 2 + 190 && y > boxY - 100 && y < boxY + 80;

      const positions = this.scatterPositions(item.objects.length, { x: 90, y: 340, w: W - 180, h: 380 });
      const objs = item.objects.map((def, i) => {
        const o = this.buildShapeObject(def, 104);
        o.setPosition(positions[i].x, positions[i].y);
        o.homeX = o.x; o.homeY = o.y;
        return o;
      });
      const targets = objs.filter((o) => o.def.correct);
      let collected = 0;
      let wrongAttempts = 0;
      this.setProgress(0, targets.length);

      hintApi.onNarrow(() => {
        for (const o of objs) {
          if (o.def.correct && !o.done) this.pulseTarget(o);
        }
      });

      const exposeDrag = () => {
        window.EduMindDebug.getDrag = () =>
          objs.filter((o) => o.def.correct && !o.done)
            .map((o) => ({ ax: o.x, ay: o.y, bx: W / 2, by: boxY - 20 }));
      };

      return new Promise((resolve) => {
        const refresh = () => {
          this.exposeTappables(objs.filter((o) => !o.done));
          exposeDrag();
        };
        this._dragOpts = {
          findTarget: (x, y) => Interact.nearest(
            objs.filter((o) => !o.done), x, y, 70, (o) => ({ x: o.x, y: o.y })),
          onGrab: (o) => {
            o.setScale(1.15);
            o.setDepth(20);
            GameFeel.audio.tick();
            EduCore.reportLearning('object_interacted', {
              itemId: item.id, kind: 'scene_object', objectId: o.def.id,
            });
          },
          onMove: (pointer, points, o) => {
            o.setPosition(pointer.x, pointer.y);
          },
          onDrop: (o, pointer) => {
            o.setScale(1);
            o.setDepth(0);
            if (inBox(pointer.x, pointer.y)) {
              if (o.def.correct) {
                o.done = true;
                collected++;
                this.setProgress(collected, targets.length);
                this.tweens.add({
                  targets: o,
                  x: W / 2 - 110 + collected * 56, y: boxY - 30, scale: 0.5,
                  duration: 260, ease: 'Cubic.easeOut',
                });
                this.feel.sparkle(W / 2, boxY - 60, EduCore.accentInt, 8);
                this.feel.squash(box, 0.16, 200);
                GameFeel.audio.correctChain(collected);
                refresh();
                if (collected >= targets.length) {
                  this.dragRig.disable();
                  this.time.delayedCall(420, () =>
                    resolve({ correct: wrongAttempts === 0, final: true, completed: true }));
                }
                return;
              }
              wrongAttempts++;
              this.wrongTouch(o);
            }
            // return home (wrong family member or dropped in the open)
            this.tweens.add({ targets: o, x: o.homeX, y: o.homeY, duration: 300, ease: 'Cubic.easeOut' });
          },
        };
        this.dragRig.enable();
        refresh();
      });
    }

    /** sequence — order the steps: tap them in the right order, they fly
     *  into numbered slots. The spec's array order is the canonical answer;
     *  presentation is shuffled. */
    playSequence(item, hintApi) {
      const n = item.steps.length;
      // slots row (numbered, RTL-aware direction)
      const slotW = Math.min(170, (W - 120) / n);
      const startX = W / 2 - ((n - 1) * slotW) / 2;
      const slots = item.steps.map((step, i) => {
        const sx = EduCore.isRTL ? W - (startX + i * slotW) : startX + i * slotW;
        const sc = this.add.container(sx, 430);
        const g = this.add.graphics();
        g.fillStyle(P.sand, 0.7);
        g.fillRoundedRect(-66, -66, 132, 132, 18);
        g.lineStyle(3, P.brown, 0.8);
        g.strokeRoundedRect(-66, -66, 132, 132, 18);
        const num = this.add.text(0, -92, EduCore.fmtNum(i + 1),
          EduCore.textStyle(24, { weight: '800', color: '#B5702F', align: 'center' })).setOrigin(0.5);
        sc.add([g, num]);
        this.playLayer.add(sc);
        return sc;
      });

      // shuffled cards (never the canonical order)
      let order = item.steps.map((_, i) => i);
      do {
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
      } while (order.every((v, i) => v === i));

      const cardY = 680;
      const cards = order.map((stepIdx, pos) => {
        const cx = EduCore.isRTL ? W - (startX + pos * slotW) : startX + pos * slotW;
        const card = this.buildShapeObject(
          { id: item.steps[stepIdx].id, label: item.steps[stepIdx].label, correct: false }, 100);
        card.setPosition(cx, cardY);
        card.stepIndex = stepIdx;
        this.feel.breathe(card, 0.02);
        return card;
      });

      let next = 0;
      let wrongAttempts = 0;
      this.setProgress(0, n);

      const refresh = () => {
        EduCore.setTappables(cards.filter((c) => !c.done).map((c) => ({
          id: c.def.id, label: c.def.label, x: c.x, y: c.y, w: 120, h: 120,
          correct: c.stepIndex === next,
        })));
      };

      hintApi.onNarrow(() => {
        const target = cards.find((c) => !c.done && c.stepIndex === next);
        if (target) this.pulseTarget(target);
      });

      return new Promise((resolve) => {
        this.armLater(cards);
        for (const card of cards) {
          Interact.makeTappable(this, card, {
            w: 120, h: 120,
            onTap: () => {
              if (card.done) return;
              EduCore.reportLearning('object_interacted', {
                itemId: item.id, kind: 'sequence_step', objectId: card.def.id,
              });
              if (card.stepIndex === next) {
                card.done = true;
                card.tapDisabled = true;
                const slot = slots[next];
                this.tweens.add({
                  targets: card, x: slot.x, y: slot.y, scale: 0.9,
                  duration: 320, ease: 'Cubic.easeOut',
                });
                next++;
                this.setProgress(next, n);
                GameFeel.audio.correctChain(next);
                this.feel.sparkle(slot.x, slot.y, EduCore.accentInt, 6);
                refresh();
                if (next >= n) {
                  this.time.delayedCall(420, () =>
                    resolve({ correct: wrongAttempts === 0, final: true, completed: true }));
                }
              } else {
                wrongAttempts++;
                this.wrongTouch(card);
              }
            },
          });
        }
        refresh();
      });
    }

    /** build_complete — apply: the structure stacks bottom-up; gaps show a
     *  dashed silhouette and are filled by tapping the right shape below. */
    playBuildComplete(item, hintApi) {
      const pieces = item.pieces;
      const size = 120;
      const baseY = 800;
      // structure stack (array order = bottom → top, like real building)
      const built = pieces.map((def, i) => {
        const c = this.add.container(W / 2, baseY - i * (size * 0.92));
        const g = this.add.graphics();
        const shape = shapeFromLabel(def.label) || 'square';
        if (def.gap) {
          // gap silhouette: soft fill + question mark — the shape of the hole
          // IS the clue (match the shape, grade-1 style)
          g.fillStyle(P.peach, 0.5);
          drawShapeSilhouette(g, shape, size);
          const q = this.add.text(0, 0, '؟',
            EduCore.textStyle(34, { weight: '800', color: '#B5702F', align: 'center' })).setOrigin(0.5);
          c.add([g, q]);
          c.qMark = q;
          this.tweens.add({ targets: q, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
        } else {
          const fill = this.wrapper.shapeFill[shape];
          drawShape(g, shape, size, fill);
          drawDecor(g, shape, this.wrapper.decor[shape], size, fill);
          c.add(g);
        }
        c.def = def;
        c.shape = shape;
        this.playLayer.add(c);
        return c;
      });

      const gaps = built.filter((b) => b.def.gap);
      let filled = 0;
      let wrongAttempts = 0;
      this.setProgress(0, gaps.length);
      const currentGap = () => gaps.find((gp) => !gp.done) || null;

      // options row (tappable shape chips)
      const optY = 1010;
      const optW = Math.min(160, (W - 100) / item.options.length);
      const optStartX = W / 2 - ((item.options.length - 1) * optW) / 2;
      const optObjs = item.options.map((opt, i) => {
        const ox = EduCore.isRTL ? W - (optStartX + i * optW) : optStartX + i * optW;
        const o = this.buildShapeObject({ id: opt.id, label: opt.label, correct: false }, 88);
        o.setPosition(ox, optY);
        this.feel.breathe(o, 0.02);
        return o;
      });

      const norm = (s) => String(s).trim().toLowerCase();
      const refresh = () => {
        const gap = currentGap();
        EduCore.setTappables(optObjs.map((o) => ({
          id: o.def.id, label: o.def.label, x: o.x, y: o.y, w: 110, h: 110,
          correct: !!gap && norm(o.def.label) === norm(gap.def.label),
        })));
      };

      hintApi.onNarrow(() => {
        const gap = currentGap();
        if (!gap) return;
        const target = optObjs.find((o) => norm(o.def.label) === norm(gap.def.label));
        if (target) this.pulseTarget(target);
      });

      return new Promise((resolve) => {
        this.armLater(optObjs);
        for (const o of optObjs) {
          Interact.makeTappable(this, o, {
            w: 110, h: 110,
            onTap: () => {
              const gap = currentGap();
              if (!gap) return;
              EduCore.reportLearning('object_interacted', {
                itemId: item.id, kind: 'build_option', objectId: o.def.id,
              });
              if (norm(o.def.label) === norm(gap.def.label)) {
                gap.done = true;
                filled++;
                this.setProgress(filled, gaps.length);
                // the shape flies from the option into the gap and solidifies
                const fly = this.add.container(o.x, o.y);
                const fg = this.add.graphics();
                const fill = this.wrapper.shapeFill[gap.shape];
                drawShape(fg, gap.shape, size, fill);
                drawDecor(fg, gap.shape, this.wrapper.decor[gap.shape], size, fill);
                fly.add(fg);
                fly.setScale(88 / size);
                this.playLayer.add(fly);
                if (gap.qMark) gap.qMark.setAlpha(0);
                this.tweens.add({
                  targets: fly, x: gap.x, y: gap.y, scale: 1,
                  duration: 340, ease: 'Cubic.easeOut',
                  onComplete: () => {
                    this.feel.sparkle(gap.x, gap.y, EduCore.accentInt, 8);
                    this.feel.squash(fly, 0.18, 200);
                  },
                });
                GameFeel.audio.correctChain(filled);
                refresh();
                if (filled >= gaps.length) {
                  this.time.delayedCall(520, () =>
                    resolve({ correct: wrongAttempts === 0, final: true, completed: true }));
                }
              } else {
                wrongAttempts++;
                this.wrongTouch(o);
              }
            },
          });
        }
        refresh();
      });
    }

    // ------------------------------------------------------------- tutorial
    async runTutorial() {
      const T = TUTORIAL[EduCore.lang] || TUTORIAL.en;
      await this.tutorialSay(T.intro);

      // one guided tap: find the circle among three shapes
      const defs = [
        { id: 'tut_c', label: EduCore.lang === 'ar' ? 'دائرة' : 'circle', correct: true },
        { id: 'tut_s', label: EduCore.lang === 'ar' ? 'مربع' : 'square', correct: false },
        { id: 'tut_t', label: EduCore.lang === 'ar' ? 'مثلث' : 'triangle', correct: false },
      ];
      const xs = [W / 2 - 190, W / 2, W / 2 + 190];
      const objs = defs.map((def, i) => {
        const o = this.buildShapeObject(def, 120);
        o.setPosition(xs[i], 560);
        this.feel.breathe(o, 0.03);
        return o;
      });
      const circle = objs[0];
      circle.glow.setAlpha(0.35);
      this.tweens.add({ targets: circle.glow, alpha: 0.1, duration: 900, yoyo: true, repeat: -1 });

      this.promptText.setText(T.prompt);
      this.tweens.add({ targets: this.promptPanel, alpha: 1, duration: 200 });
      this.exposeTappables(objs);

      await new Promise((resolve) => {
        this.armLater(objs);
        for (const o of objs) {
          Interact.makeTappable(this, o, {
            w: 124, h: 124,
            onTap: () => {
              EduCore.reportLearning('object_interacted', {
                itemId: 'tutorial', kind: 'scene_object', objectId: o.def.id,
              });
              if (o.def.correct) {
                EduCore.setTappables([]); // shapes are no longer targets
                this.feel.confetti(o.x, o.y, this.wrapper.confetti, 12);
                GameFeel.audio.correctChain(1);
                resolve();
              } else {
                this.wrongTouch(o);
              }
            },
          });
        }
      });

      await this.tutorialSay(T.done);
      this.clearPlayArea();
      this.promptText.setText('');
      this.tweens.add({ targets: this.promptPanel, alpha: 0, duration: 200 });
    }

    tutorialSay(text) {
      return new Promise((resolve) => {
        const c = this.add.container(0, 0).setDepth(60);
        const py = 1040;
        const panel = GameFeel.cardPanel(this, W / 2, py, 640, 170, {
          color: P.sand, stroke: EduCore.accentInt, strokeWidth: 3,
        });
        const tx = this.add.text(W / 2, py - 52, '',
          EduCore.textStyle(26, { color: '#19725E', align: EduCore.isRTL ? 'right' : 'left', wrap: 560, lineSpacing: 7 }))
          .setOrigin(0.5, 0);
        c.add([panel, tx]);
        this.guide.react('hint');
        const zone = this.add.zone(W / 2, py, 660, 190).setInteractive().setDepth(61);
        this.feel.typewriter(tx, text, { cps: 42, skipOn: zone }).then(() => {
          zone.removeAllListeners();
          const cont = this.add.text(W / 2, py + 60, EduCore.t('tapToContinue'),
            EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5).setDepth(61);
          this.tweens.add({ targets: cont, alpha: 0.4, duration: 550, yoyo: true, repeat: -1 });
          zone.once('pointerdown', () => {
            this.guide.setExpression('idle');
            cont.destroy(); zone.destroy(); c.destroy();
            resolve();
          });
        });
      });
    }
  }

  /** Silhouette (gap) variant — outline only, soft fill already applied. */
  function drawShapeSilhouette(g, shape, size) {
    const r = size / 2;
    if (shape === 'circle') {
      g.fillCircle(0, 0, r);
      g.lineStyle(3, 0xb5702f, 0.9);
      g.strokeCircle(0, 0, r);
    } else if (shape === 'square') {
      g.fillRoundedRect(-r, -r, size, size, 10);
      g.lineStyle(3, 0xb5702f, 0.9);
      g.strokeRoundedRect(-r, -r, size, size, 10);
    } else if (shape === 'rect') {
      g.fillRoundedRect(-r * 1.25, -r * 0.7, size * 1.25, size * 0.7, 10);
      g.lineStyle(3, 0xb5702f, 0.9);
      g.strokeRoundedRect(-r * 1.25, -r * 0.7, size * 1.25, size * 0.7, 10);
    } else {
      g.fillTriangle(0, -r, r, r * 0.85, -r, r * 0.85);
      g.lineStyle(3, 0xb5702f, 0.9);
      g.strokeTriangle(0, -r, r, r * 0.85, -r, r * 0.85);
    }
  }

  EduCore.boot(window.__EDUMIND_SPEC__, {
    gameType: 'number_city',
    createGameScene: () => NumberCityScene,
    buildMenuBackdrop(scene) {
      const theme = THEMES[EduCore.spec.meta.theme] || THEMES.shapes_district;
      const wrap = WRAPPERS[EduCore.spec.meta.wrapper] || WRAPPERS.nature;
      const g = scene.add.graphics();
      g.fillStyle(theme.skyTop, 1);
      g.fillRect(0, 0, W, H * 0.5);
      g.fillStyle(theme.skyBottom, 1);
      g.fillRect(0, H * 0.5, W, H * 0.5);
      // shape skyline on the horizon
      g.fillStyle(theme.skyline, 0.12);
      g.fillRect(60, 760, 90, 200);
      g.fillTriangle(200, 760, 110, 760, 155, 690);
      g.fillCircle(320, 830, 60);
      g.fillRect(420, 780, 80, 180);
      g.fillCircle(600, 800, 45);
      g.fillStyle(wrap.ground, 0.9);
      g.fillRect(0, 950, W, H - 950);
      // (IntroScene lays a cream wash over every backdrop for menu-text contrast)
    },
  });
})();
