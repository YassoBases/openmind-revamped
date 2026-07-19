/**
 * Scene Play — Wonder World, the generatable living-scene learning shell.
 *
 * Hosts the four OpenMind primary templates the AI fills with pure JSON:
 *   rotation_transform — turn an object until it matches the target pose
 *   cause_effect       — set a variable, run the experiment, watch the outcome
 *   find_fix           — spot the mistake in a living scene, then fix it
 *   create_express     — open creation, celebrated and NEVER scored
 *
 * Every educational level runs the six-beat flow observe → try → notice →
 * explain → practice → checkpoint while the session climbs the ladder
 * recognize → understand → apply → challenge. Evaluation is 100%
 * programmatic against the spec's canonical data; the interest kit (nature /
 * construction / space / cars / ocean, via SceneKit) re-skins scenery,
 * ambient life, Hudhud's flavor lines and the success moment, and can never
 * touch items, verification, difficulty or evidence.
 */
(function () {
  'use strict';

  const W = 720;
  const H = 1280;
  const P = EduCore.PALETTE;

  // Beat chips (canonical UI copy — NOT kit content).
  const BEAT_CHIP = {
    try: { en: 'TRY IT!', ar: 'جرّب!' },
    practice: { en: 'PRACTICE', ar: 'تدرّب' },
    checkpoint: { en: 'SHOW WHAT YOU KNOW!', ar: 'لنتأكد!' },
  };

  // Mechanic UI strings (canonical, minimal — the brief says few words).
  const UI = {
    check: { en: 'DOES IT FIT?', ar: 'هل يطابق؟' },
    tryIt: { en: 'TRY IT!', ar: 'جرّب!' },
    finish: { en: 'FINISH!', ar: 'انتهيت!' },
    target: { en: 'Match this', ar: 'طابق هذا' },
    fixWith: { en: 'Fix it with…', ar: 'أصلحه بماذا؟' },
  };
  const ui = (key) => UI[key][EduCore.lang] || UI[key].en;

  const TUTORIAL = {
    en: {
      intro: 'Welcome to Wonder World! Here you learn with your hands — touch, turn, try.',
      prompt: 'Turn the kite until it stands up!',
      done: 'Beautiful! Look, try, discover. Off we go!',
    },
    ar: {
      intro: 'أهلًا بك في عالم العجائب! هنا نتعلم بأيدينا — المس وجرّب.',
      prompt: 'أدر الطائرة الورقية حتى تقف مستقيمة!',
      done: 'رائع! انظر، جرّب، اكتشف. هيا بنا!',
    },
  };

  // Fallback showcase visuals for the observe beat, per kit.
  const SHOWCASE_KEYS = {
    nature: ['bird', 'tree', 'flower', 'sun'],
    construction: ['brick', 'wall', 'wheel', 'house'],
    space: ['rocket', 'planet', 'star', 'moon'],
    cars: ['car', 'wheel', 'sun', 'cloud'],
    ocean: ['fish', 'boat', 'shellfish', 'drop'],
  };

  class ScenePlayScene extends EduCore.BaseGameScene {
    buildStage() {
      this.kit = SceneKit.get(EduCore.spec.meta.wrapper);
      this.hintPos = { x: EduCore.isRTL ? 70 : W - 70, y: 1226 };
      this.hintBubbleY = 1090;

      SceneKit.buildBackground(this, this.kit);
      SceneKit.spawnAmbient(this, this.kit);

      // All per-item scene objects live here — cleared between items.
      this.playLayer = this.add.container(0, 0).setDepth(5);

      // Prompt panel (warm sand card, the shared reading surface).
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
      this._lastRecovered = false;
    }

    // -------------------------------------------------- six-beat level flow
    /** observe → try → notice → explain — interaction before explanation. */
    async teachPhase(level) {
      this._plan = EduCore.engine.pickItems(level.items, 3);

      // Hudhud's kit flavor — presentation only, never learning content.
      if (level.index === 1) {
        SceneKit.say(this, this.guide, SceneKit.commentaryLine(this.kit, 'enter'));
      } else if (level.index === 2) {
        SceneKit.say(this, this.guide, SceneKit.commentaryLine(this.kit, 'firstCorrect'), { react: 'correct' });
      }

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

    /** Observe: the kit world comes alive — just watch, no task. */
    observeBeat(level) {
      return SceneKit.observeBeat(this, level, {
        flavor: this.kit.flavor,
        showcase: (c) => {
          // a soft parade of kit visuals drifting through the scene
          const keys = SHOWCASE_KEYS[this.kit.id] || SHOWCASE_KEYS.nature;
          keys.forEach((key, i) => {
            const sc = this.add.container(
              EduCore.isRTL ? W + 90 + i * 150 : -90 - i * 150, 440 + (i % 2) * 150);
            const g = this.add.graphics();
            SceneKit.drawVisual(g, key, 96);
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
            c.add(sc);
          });
        },
      });
    }

    /** Notice: name the pattern the learner just felt with their fingers. */
    noticeBeat(level) {
      return SceneKit.noticeBeat(this, level, this.guide);
    }

    // ------------------------------------------------------------ mechanics
    async presentItem(item, hintApi) {
      this.clearPlayArea();
      await this.showPrompt(item);
      let result;
      if (item.kind === 'rotation_transform') result = await this.playRotationTransform(item, hintApi);
      else if (item.kind === 'cause_effect') result = await this.playCauseEffect(item, hintApi);
      else if (item.kind === 'find_fix') result = await this.playFindFix(item, hintApi);
      else result = await this.playCreateExpress(item, hintApi);
      // completed-with-stumbles → Hudhud's warm kit line rides the next prompt
      this._lastRecovered = !!(result.completed && !result.correct && !result.expressive);
      this.clearPlayArea();
      return result;
    }

    clearPlayArea() {
      this.playLayer.removeAll(true);
      EduCore.setTappables([]);
      window.EduMindDebug.getDrag = null;
      this.setProgress(0, 0);
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
      if (this._lastRecovered) {
        this._lastRecovered = false;
        SceneKit.say(this, this.guide, SceneKit.commentaryLine(this.kit, 'recovered'), { holdMs: 2400 });
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

    /** Build one living scene object into the play layer. */
    buildObject(def, size) {
      const o = SceneKit.makeObject(this, def, size);
      this.playLayer.add(o);
      return o;
    }

    /** A rounded text chip (setting / correction options). */
    buildChip(label, width) {
      const c = this.add.container(0, 0);
      const tmp = this.add.text(0, 0, label, EduCore.textStyle(24, {
        weight: '800', color: '#19725E', align: 'center', wrap: width ? width - 30 : 200,
      })).setOrigin(0.5);
      const chipW = width || Math.max(tmp.width + 38, 110);
      const chipH = Math.max(tmp.height + 26, 64);
      const bg = this.add.graphics();
      c.drawChip = (selected) => {
        bg.clear();
        bg.fillStyle(selected ? P.teal : P.sand, 1);
        bg.fillRoundedRect(-chipW / 2, -chipH / 2, chipW, chipH, 18);
        bg.lineStyle(3, selected ? GameFeel.darken(P.teal, 0.25) : P.brown, 0.9);
        bg.strokeRoundedRect(-chipW / 2, -chipH / 2, chipW, chipH, 18);
        tmp.setColor(selected ? '#FDF2E2' : '#19725E');
      };
      c.drawChip(false);
      const glow = this.add.circle(0, 0, chipH * 0.9, EduCore.accentInt, 0);
      c.addAt(glow, 0);
      c.add([bg, tmp]);
      c.glow = glow;
      c.chipW = chipW;
      c.chipH = chipH;
      this.playLayer.add(c);
      return c;
    }

    exposeTappables(list) {
      EduCore.setTappables(list);
    }

    wrongTouch(obj) {
      this.feel.wiggle(obj, 2.6);
      GameFeel.audio.wrongTone();
      if (this.guide) this.guide.react('wrong');
    }

    /**
     * rotation_transform — recognize: turn the object with big arrow taps
     * until it matches the target ghost, then ask "does it fit?". Mental
     * rotation stays with the child: no glow ever betrays the match.
     */
    playRotationTransform(item, hintApi) {
      const fold = item.symmetryFold || 1;
      const period = 360 / fold;
      const obj = this.buildObject(item.object, 170);
      obj.setPosition(W / 2, 560);
      obj.setAngle(item.startAngle);
      SceneKit.idle(this, obj, 'breathe', 0);
      let logical = item.startAngle;

      // target ghost in a soft card — the pose to match
      const ghostX = EduCore.isRTL ? 130 : W - 130;
      const card = this.add.container(ghostX, 400);
      const cardBg = this.add.graphics();
      cardBg.fillStyle(P.sand, 0.9);
      cardBg.fillRoundedRect(-84, -84, 168, 190, 20);
      cardBg.lineStyle(3, P.brown, 0.8);
      cardBg.strokeRoundedRect(-84, -84, 168, 190, 20);
      card.add(cardBg);
      const ghost = SceneKit.makeObject(this, item.object, 110);
      ghost.setAngle(item.targetAngle);
      ghost.setAlpha(0.45);
      card.add(ghost);
      const cardLabel = this.add.text(0, 84, ui('target'),
        EduCore.textStyle(24, { weight: '700', color: '#B5702F', align: 'center' })).setOrigin(0.5, 1);
      card.add(cardLabel);
      this.playLayer.add(card);

      const matched = () => ((logical - item.targetAngle) % period + period) % period === 0;

      hintApi.onNarrow(() => SceneKit.pulse(this, ghost));

      let wrongAttempts = 0;
      return new Promise((resolve) => {
        let done = false;
        const rotate = (dir) => {
          if (done) return;
          logical += dir * item.snapAngle;
          GameFeel.audio.tick();
          EduCore.reportLearning('object_interacted', {
            itemId: item.id, kind: 'rotation_step', objectId: item.object.id,
          });
          this.tweens.add({
            targets: obj, angle: logical, duration: 240, ease: 'Cubic.easeOut',
            onComplete: () => { this.feel.squash(obj, 0.08, 120); refresh(); },
          });
          refresh();
        };
        const ccw = GameFeel.candyButton(this, W / 2 - 150, 900, 128, 92, '↺', {
          color: P.teal, fontSize: 40, onTap: () => rotate(-1),
        });
        const cw = GameFeel.candyButton(this, W / 2 + 150, 900, 128, 92, '↻', {
          color: P.teal, fontSize: 40, onTap: () => rotate(1),
        });
        const check = GameFeel.candyButton(this, W / 2, 1030, 300, 88, ui('check'), {
          color: P.orange, arabic: EduCore.isRTL, fontSize: 28,
          onTap: () => {
            if (done) return;
            EduCore.reportLearning('object_interacted', {
              itemId: item.id, kind: 'rotation_check', objectId: item.object.id,
            });
            if (matched()) {
              done = true;
              EduCore.setTappables([]);
              this.feel.sparkle(obj.x, obj.y, EduCore.accentInt, 10);
              this.feel.squash(obj, 0.22, 220);
              GameFeel.audio.correctChain(1);
              SceneKit.pulse(this, ghost);
              this.time.delayedCall(420, () =>
                resolve({ correct: wrongAttempts === 0, final: true, completed: true }));
            } else {
              wrongAttempts++;
              this.wrongTouch(obj);
            }
          },
        });
        [ccw, cw, check].forEach((b) => this.playLayer.add(b));

        const refresh = () => {
          const m = matched();
          this.exposeTappables([
            { id: 'check', label: 'check', x: check.x, y: check.y, w: 300, h: 88, correct: m },
            { id: 'cw', label: 'rotate', x: cw.x, y: cw.y, w: 128, h: 92, correct: !m },
            { id: 'ccw', label: 'rotate back', x: ccw.x, y: ccw.y, w: 128, h: 92, correct: false },
          ]);
        };
        refresh();
      });
    }

    /**
     * cause_effect — understand: pick a setting, pull the lever, WATCH what
     * happens. A non-goal outcome is information, not failure — the learner
     * re-sets and runs again. Learning by experiment.
     */
    playCauseEffect(item, hintApi) {
      // variable label
      const varLabel = this.add.text(W / 2, 330, item.variable.label,
        EduCore.textStyle(26, { weight: '800', color: '#079A90', align: 'center' })).setOrigin(0.5);
      this.playLayer.add(varLabel);

      // outcome stage
      const stage = this.add.container(W / 2, 540);
      const stageBg = this.add.graphics();
      stageBg.fillStyle(P.sand, 0.85);
      stageBg.fillRoundedRect(-240, -150, 480, 300, 24);
      stageBg.lineStyle(3, P.brown, 0.7);
      stageBg.strokeRoundedRect(-240, -150, 480, 300, 24);
      stage.add(stageBg);
      this.playLayer.add(stage);
      let vignette = null;

      const outcomeOf = (settingId) => {
        const m = item.mapping.find((mp) => mp.settingId === settingId);
        return m ? item.outcomes.find((o) => o.id === m.outcomeId) : null;
      };
      const winsGoal = (settingId) => {
        const out = outcomeOf(settingId);
        return !!out && out.id === item.goalOutcomeId;
      };

      // setting chips
      let selected = null;
      const n = item.variable.settings.length;
      const chipW = Math.min(200, (W - 80) / n);
      const startX = W / 2 - ((n - 1) * chipW) / 2;
      const chips = item.variable.settings.map((s, i) => {
        const cx = EduCore.isRTL ? W - (startX + i * chipW) : startX + i * chipW;
        const chip = this.buildChip(s.label, Math.min(chipW - 12, 190));
        chip.setPosition(cx, 810);
        chip.def = s;
        SceneKit.idle(this, chip, 'breathe', i);
        return chip;
      });

      hintApi.onNarrow(() => {
        const winner = chips.find((c) => winsGoal(c.def.id));
        if (winner) SceneKit.pulse(this, winner);
      });

      let wrongAttempts = 0;
      return new Promise((resolve) => {
        let running = false;
        let done = false;

        const refresh = () => {
          // `correct` always marks the action that PROGRESSES: an unselected
          // winning chip first, then the lever once the winner is selected.
          const list = chips.map((c) => ({
            id: c.def.id, label: c.def.label, x: c.x, y: c.y, w: c.chipW, h: c.chipH,
            correct: winsGoal(c.def.id) && selected !== c,
          }));
          list.push({
            id: 'run', label: 'try it', x: lever.x, y: lever.y, w: 300, h: 88,
            correct: !!selected && winsGoal(selected.def.id),
          });
          this.exposeTappables(list);
        };

        const runExperiment = () => {
          if (done || running || !selected) return;
          running = true;
          this.feel.squash(lever, 0.2, 200);
          GameFeel.audio.pop();
          EduCore.reportLearning('object_interacted', {
            itemId: item.id, kind: 'experiment_run', objectId: selected.def.id,
          });
          const out = outcomeOf(selected.def.id);
          if (vignette) { vignette.destroy(); vignette = null; }
          vignette = this.add.container(0, -16);
          const vg = this.add.graphics();
          const key = SceneKit.visualFor(out.label);
          if (key) SceneKit.drawVisual(vg, key, 130);
          vignette.add(vg);
          const outText = this.add.text(0, 96, out.label,
            EduCore.textStyle(24, { weight: '700', color: '#19725E', align: 'center', wrap: 420 })).setOrigin(0.5);
          vignette.add(outText);
          stage.add(vignette);
          vignette.setScale(0.4).setAlpha(0);
          this.tweens.add({
            targets: vignette, scale: 1, alpha: 1, duration: 460, ease: 'Back.easeOut',
            onComplete: () => {
              if (out.id === item.goalOutcomeId) {
                done = true;
                this.feel.sparkle(stage.x, stage.y - 20, EduCore.accentInt, 10);
                GameFeel.audio.correctChain(1);
                this.time.delayedCall(640, () =>
                  resolve({ correct: wrongAttempts === 0, final: true, completed: true }));
              } else {
                wrongAttempts++;
                GameFeel.audio.wrongTone();
                if (this.guide) this.guide.react('wrong');
                this.tweens.add({ targets: vignette, alpha: 0.35, delay: 1100, duration: 400 });
                running = false;
                refresh();
              }
            },
          });
        };

        const lever = GameFeel.candyButton(this, W / 2, 1030, 300, 88, ui('tryIt'), {
          color: P.orange, arabic: EduCore.isRTL, fontSize: 28, onTap: runExperiment,
        });
        this.playLayer.add(lever);

        for (const chip of chips) {
          Interact.makeTappable(this, chip, {
            w: chip.chipW, h: chip.chipH,
            onTap: () => {
              if (done || running) return;
              selected = chip;
              for (const c of chips) c.drawChip(c === chip);
              this.feel.squash(chip, 0.14, 160);
              EduCore.reportLearning('object_interacted', {
                itemId: item.id, kind: 'experiment_setting', objectId: chip.def.id,
              });
              refresh();
            },
          });
        }
        SceneKit.armLater(this, chips);
        refresh();
      });
    }

    /**
     * find_fix — apply/challenge: something in the scene is wrong. Tap the
     * mistake (diagnosis), then choose the right correction (repair). The
     * scene heals with a satisfying morph.
     */
    playFindFix(item, hintApi) {
      const positions = SceneKit.scatterPositions(item.objects.length, { x: 90, y: 340, w: W - 180, h: 380 });
      const objs = item.objects.map((def, i) => {
        const o = this.buildObject(def, 112);
        o.setPosition(positions[i].x, positions[i].y);
        SceneKit.idle(this, o, i % 2 === 0 ? 'sway' : 'breathe', i);
        return o;
      });
      const mistakes = objs.filter((o) => o.def.mistake);
      let fixedCount = 0;
      let wrongAttempts = 0;
      this.setProgress(0, mistakes.length);

      let tray = null;
      let active = null;
      let ring = null;

      hintApi.onNarrow(() => {
        if (active) {
          // narrow inside the tray: pulse the right correction
          if (tray) {
            const target = tray.chips.find((c) => c.def.id === active.def.correctionId);
            if (target) SceneKit.pulse(this, target);
          }
        } else {
          for (const o of mistakes) {
            if (!o.done) SceneKit.pulse(this, o);
          }
        }
      });

      return new Promise((resolve) => {
        const refresh = () => {
          if (active && tray) {
            this.exposeTappables(tray.chips.map((c) => ({
              id: c.def.id, label: c.def.label, x: c.x + tray.x, y: c.y + tray.y, w: c.chipW, h: c.chipH,
              correct: c.def.id === active.def.correctionId,
            })));
          } else {
            this.exposeTappables(objs.filter((o) => !o.done).map((o) => ({
              id: o.def.id, label: o.def.label, x: o.x, y: o.y, w: 120, h: 120,
              correct: !!o.def.mistake,
            })));
          }
        };

        const closeTray = () => {
          if (tray) { tray.destroy(); tray = null; }
          if (ring) { ring.destroy(); ring = null; }
          active = null;
        };

        const openTray = (o) => {
          closeTray();
          active = o;
          ring = this.add.circle(o.x, o.y, 78, EduCore.accentInt, 0);
          ring.setStrokeStyle(5, EduCore.accentInt, 0.9);
          this.playLayer.add(ring);
          this.tweens.add({ targets: ring, scale: { from: 0.6, to: 1 }, duration: 300, ease: 'Back.easeOut' });

          tray = this.add.container(0, 0);
          const panel = this.add.graphics();
          panel.fillStyle(P.peach, 0.97);
          panel.fillRoundedRect(30, 870, W - 60, 210, 24);
          panel.lineStyle(3, P.brown, 0.8);
          panel.strokeRoundedRect(30, 870, W - 60, 210, 24);
          tray.add(panel);
          const title = this.add.text(W / 2, 900, ui('fixWith'),
            EduCore.textStyle(24, { weight: '800', color: '#B5702F', align: 'center' })).setOrigin(0.5);
          tray.add(title);

          const k = item.corrections.length;
          const cw = Math.min(200, (W - 100) / k);
          const sx = W / 2 - ((k - 1) * cw) / 2;
          tray.chips = item.corrections.map((corr, i) => {
            const cx = EduCore.isRTL ? W - (sx + i * cw) : sx + i * cw;
            const chip = this.buildChip(corr.label, Math.min(cw - 10, 190));
            chip.setPosition(cx, 1000);
            chip.def = corr;
            tray.add(chip);
            Interact.makeTappable(this, chip, {
              w: chip.chipW, h: chip.chipH,
              onTap: () => {
                if (!active) return;
                EduCore.reportLearning('object_interacted', {
                  itemId: item.id, kind: 'fix_correction', objectId: corr.id,
                });
                if (corr.id === active.def.correctionId) {
                  const spot = { x: active.x, y: active.y };
                  active.done = true;
                  fixedCount++;
                  this.setProgress(fixedCount, mistakes.length);
                  // the mistake morphs into its fix — the scene heals
                  const fixedObj = this.buildObject({ id: corr.id + '_fixed', label: corr.label }, 112);
                  fixedObj.setPosition(spot.x, spot.y);
                  fixedObj.setScale(0.3).setAlpha(0);
                  const old = active;
                  this.tweens.add({ targets: old, scale: 0.2, alpha: 0, duration: 260, ease: 'Cubic.easeIn' });
                  this.tweens.add({
                    targets: fixedObj, scale: 1, alpha: 1, duration: 380, ease: 'Back.easeOut', delay: 180,
                  });
                  SceneKit.idle(this, fixedObj, 'breathe', fixedCount);
                  this.feel.sparkle(spot.x, spot.y, EduCore.accentInt, 10);
                  GameFeel.audio.correctChain(fixedCount);
                  closeTray();
                  if (fixedCount >= mistakes.length) {
                    // scene healed: disarm everything so a stray tap in the
                    // celebration window can never count as a wrong attempt
                    EduCore.setTappables([]);
                    for (const o of objs) o.tapDisabled = true;
                    this.time.delayedCall(480, () =>
                      resolve({ correct: wrongAttempts === 0, final: true, completed: true }));
                  } else {
                    refresh();
                  }
                } else {
                  wrongAttempts++;
                  this.wrongTouch(chip);
                }
              },
            });
            return chip;
          });
          this.playLayer.add(tray);
          tray.setAlpha(0);
          this.tweens.add({ targets: tray, alpha: 1, duration: 220 });
          SceneKit.armLater(this, tray.chips);
          refresh();
        };

        SceneKit.armLater(this, objs);
        for (const o of objs) {
          Interact.makeTappable(this, o, {
            w: 120, h: 120,
            onTap: () => {
              if (o.done || active) return;
              EduCore.reportLearning('object_interacted', {
                itemId: item.id, kind: 'scene_object', objectId: o.def.id,
              });
              if (o.def.mistake) {
                GameFeel.audio.blip();
                this.feel.squash(o, 0.18, 200);
                openTray(o);
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

    /**
     * create_express — challenge: open creation with soft goals. Stamp kit
     * elements onto the canvas, arrange freely, FINISH when proud. Celebrated
     * and NEVER scored — the engine's expressive path bypasses accuracy.
     */
    playCreateExpress(item, hintApi) {
      // the canvas
      const canvas = this.add.container(0, 0);
      const cbg = this.add.graphics();
      cbg.fillStyle(P.cream, 0.94);
      cbg.fillRoundedRect(50, 320, W - 100, 430, 26);
      cbg.lineStyle(4, EduCore.accentInt, 0.8);
      cbg.strokeRoundedRect(50, 320, W - 100, 430, 26);
      canvas.add(cbg);
      this.playLayer.add(canvas);

      const placed = []; // { el, def }
      const mustLeft = () => item.mustInclude.filter(
        (id) => !placed.some((p) => p.def.id === id));
      const satisfied = () => placed.length >= item.minElements && mustLeft().length === 0;

      // palette tray
      const k = item.palette.length;
      const cw = Math.min(150, (W - 80) / k);
      const sx = W / 2 - ((k - 1) * cw) / 2;
      const paletteObjs = item.palette.map((el, i) => {
        const cx = EduCore.isRTL ? W - (sx + i * cw) : sx + i * cw;
        const o = this.buildObject(el, 78);
        o.setPosition(cx, 850);
        SceneKit.idle(this, o, 'breathe', i);
        if (item.mustInclude.includes(el.id)) o.glow.setAlpha(0.28); // gentle ask
        return o;
      });

      hintApi.onNarrow(() => {
        const wanted = mustLeft();
        for (const o of paletteObjs) {
          if (wanted.includes(o.def.id)) SceneKit.pulse(this, o);
        }
      });

      // grid cells inside the canvas for stamping (4 x 3, jittered)
      const cells = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          cells.push({
            x: 50 + ((col + 0.5) / 4) * (W - 100),
            y: 320 + ((row + 0.5) / 3) * 430,
          });
        }
      }
      let cellIdx = 0;

      return new Promise((resolve) => {
        let done = false;

        const refresh = () => {
          const ok = satisfied();
          finish.setEnabled(ok);
          this.setProgress(Math.min(placed.length, item.minElements), item.minElements);
          const wanted = mustLeft();
          const list = paletteObjs.map((o) => ({
            id: o.def.id, label: o.def.label, x: o.x, y: o.y, w: 92, h: 92,
            correct: !ok && (wanted.length ? wanted.includes(o.def.id) : true),
          }));
          list.push({
            id: 'finish', label: 'finish', x: finish.x, y: finish.y, w: 300, h: 88, correct: ok,
          });
          this.exposeTappables(list);
        };

        const stamp = (def) => {
          if (done) return;
          const cell = cells[cellIdx % cells.length];
          cellIdx++;
          const el = this.buildObject(def, 96);
          el.setPosition(cell.x + (Math.random() * 26 - 13), cell.y + (Math.random() * 20 - 10));
          el.setScale(0.3).setAlpha(0);
          this.tweens.add({ targets: el, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
          SceneKit.idle(this, el, 'sway', cellIdx);
          GameFeel.audio.pop();
          this.feel.sparkle(el.x, el.y, EduCore.accentInt, 5);
          const entry = { el, def };
          placed.push(entry);
          EduCore.reportLearning('object_interacted', {
            itemId: item.id, kind: 'create_stamp', objectId: def.id,
          });
          // tap a placed element to remove it (change your mind freely)
          Interact.makeTappable(this, el, {
            w: 100, h: 100,
            onTap: () => {
              if (done) return;
              const idx = placed.indexOf(entry);
              if (idx >= 0) placed.splice(idx, 1);
              GameFeel.audio.blip();
              this.tweens.add({
                targets: el, scale: 0.2, alpha: 0, duration: 220, ease: 'Cubic.easeIn',
                onComplete: () => el.destroy(),
              });
              refresh();
            },
          });
          refresh();
        };

        const finish = GameFeel.candyButton(this, W / 2, 1030, 300, 88, ui('finish'), {
          color: P.green, arabic: EduCore.isRTL, fontSize: 28,
          onTap: () => {
            if (done || !satisfied()) return;
            done = true;
            SceneKit.celebrate(this, W / 2, 520, this.kit, 14);
            GameFeel.audio.celebration();
            if (this.guide) this.guide.react('correct');
            SceneKit.say(this, this.guide, SceneKit.commentaryLine(this.kit, 'createDone'), { react: 'correct' });
            this.time.delayedCall(900, () =>
              resolve({ expressive: true, final: true, completed: true }));
          },
        });
        this.playLayer.add(finish);
        finish.setEnabled(false);

        for (const o of paletteObjs) {
          Interact.makeTappable(this, o, {
            w: 92, h: 92,
            onTap: () => { if (!done) stamp(o.def); },
          });
        }
        SceneKit.armLater(this, paletteObjs);
        refresh();
      });
    }

    // ------------------------------------------------------------- tutorial
    async runTutorial() {
      const T = TUTORIAL[EduCore.lang] || TUTORIAL.en;
      await this.tutorialSay(T.intro);

      // one guided rotation: turn the kite upright (auto-resolves on match —
      // the tutorial teaches the gesture, not the judgement)
      const def = { id: 'tut_kite', label: EduCore.lang === 'ar' ? 'طائرة ورقية' : 'kite' };
      const obj = SceneKit.makeObject(this, def, 170);
      obj.setPosition(W / 2, 560);
      obj.setAngle(90);
      this.playLayer.add(obj);
      SceneKit.idle(this, obj, 'breathe', 0);

      const ghost = SceneKit.makeObject(this, def, 110);
      ghost.setPosition(EduCore.isRTL ? 130 : W - 130, 420);
      ghost.setAlpha(0.45);
      this.playLayer.add(ghost);
      SceneKit.pulse(this, ghost);

      this.promptText.setText(T.prompt);
      this.tweens.add({ targets: this.promptPanel, alpha: 1, duration: 200 });

      let logical = 90;
      await new Promise((resolve) => {
        let solved = false;
        const btn = GameFeel.candyButton(this, W / 2, 940, 148, 100, '↻', {
          color: P.teal, fontSize: 44,
          onTap: () => {
            if (solved) return;
            logical += 90;
            GameFeel.audio.tick();
            EduCore.reportLearning('object_interacted', {
              itemId: 'tutorial', kind: 'rotation_step', objectId: def.id,
            });
            this.tweens.add({
              targets: obj, angle: logical, duration: 240, ease: 'Cubic.easeOut',
              onComplete: () => {
                if (!solved && logical % 360 === 0) {
                  solved = true;
                  EduCore.setTappables([]);
                  this.feel.confetti(obj.x, obj.y, this.kit.confetti, 12);
                  GameFeel.audio.correctChain(1);
                  resolve();
                }
              },
            });
          },
        });
        this.playLayer.add(btn);
        EduCore.setTappables([
          { id: 'rotate', label: 'rotate', x: btn.x, y: btn.y, w: 148, h: 100, correct: true },
        ]);
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

  EduCore.boot(window.__EDUMIND_SPEC__, {
    gameType: 'scene_play',
    createGameScene: () => ScenePlayScene,
    buildMenuBackdrop(scene) {
      const kit = SceneKit.get(EduCore.spec.meta.wrapper);
      const g = scene.add.graphics();
      g.fillStyle(kit.skyTop, 1);
      g.fillRect(0, 0, W, H * 0.5);
      g.fillStyle(kit.skyBottom, 1);
      g.fillRect(0, H * 0.5, W, H * 0.5);
      kit.horizon(g);
      g.fillStyle(kit.ground, 0.9);
      g.fillRect(0, 950, W, H - 950);
      // (IntroScene lays a cream wash over every backdrop for menu-text contrast)
    },
  });
})();
