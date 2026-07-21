/**
 * Draw & Connect — visual/spatial learning through touch drawing.
 *
 * A diagram appears (nodes + valid edges from the spec); the student draws
 * connections with one finger. Evaluation is 100% programmatic — predefined
 * connection points and valid edges, never AI vision. Connection points glow
 * on approach; correct connections snap + sparkle; wrong ones fade with a
 * gentle shake. Lines draw in the student's favorite color.
 *
 * Themes: blueprint, notebook, whiteboard, chalkboard.
 */
(function () {
  'use strict';

  const W = 720;
  const H = 1280;

  // Diagram board mapping (normalized spec coords → canvas).
  const BOARD = { x: 30, y: 235, w: 660, h: 950 };
  const GRAB_RADIUS = 56; // px around a node that captures a touch
  const GLOW_RADIUS = 80; // approach-glow distance

  // Light, calm boards on the warm OpenMind palette. The chalkboard keeps a
  // board-green identity but at a calm mid tone — never near-black.
  const THEMES = {
    blueprint: {
      bg: 0xceebf0, gridline: 0x079a90, ink: '#19725E', inkInt: 0x19725e,
      chip: 0xddf0f4, ambient: 'shimmer',
    },
    notebook: {
      bg: 0xfdf2e2, gridline: 0xa9cfd8, ink: '#19725E', inkInt: 0x19725e,
      chip: 0xfae9d0, ambient: 'pencil',
    },
    whiteboard: {
      bg: 0xf6f9fa, gridline: 0xd7dee4, ink: '#19725E', inkInt: 0x19725e,
      chip: 0xe6ecf1, ambient: 'dust',
    },
    chalkboard: {
      bg: 0x4d8c58, gridline: 0xffffff, ink: '#FDF2E2', inkInt: 0xfdf2e2,
      chip: 0x3f7549, ambient: 'chalk',
    },
  };

  const TUTORIAL = {
    en: {
      intro: 'Draw with one finger! Touch a shape, drag to its twin, and let go.',
      prompt: 'Connect circle to circle, then square to square.',
      done: 'Perfect lines! The triangle was a decoy — boards have those.',
    },
    ar: {
      intro: 'ارسم بإصبع واحد! المس شكلًا، واسحب نحو توأمه، ثم ارفع إصبعك.',
      prompt: 'صل الدائرة بالدائرة، ثم المربع بالمربع.',
      done: 'خطوط رائعة! المثلث كان خدعة — اللوحات تحوي خدعًا كهذه.',
    },
  };

  function nodePos(n) {
    return { x: BOARD.x + n.x * BOARD.w, y: BOARD.y + n.y * BOARD.h };
  }
  function undirected(a, b) {
    return a < b ? a + '||' + b : b + '||' + a;
  }

  class DrawConnectScene extends EduCore.BaseGameScene {
    buildStage() {
      const theme = THEMES[EduCore.spec.meta.theme] || THEMES.whiteboard;
      this.theme = theme;
      this.hintPos = { x: EduCore.isRTL ? 70 : W - 70, y: 1226 };
      this.hintBubbleY = 1100;

      this.drawBoardBackground();

      // line layers: persistent (completed) under active (in-progress)
      this.doneLines = this.add.graphics().setDepth(3);
      this.activeLine = this.add.graphics().setDepth(4);
      this.nodeLayer = this.add.container(0, 0).setDepth(5);

      // prompt panel (warm sand card on every theme for consistent reading;
      // hidden until it has something to say)
      this.promptPanel = GameFeel.cardPanel(this, W / 2, 150, 664, 132, {
        color: 0xfae9d0, alpha: 0.97, stroke: 0xdccdb7, strokeWidth: 3,
      }).setDepth(8).setAlpha(0);
      this.promptText = this.add.text(EduCore.isRTL ? W / 2 + 296 : W / 2 - 296, 104, '',
        EduCore.textStyle(26, { color: '#19725E', wrap: 500, lineSpacing: 6 }))
        .setOrigin(EduCore.isRTL ? 1 : 0, 0).setDepth(9);
      // progress pill ("2/3")
      this.progressPill = this.add.graphics().setDepth(9);
      this.progressText = this.add.text(EduCore.isRTL ? 84 : W - 84, 150, '',
        EduCore.textStyle(24, { weight: '800', color: '#FDF2E2', align: 'center' }))
        .setOrigin(0.5).setDepth(10);

      this.guide = new Hoopoe(this, EduCore.isRTL ? W - 78 : 78, 1224, {
        accent: EduCore.accentInt, scale: 0.52,
      });
      this.guide.setDepth(8);

      this.nodes = new Map(); // id → {def, c, glow, pulse}
      this.completedPairs = new Set();
      this.touredOnce = false;
      this.setupPointer();
      this.teachStyle = { panelColor: 0xfae9d0 };
    }

    drawBoardBackground() {
      const t = this.theme;
      const themeKey = EduCore.spec.meta.theme;
      const g = this.add.graphics().setDepth(0);
      g.fillStyle(t.bg, 1);
      g.fillRect(0, 0, W, H);

      if (themeKey === 'blueprint') {
        g.lineStyle(1, t.gridline, 0.08);
        for (let x = 0; x <= W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.strokePath(); }
        for (let y = 0; y <= H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.strokePath(); }
        g.lineStyle(2, t.gridline, 0.16);
        for (let x = 0; x <= W; x += 200) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.strokePath(); }
      } else if (themeKey === 'notebook') {
        g.lineStyle(2, t.gridline, 0.5);
        for (let y = 260; y <= H; y += 46) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.strokePath(); }
        g.lineStyle(3, 0xd93b5e, 0.5); // berry margin line — decoration only
        g.beginPath(); g.moveTo(64, 230); g.lineTo(64, H); g.strokePath();
        // spiral holes
        g.fillStyle(0xd9cfae, 1);
        for (let y = 300; y < H; y += 130) g.fillCircle(26, y, 9);
      } else if (themeKey === 'whiteboard') {
        // faint old-marker smudges
        g.fillStyle(0xb9c6cf, 0.1);
        g.fillEllipse(180, 500, 220, 60);
        g.fillEllipse(520, 900, 260, 70);
        // marker tray
        g.fillStyle(0xc7d2da, 1);
        g.fillRoundedRect(160, H - 26, 400, 18, 8);
        g.fillStyle(EduCore.accentInt, 1);
        g.fillRoundedRect(240, H - 34, 70, 12, 6);
        g.fillStyle(0x19725e, 1);
        g.fillRoundedRect(360, H - 34, 70, 12, 6);
      } else { // chalkboard
        g.lineStyle(10, 0x8a6d4b, 1);
        g.strokeRect(5, 5, W - 10, H - 10);
        g.fillStyle(0xffffff, 0.05);
        g.fillEllipse(300, 700, 300, 90);
        // chalk in the tray
        g.fillStyle(0xf2f7f2, 1);
        g.fillRoundedRect(W / 2 - 50, H - 30, 64, 12, 6);
      }

      this.buildAmbient(t.ambient);
    }

    buildAmbient(kind) {
      if (kind === 'shimmer') {
        const sweep = this.add.rectangle(-80, H / 2, 60, H, 0xffffff, 0.05).setDepth(1);
        this.tweens.add({ targets: sweep, x: W + 80, duration: 5200, repeat: -1, repeatDelay: 2400, ease: 'Sine.easeInOut' });
      } else if (kind === 'pencil') {
        // a wandering pencil doodling in the margin
        const pencil = this.add.container(40, 400).setDepth(1);
        const pg = this.add.graphics();
        pg.fillStyle(0xffc04d, 1);
        pg.fillRoundedRect(-5, -22, 10, 36, 3);
        pg.fillStyle(0xd9a066, 1);
        pg.fillTriangle(-5, 14, 5, 14, 0, 26);
        pg.fillStyle(0x35261c, 1);
        pg.fillTriangle(-2, 21, 2, 21, 0, 26);
        pencil.add(pg);
        pencil.setAngle(18);
        this.tweens.add({ targets: pencil, y: 980, duration: 9000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: pencil, angle: -14, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else { // dust / chalk
        for (let i = 0; i < 6; i++) {
          const fleck = this.add.circle(Math.random() * W, Math.random() * H, 2.2,
            this.theme.inkInt, 0.18).setDepth(1);
          this.tweens.add({
            targets: fleck,
            y: fleck.y - 90 - Math.random() * 60,
            x: fleck.x + 40 - Math.random() * 80,
            alpha: 0,
            duration: 5200 + Math.random() * 2600,
            repeat: -1,
            delay: Math.random() * 4000,
            onRepeat: () => {
              fleck.y = 300 + Math.random() * 800;
              fleck.x = Math.random() * W;
              fleck.alpha = 0.18;
            },
          });
        }
      }
    }

    // --------------------------------------------------------------- nodes
    buildDiagram(nodes) {
      this.clearDiagram();
      nodes.forEach((def) => this.buildNode(def));
    }

    clearDiagram() {
      this.nodeLayer.removeAll(true);
      this.nodes.clear();
      this.doneLines.clear();
      this.activeLine.clear();
      this.completedPairs.clear();
    }

    buildNode(def) {
      const p = nodePos(def);
      const t = this.theme;
      const c = this.add.container(p.x, p.y);
      const glow = this.add.circle(0, 0, 34, EduCore.accentInt, 0).setDepth(0);
      c.add(glow);
      const g = this.add.graphics();

      if (def.kind === 'point') {
        g.fillStyle(EduCore.accentInt, 0.25);
        g.fillCircle(0, 0, 22);
        g.fillStyle(t.inkInt, 1);
        g.fillCircle(0, 0, 12);
        g.lineStyle(3, EduCore.accentInt, 1);
        g.strokeCircle(0, 0, 17);
        c.add(g);
        const label = this.add.text(0, 34, def.label, EduCore.textStyle(24, {
          weight: '800', color: t.ink, align: 'center', wrap: 200,
        })).setOrigin(0.5, 0);
        c.add(label);
        c.labelObj = label;
      } else {
        // chip node (label / icon)
        const tmp = this.add.text(0, 0, def.label, EduCore.textStyle(24, {
          weight: '700', color: t.ink, align: 'center', wrap: 230,
        })).setOrigin(0.5);
        const chipW = Math.max(tmp.width + 38, 70);
        const chipH = Math.max(tmp.height + 22, 48);
        g.fillStyle(GameFeel.darken(t.chip, 0.25), 1);
        g.fillRoundedRect(-chipW / 2, -chipH / 2 + 4, chipW, chipH, 16);
        g.fillStyle(t.chip, 1);
        g.fillRoundedRect(-chipW / 2, -chipH / 2, chipW, chipH, 16);
        g.lineStyle(2.5, EduCore.accentInt, 0.85);
        g.strokeRoundedRect(-chipW / 2, -chipH / 2, chipW, chipH, 16);
        c.add(g);
        c.add(tmp);
        c.labelObj = tmp;
        c.chipW = chipW;
        c.chipH = chipH;
      }

      // gentle permanent pulse on point nodes (connection points feel alive)
      const pulse = this.tweens.add({
        targets: glow, alpha: { from: 0, to: 0.12 }, scale: 1.15,
        duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        delay: Math.random() * 800,
      });

      this.nodeLayer.add(c);
      this.nodes.set(def.id, { def, c, glow, pulse, pos: p });
      return c;
    }

    nearestNode(x, y, radius) {
      let best = null, bestD = radius;
      for (const [, n] of this.nodes) {
        const d = Math.hypot(n.pos.x - x, n.pos.y - y);
        if (d < bestD) { best = n; bestD = d; }
      }
      return best;
    }

    // ------------------------------------------------------------- drawing
    /** One-finger drawing on the shared Interact drag primitive. */
    setupPointer() {
      this.drag = Interact.attachDrag(this, {
        findTarget: (x, y) => this.nearestNode(x, y, GRAB_RADIUS),
        onGrab: (n) => {
          n.glow.setAlpha(0.45);
          GameFeel.audio.tick();
          EduCore.reportLearning('object_interacted', { kind: 'node', nodeId: n.def.id });
        },
        onMove: (pointer, points, start) => {
          this.renderActiveLine(pointer, points);
          // approach glow
          const near = this.nearestNode(pointer.x, pointer.y, GLOW_RADIUS);
          for (const [, n] of this.nodes) {
            if (n === start) continue;
            n.glow.setAlpha(n === near ? 0.4 : 0);
          }
        },
        onDrop: (start, pointer, points) => {
          const end = this.nearestNode(pointer.x, pointer.y, GRAB_RADIUS);
          for (const [, n] of this.nodes) n.glow.setAlpha(0);
          if (end && end !== start) {
            this.onAttempt(start, end, points);
          } else {
            this.fadeActiveLine();
          }
        },
      });
    }

    get drawingEnabled() {
      return this.drag.enabled;
    }
    set drawingEnabled(v) {
      if (v) this.drag.enable();
      else this.drag.disable();
    }

    /** Smoothed polyline through sampled finger points (quadratic midpoints). */
    renderActiveLine(pointer, points) {
      const g = this.activeLine;
      const pts = points.concat([{ x: pointer.x, y: pointer.y }]);
      g.clear();
      g.lineStyle(7, EduCore.accentInt, 0.95);
      if (pts.length < 2) return;
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        // quadratic-ish smoothing: line to midpoints keeps it soft and cheap
        g.lineTo(mx, my);
      }
      g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      g.strokePath();
      // pen glow under the finger
      g.fillStyle(EduCore.accentInt, 0.3);
      g.fillCircle(pointer.x, pointer.y, 14);
    }

    fadeActiveLine() {
      // Fade the in-progress line out, then clear and restore for reuse.
      this.tweens.add({
        targets: this.activeLine,
        alpha: 0,
        duration: 220,
        onComplete: () => {
          this.activeLine.clear();
          this.activeLine.setAlpha(1);
        },
      });
    }

    /** A finished drag between two nodes — judge it. */
    onAttempt(start, end, points) {
      const pairKey = undirected(start.def.id, end.def.id);
      const required = this.currentRequired; // Map pairKey → canonical edgeId
      this.activeLine.clear();

      if (required && required.has(pairKey) && !this.completedPairs.has(pairKey)) {
        this.completedPairs.add(pairKey);
        this.drawDoneEdge(start, end, required.get(pairKey));
        this.feel.sparkle((start.pos.x + end.pos.x) / 2, (start.pos.y + end.pos.y) / 2, EduCore.accentInt, 8);
        this.feel.squash(end.c, 0.18, 220);
        GameFeel.audio.correctChain(this.completedPairs.size);
        this.updateProgress();
        if (this.onConnection) this.onConnection(true, pairKey);
      } else {
        // wrong: gentle shake of both endpoints + the ghost line fades
        const ghost = this.add.graphics().setDepth(4);
        ghost.lineStyle(7, 0xb5702f, 0.7);
        ghost.beginPath();
        ghost.moveTo(start.pos.x, start.pos.y);
        ghost.lineTo(end.pos.x, end.pos.y);
        ghost.strokePath();
        this.tweens.add({ targets: ghost, alpha: 0, duration: 420, onComplete: () => ghost.destroy() });
        this.feel.wiggle(start.c, 2.4);
        this.feel.wiggle(end.c, 2.4);
        if (this.onConnection) this.onConnection(false, pairKey);
      }
    }

    /** Completed connection: clean snapped curve + arrowhead toward canonical 'to'. */
    drawDoneEdge(start, end, edgeId) {
      const [fromId] = edgeId.split('->');
      const a = start.def.id === fromId ? start : end;
      const b = a === start ? end : start;
      const g = this.doneLines;
      const mx = (a.pos.x + b.pos.x) / 2;
      const my = (a.pos.y + b.pos.y) / 2 - 26; // soft arch
      g.lineStyle(6, EduCore.accentInt, 0.9);
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(a.pos.x, a.pos.y),
        new Phaser.Math.Vector2(mx, my),
        new Phaser.Math.Vector2(b.pos.x, b.pos.y)
      );
      curve.draw(g, 24);
      // arrowhead at 72% pointing along the curve (flow direction matters)
      const tp = curve.getPoint(0.72);
      const tn = curve.getTangent(0.72);
      const ang = Math.atan2(tn.y, tn.x);
      g.fillStyle(EduCore.accentInt, 1);
      g.fillTriangle(
        tp.x + Math.cos(ang) * 14, tp.y + Math.sin(ang) * 14,
        tp.x + Math.cos(ang + 2.5) * 11, tp.y + Math.sin(ang + 2.5) * 11,
        tp.x + Math.cos(ang - 2.5) * 11, tp.y + Math.sin(ang - 2.5) * 11
      );
    }

    updateProgress() {
      const total = this.currentRequired ? this.currentRequired.size : 0;
      const done = this.completedPairs.size;
      this.progressText.setText(EduCore.fmtNum(done) + '/' + EduCore.fmtNum(total));
      this.progressPill.clear();
      this.progressPill.fillStyle(0x19725e, 0.9);
      const px = EduCore.isRTL ? 84 : W - 84;
      this.progressPill.fillRoundedRect(px - 46, 128, 92, 44, 22);
      this.feel.squash(this.progressText, 0.2, 180);
    }

    // -------------------------------------------------------- teach phase
    /** Guided tour on first educational level: parts glow in sequence. */
    async teachPhase(level) {
      if (level.index === 1 && !this.touredOnce) {
        this.touredOnce = true;
        this.buildDiagram(EduCore.spec.diagram.nodes);
        await this.nodeTour();
      }
      await super.teachPhase(level);
    }

    nodeTour() {
      return new Promise((resolve) => {
        const list = [...this.nodes.values()];
        let i = 0;
        let skipped = false;
        const zone = this.add.zone(W / 2, H / 2, W, H).setInteractive().setDepth(50);
        zone.once('pointerdown', () => { skipped = true; });
        const step = () => {
          if (skipped || i >= list.length) {
            zone.destroy();
            resolve();
            return;
          }
          const n = list[i++];
          n.glow.setAlpha(0.5);
          this.tweens.add({ targets: n.c, scale: 1.14, duration: 240, yoyo: true, ease: 'Sine.easeInOut' });
          GameFeel.audio.tick();
          this.time.delayedCall(420, () => {
            n.glow.setAlpha(0);
            step();
          });
        };
        step();
      });
    }

    // -------------------------------------------------------------- items
    async presentItem(item, hintApi) {
      if (EduCore.spec.meta.variant === 'sort_streams') {
        return this.presentSortStreams(item, hintApi);
      }
      // (Re)build the diagram if a level transition cleared it.
      if (this.nodes.size === 0) this.buildDiagram(EduCore.spec.diagram.nodes);

      // Required edges for THIS item (undirected matching; arrows show flow).
      this.currentRequired = new Map();
      for (const eid of item.edgeIds) {
        const [from, to] = eid.split('->');
        this.currentRequired.set(undirected(from, to), eid);
        this.completedPairs.delete(undirected(from, to)); // re-draws on review items
      }
      this.redrawDoneLines();
      this.updateProgress();

      this.promptText.setText('');
      this.tweens.add({ targets: this.promptPanel, alpha: 1, duration: 200 });
      await this.feel.typewriter(this.promptText, item.prompt, { cps: 46 });

      EduCore.setTappables([...this.nodes.values()].map((n) => ({
        id: n.def.id, label: n.def.label, x: n.pos.x, y: n.pos.y,
        w: GRAB_RADIUS * 2, h: GRAB_RADIUS * 2,
        correct: [...this.currentRequired.keys()].some((k) => k.includes(n.def.id)),
      })));

      // Hint 2 narrows: pulse the 'from' side of the remaining edges.
      hintApi.onNarrow(() => {
        for (const [pairKey, eid] of this.currentRequired) {
          if (this.completedPairs.has(pairKey)) continue;
          const fromId = eid.split('->')[0];
          const n = this.nodes.get(fromId);
          if (n) {
            n.glow.setAlpha(0.55);
            this.tweens.add({ targets: n.c, scale: 1.16, duration: 280, yoyo: true, repeat: 2 });
            this.time.delayedCall(1800, () => n.glow.setAlpha(0));
          }
        }
      });

      let wrongAttempts = 0;
      await new Promise((resolve) => {
        this.drawingEnabled = true;
        this.exposeConnectDebug();
        this.onConnection = (ok) => {
          if (!ok) {
            wrongAttempts++;
            return;
          }
          const allDone = [...this.currentRequired.keys()].every((k) => this.completedPairs.has(k));
          if (allDone) {
            this.drawingEnabled = false;
            this.onConnection = null;
            resolve();
          }
        };
      });

      EduCore.setTappables([]);
      // Drawing until complete IS the supportive retry for this mechanic —
      // `final` tells the engine loop not to re-present the item, and
      // `completed` marks a finish-with-stumbles as recovered, not failed.
      return { correct: wrongAttempts === 0, final: true, completed: true };
    }

    /**
     * sort_streams variant: the item's `from` nodes become draggable part
     * chips; its `to` nodes (plus one decoy) become labeled bins. Drag each
     * part into its matching bin. Same diagram data, same evaluation truth
     * (the edges), a completely different game feel — classify, not trace.
     */
    async presentSortStreams(item, hintApi) {
      // The classify board OWNS the screen — clear any diagram the tutorial or
      // a prior connect item left behind (else nodes bleed through the bins).
      this.clearDiagram();

      const diagram = EduCore.spec.diagram;
      const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
      // chip → its correct bin, straight from the item's edges
      const pairs = item.edgeIds.map((eid) => {
        const [from, to] = eid.split('->');
        return { from, to };
      });
      const binIds = [...new Set(pairs.map((p) => p.to))];
      // one decoy bin keeps the sort honest (a distractor node when available)
      const decoyId = (diagram.distractorNodeIds || []).find((id) => !binIds.includes(id));
      const allBinIds = decoyId && binIds.length < 3 ? [...binIds, decoyId] : binIds;

      // The connect content's prompt says "draw a line" — reframe it for the
      // sort mechanic so the child is never told to do the wrong gesture.
      const sortInstr = EduCore.lang === 'ar'
        ? 'اسحب كل قطعة إلى الصندوق الذي يناسبها.'
        : 'Drag each part into the box it belongs to.';

      this.promptText.setText('');
      this.tweens.add({ targets: this.promptPanel, alpha: 1, duration: 200 });
      await this.feel.typewriter(this.promptText, sortInstr, { cps: 46 });

      const layer = this.add.container(0, 0).setDepth(10);
      const t = this.theme;

      // bins in a single clean row, well below the prompt panel
      const binW = Math.min(300, (W - 60) / allBinIds.length - 18);
      const binY = 520;
      const bins = allBinIds.map((id, i) => {
        const x = W / 2 + (i - (allBinIds.length - 1) / 2) * (binW + 22);
        const c = this.add.container(x, binY);
        const g = this.add.graphics();
        g.fillStyle(t.chip, 1);
        g.fillRoundedRect(-binW / 2, -78, binW, 156, 18);
        g.lineStyle(4, EduCore.accentInt, 0.55);
        g.strokeRoundedRect(-binW / 2, -78, binW, 156, 18);
        c.add(g);
        c.add(this.add.text(0, -50, byId.get(id)?.label ?? id,
          EduCore.textStyle(23, { color: t.ink, align: 'center', wrap: binW - 24 })).setOrigin(0.5, 0.5));
        layer.add(c);
        return { id, c, x, y: binY, count: 0 };
      });
      this.feel.cascadeIn(bins.map((b) => b.c), { stagger: 90, dy: 16 });

      // part chips waiting in a tidy tray at the bottom (max 3 per row)
      const perRow = Math.min(3, Math.max(1, pairs.length));
      const chipW = Math.min(200, (W - 60) / perRow - 16);
      const chips = pairs.map((p, i) => {
        const col = i % perRow;
        const rowN = Math.floor(i / perRow);
        const x = W / 2 + (col - (perRow - 1) / 2) * (chipW + 16);
        const y = 900 + rowN * 96;
        const c = this.add.container(x, y);
        const g = this.add.graphics();
        g.fillStyle(0xffffff, 0.96);
        g.fillRoundedRect(-chipW / 2, -36, chipW, 72, 14);
        g.lineStyle(3, t.gridline, 0.8);
        g.strokeRoundedRect(-chipW / 2, -36, chipW, 72, 14);
        c.add(g);
        c.add(this.add.text(0, 0, byId.get(p.from)?.label ?? p.from,
          EduCore.textStyle(22, { color: t.ink, align: 'center', wrap: chipW - 20 })).setOrigin(0.5));
        layer.add(c);
        return { from: p.from, to: p.to, c, home: { x, y }, placed: false };
      });
      this.feel.cascadeIn(chips.map((ch) => ch.c), { stagger: 80, dy: 20 });

      EduCore.setTappables(chips.map((ch, i) => ({
        id: 'chip' + i, label: byId.get(ch.from)?.label ?? ch.from,
        x: ch.c.x, y: ch.c.y, w: 200, h: 72, correct: true,
      })));

      // Hint 2 narrows: the first unplaced chip's bin glows.
      hintApi.onNarrow(() => {
        const next = chips.find((ch) => !ch.placed);
        const bin = next && bins.find((b) => b.id === next.to);
        if (bin) this.tweens.add({ targets: bin.c, scale: 1.1, duration: 300, yoyo: true, repeat: 2 });
      });

      let wrongAttempts = 0;
      await new Promise((resolve) => {
        const rig = Interact.attachDrag(this, {
          findTarget: (x, y) =>
            Interact.nearest(chips.filter((ch) => !ch.placed), x, y, 90, (ch) => ch.c) || null,
          onGrab: (ch) => {
            GameFeel.audio.tick();
            layer.bringToTop(ch.c);
            EduCore.reportLearning('object_interacted', { kind: 'sort_chip', itemId: item.id });
          },
          onMove: (pointer, points, ch) => ch.c.setPosition(pointer.x, pointer.y),
          onDrop: (ch, pointer) => {
            const bin = Interact.nearest(bins, pointer.x, pointer.y, 160, (b) => b);
            if (bin && bin.id === ch.to) {
              ch.placed = true;
              bin.count++;
              // the part settles into its bin
              this.tweens.add({
                targets: ch.c,
                x: bin.x, y: bin.y + 8 + bin.count * 14, scale: 0.72,
                duration: 240, ease: 'Cubic.easeOut',
              });
              this.feel.sparkle(bin.x, bin.y, 0x84a253, 6);
              GameFeel.audio.correctChain(EduCore.session.combo);
              if (chips.every((c2) => c2.placed)) {
                rig.disable();
                resolve();
              }
            } else {
              if (bin) {
                wrongAttempts++;
                GameFeel.audio.wrongTone();
                this.feel.wiggle(bin.c, 3);
              }
              // home again — a stray drop is exploration, never punishment
              this.tweens.add({
                targets: ch.c, x: ch.home.x, y: ch.home.y,
                duration: 280, ease: 'Back.easeOut',
              });
            }
          },
        });
        rig.enable();
        window.EduMindDebug.getDrag = () => ({
          chips: chips.filter((ch) => !ch.placed).map((ch) => ({
            x: ch.c.x, y: ch.c.y,
            targetX: bins.find((b) => b.id === ch.to)?.x,
            targetY: bins.find((b) => b.id === ch.to)?.y,
          })),
        });
      });

      window.EduMindDebug.getDrag = null;
      EduCore.setTappables([]);
      this.feel.confetti(W / 2, 500, 16);
      await new Promise((r) => this.time.delayedCall(700, r));
      this.tweens.add({
        targets: layer, alpha: 0, duration: 300,
        onComplete: () => layer.destroy(),
      });
      // Sorting until every part is home IS this mechanic's supportive retry.
      return { correct: wrongAttempts === 0, final: true, completed: true };
    }

    /** Test surface: remaining required connections as coordinate pairs. */
    exposeConnectDebug() {
      window.EduMindDebug.getConnect = () =>
        [...this.currentRequired.keys()]
          .filter((k) => !this.completedPairs.has(k))
          .map((k) => {
            const [a, b] = k.split('||');
            const na = this.nodes.get(a), nb = this.nodes.get(b);
            return na && nb ? { ax: na.pos.x, ay: na.pos.y, bx: nb.pos.x, by: nb.pos.y } : null;
          })
          .filter(Boolean);
    }

    redrawDoneLines() {
      this.doneLines.clear();
      // keep faint memory of past connections (they were learned!)
      for (const pairKey of this.completedPairs) {
        const [a, b] = pairKey.split('||');
        const na = this.nodes.get(a), nb = this.nodes.get(b);
        if (!na || !nb) continue;
        this.doneLines.lineStyle(4, EduCore.accentInt, 0.22);
        this.doneLines.beginPath();
        this.doneLines.moveTo(na.pos.x, na.pos.y);
        this.doneLines.lineTo(nb.pos.x, nb.pos.y);
        this.doneLines.strokePath();
      }
    }

    // ----------------------------------------------------------- tutorial
    async runTutorial() {
      const T = TUTORIAL[EduCore.lang] || TUTORIAL.en;
      await this.tutorialSay(T.intro);

      // build practice shapes: two circles, two squares, one triangle decoy
      const defs = [
        { id: 'c1', x: 0.18, y: 0.2, label: '●', kind: 'point' },
        { id: 'c2', x: 0.82, y: 0.2, label: '●', kind: 'point' },
        { id: 's1', x: 0.18, y: 0.55, label: '■', kind: 'point' },
        { id: 's2', x: 0.82, y: 0.55, label: '■', kind: 'point' },
        { id: 'tri', x: 0.5, y: 0.82, label: '▲', kind: 'point' },
      ];
      this.buildDiagram(defs);
      this.promptText.setText(T.prompt);
      this.tweens.add({ targets: this.promptPanel, alpha: 1, duration: 200 });

      this.currentRequired = new Map([
        [undirected('c1', 'c2'), 'c1->c2'],
        [undirected('s1', 's2'), 's1->s2'],
      ]);
      this.updateProgress();
      EduCore.setTappables(defs.map((d) => {
        const p = nodePos(d);
        return {
          id: d.id, label: d.label, x: p.x, y: p.y, w: GRAB_RADIUS * 2, h: GRAB_RADIUS * 2,
          correct: d.id !== 'tri',
        };
      }));

      await new Promise((resolve) => {
        this.drawingEnabled = true;
        this.exposeConnectDebug();
        this.onConnection = (ok) => {
          if (!ok) GameFeel.audio.wrongTone();
          const allDone = [...this.currentRequired.keys()].every((k) => this.completedPairs.has(k));
          if (allDone) {
            this.drawingEnabled = false;
            this.onConnection = null;
            EduCore.setTappables([]); // nodes are no longer answer targets
            resolve();
          }
        };
      });
      this.feel.confetti(W / 2, 500, null, 10);
      await this.tutorialSay(T.done);
      this.clearDiagram();
      this.promptText.setText('');
      this.tweens.add({ targets: this.promptPanel, alpha: 0, duration: 200 });
      this.progressText.setText('');
      this.progressPill.clear();
      EduCore.setTappables([]);
    }

    tutorialSay(text) {
      return new Promise((resolve) => {
        const c = this.add.container(0, 0).setDepth(60);
        const py = 1060;
        const panel = GameFeel.cardPanel(this, W / 2, py, 640, 170, {
          color: 0xfae9d0, stroke: EduCore.accentInt, strokeWidth: 3,
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

    /** Keep the diagram across levels (it's the same board), no slide. */
    levelTransition() {
      return new Promise((resolve) => {
        this.cameras.main.fadeOut(120, 253, 242, 226);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.cameras.main.fadeIn(160, 253, 242, 226);
          resolve();
        });
      });
    }
  }

  EduCore.register({
    gameType: 'draw_connect',
    createGameScene: () => DrawConnectScene,
    buildMenuBackdrop(scene) {
      const themeKey = EduCore.spec.meta.theme;
      const theme = THEMES[themeKey] || THEMES.whiteboard;
      const g = scene.add.graphics();
      g.fillStyle(theme.bg, 1);
      g.fillRect(0, 0, W, H);
      g.lineStyle(1, theme.gridline, 0.1);
      for (let x = 0; x <= W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.strokePath(); }
      for (let y = 0; y <= H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.strokePath(); }
      // (IntroScene lays a cream wash over every backdrop for menu-text contrast)
    },
  });
})();
