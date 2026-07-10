/**
 * Goal Shootout — sports target-practice shell.
 *
 * Question at the top; the student taps one of 4 goals/targets to "shoot"
 * the answer. The ball arcs with rotation + scale; the keeper guards wrong
 * answers (idle / dive-left / dive-right), nets ripple, the crowd does a
 * Mexican wave and cheers on goals, and the ball resets with a fat bounce.
 *
 * Themes: football, basketball, hockey, archery — all procedural Graphics.
 */
(function () {
  'use strict';

  const W = 720;
  const H = 1280;

  // Daylight venues on the warm OpenMind palette — light skies, calm greens.
  const THEMES = {
    football: {
      sky: 0xceebf0, field: 0x84a253, stripe: 0x90ac64, frame: 0xf2f6f8,
      ball: 'football', keeper: 0xef9722,
    },
    basketball: {
      sky: 0xfadbb0, field: 0xb5702f, stripe: 0xbd7e42, frame: 0xef9722,
      ball: 'basketball', keeper: 0x079a90,
    },
    hockey: {
      sky: 0xceebf0, field: 0xf4fafc, stripe: 0xe2eff4, frame: 0xd93b5e,
      ball: 'puck', keeper: 0x079a90,
    },
    archery: {
      sky: 0xceebf0, field: 0x84a253, stripe: 0x90ac64, frame: 0xb5702f,
      ball: 'arrow', keeper: 0xfae9d0,
    },
  };

  const TUTORIAL = {
    en: {
      coach: 'Coach here! Tap a goal to shoot. The keeper blocks wrong answers — aim true!',
      q1: 'Warm-up shot: hit the goal marked ✓',
      good: '✓',
      bad: '✗',
      q2: 'Great! Now find the ⭐ among four goals.',
      star: '⭐',
      blank: '•',
      wrongDemo: 'Saved! Wrong answers get blocked — but the ball always comes back. Try the ✓!',
    },
    ar: {
      coach: 'أنا المدرب! اضغط على المرمى لتسدد. الحارس يصد الإجابات الخاطئة — صوّب جيدًا!',
      q1: 'تسديدة إحماء: أصب المرمى الذي عليه ✓',
      good: '✓',
      bad: '✗',
      q2: 'رائع! الآن جد ⭐ بين أربعة مرامٍ.',
      star: '⭐',
      blank: '•',
      wrongDemo: 'تصدّى لها! الإجابات الخاطئة تُصد — لكن الكرة تعود دائمًا. جرّب ✓!',
    },
  };

  const GOAL_POS = [
    { x: 185, y: 472 }, { x: 535, y: 472 },
    { x: 185, y: 768 }, { x: 535, y: 768 },
  ];
  const KEEPER_HOME = { x: 360, y: 620 };
  const BALL_HOME = { x: 360, y: 1140 };

  class GoalShootoutScene extends EduCore.BaseGameScene {
    buildStage() {
      const theme = THEMES[EduCore.spec.meta.theme] || THEMES.football;
      this.theme = theme;
      this.hintPos = { x: EduCore.isRTL ? 70 : W - 70, y: 1216 };
      this.hintBubbleY = 1020;

      // pitch / court / rink
      const g = this.add.graphics().setDepth(0);
      g.fillStyle(theme.sky, 1);
      g.fillRect(0, 0, W, 240);
      g.fillStyle(theme.field, 1);
      g.fillRect(0, 240, W, H - 240);
      for (let i = 0; i < 5; i++) {
        g.fillStyle(theme.stripe, 1);
        g.fillRect(0, 300 + i * 190, W, 90);
      }
      // center circle flavor
      g.lineStyle(4, 0xffffff, 0.18);
      g.strokeCircle(W / 2, 980, 130);

      this.buildCrowd();
      this.buildScoreboard();

      // goals are (re)built per question
      this.goalLayer = this.add.container(0, 0).setDepth(5);
      this.keeper = this.buildKeeper(theme);
      this.ball = this.buildBall(theme);

      // prompt panel (hidden until it has something to say)
      this.promptPanel = GameFeel.cardPanel(this, W / 2, 305, 664, 130, {
        color: 0xfae9d0, alpha: 0.95, stroke: 0xdccdb7, strokeWidth: 3,
      }).setDepth(8).setAlpha(0);
      this.promptText = this.add.text(W / 2, 305, '',
        EduCore.textStyle(28, { color: '#19725E', align: 'center', wrap: 600, lineSpacing: 6 }))
        .setOrigin(0.5).setDepth(9);
      this.setPrompt = (text) => {
        this.promptText.setText(text);
        this.tweens.add({ targets: this.promptPanel, alpha: text ? 1 : 0, duration: 220 });
      };

      // mascot coach in the corner
      this.guide = new Hoopoe(this, EduCore.isRTL ? W - 80 : 80, 1130, {
        accent: EduCore.accentInt, scale: 0.62,
      });
      this.guide.setDepth(7);

      GameFeel.audio.crowdStart();
      this.events.once('shutdown', () => GameFeel.audio.crowdStop());

      this.teachStyle = { panelColor: 0xe9f0da }; // grassy-light coach talk
    }

    buildCrowd() {
      // 3 rows x 14 dots doing a Mexican wave (pure tween choreography).
      this.crowd = this.add.container(0, 0).setDepth(1);
      const rowColors = [0xe8a3a3, 0xa3c6e8, 0xe8d9a3];
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 14; i++) {
          const x = 28 + i * 51;
          const y = 56 + r * 42;
          const head = this.add.circle(x, y, 13, rowColors[(r + i) % 3], 0.95);
          this.crowd.add(head);
          this.tweens.add({
            targets: head,
            y: y - 12,
            duration: 260,
            yoyo: true,
            repeat: -1,
            repeatDelay: 2400,
            delay: i * 90 + r * 50,
            ease: 'Sine.easeOut',
          });
        }
      }
      // occasional camera flashes in the stands
      this.flashDot = this.add.circle(0, 0, 5, 0xffffff, 0).setDepth(2);
      this.time.addEvent({
        delay: 2800,
        loop: true,
        callback: () => {
          this.flashDot.setPosition(30 + Math.random() * 660, 40 + Math.random() * 100);
          this.flashDot.setAlpha(0.95).setScale(0.5);
          this.tweens.add({ targets: this.flashDot, alpha: 0, scale: 2.2, duration: 90 }); // ≤100ms
        },
      });
    }

    buildScoreboard() {
      this.scoreVal = 0;
      const c = this.add.container(W / 2, 196).setDepth(3);
      const bg = this.add.graphics();
      bg.fillStyle(0x19725e, 0.96);
      bg.fillRoundedRect(-130, -30, 260, 60, 16);
      bg.lineStyle(3, 0x4c9181, 1);
      bg.strokeRoundedRect(-130, -30, 260, 60, 16);
      this.scoreText = this.add.text(0, 0, '0', EduCore.textStyle(32, {
        weight: '800', color: '#FDF2E2', align: 'center',
      })).setOrigin(0.5);
      // shimmer sweep
      const shine = this.add.rectangle(-130, 0, 26, 60, 0xffffff, 0.1);
      c.add([bg, this.scoreText, shine]);
      this.tweens.add({
        targets: shine, x: 130, duration: 1900, repeat: -1, repeatDelay: 1300, ease: 'Sine.easeInOut',
      });
      this.scoreboard = c;
    }

    buildKeeper(theme) {
      const c = this.add.container(KEEPER_HOME.x, KEEPER_HOME.y).setDepth(6);
      const g = this.add.graphics();
      if (EduCore.spec.meta.theme === 'archery') {
        // drifting shield instead of a person
        g.fillStyle(theme.keeper, 1);
        g.fillRoundedRect(-34, -44, 68, 88, 22);
        g.lineStyle(4, GameFeel.darken(theme.keeper, 0.3), 1);
        g.strokeRoundedRect(-34, -44, 68, 88, 22);
        g.fillStyle(GameFeel.darken(theme.keeper, 0.3), 1);
        g.fillCircle(0, 0, 10);
      } else {
        // jersey
        g.fillStyle(theme.keeper, 1);
        g.fillRoundedRect(-26, -18, 52, 54, 14);
        // head
        g.fillStyle(0xffe3c2, 1);
        g.fillCircle(0, -36, 16);
        g.fillStyle(0x35261c, 1);
        g.fillCircle(-5, -38, 2.4);
        g.fillCircle(5, -38, 2.4);
        // gloves
        g.fillStyle(0xffffff, 1);
        g.fillCircle(-32, 6, 9);
        g.fillCircle(32, 6, 9);
        // legs
        g.fillStyle(0x19725e, 1);
        g.fillRoundedRect(-18, 34, 14, 22, 5);
        g.fillRoundedRect(4, 34, 14, 22, 5);
      }
      c.add(g);
      // idle sway — keeper is never still
      this.keeperSway = this.tweens.add({
        targets: c, x: { from: KEEPER_HOME.x - 26, to: KEEPER_HOME.x + 26 },
        duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      return c;
    }

    buildBall(theme) {
      const c = this.add.container(BALL_HOME.x, BALL_HOME.y).setDepth(7);
      const g = this.add.graphics();
      const kind = theme.ball;
      if (kind === 'football') {
        g.fillStyle(0xffffff, 1);
        g.fillCircle(0, 0, 30);
        g.fillStyle(0x19725e, 1);
        g.fillCircle(0, 0, 10);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          g.fillCircle(Math.cos(a) * 22, Math.sin(a) * 22, 6);
        }
      } else if (kind === 'basketball') {
        g.fillStyle(0xff8c42, 1);
        g.fillCircle(0, 0, 30);
        g.lineStyle(3, 0x9c4a18, 1);
        g.strokeCircle(0, 0, 30);
        g.beginPath(); g.moveTo(-30, 0); g.lineTo(30, 0); g.strokePath();
        g.beginPath(); g.moveTo(0, -30); g.lineTo(0, 30); g.strokePath();
        g.beginPath(); g.arc(-30, 0, 30, -Math.PI / 3, Math.PI / 3); g.strokePath();
      } else if (kind === 'puck') {
        g.fillStyle(0x19725e, 1);
        g.fillEllipse(0, 6, 56, 22);
        g.fillRect(-28, -8, 56, 14);
        g.fillEllipse(0, -8, 56, 22);
        g.fillStyle(0x30806e, 1);
        g.fillEllipse(0, -8, 44, 14);
      } else { // arrow
        g.fillStyle(0x8a6d4b, 1);
        g.fillRect(-4, -34, 8, 58);
        g.fillStyle(0xc9c9c9, 1);
        g.fillTriangle(-10, -34, 10, -34, 0, -54);
        g.fillStyle(0xe05c5c, 1);
        g.fillTriangle(-10, 24, 0, 12, 0, 30);
        g.fillTriangle(10, 24, 0, 12, 0, 30);
      }
      c.add(g);
      // breathing idle (anticipation: the ball is alive, waiting)
      this.ballIdle = this.tweens.add({
        targets: c, scaleX: 1.04, scaleY: 0.97, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      return c;
    }

    /** One goal/target cell with an answer label card. */
    buildGoal(i, label, opts) {
      const pos = GOAL_POS[i];
      const theme = this.theme;
      const themeKey = EduCore.spec.meta.theme;
      const c = this.add.container(pos.x, pos.y);
      const g = this.add.graphics();

      if (themeKey === 'football' || themeKey === 'hockey') {
        // goal mouth + net grid
        g.fillStyle(0x19725e, 0.25);
        g.fillRect(-120, -70, 240, 124);
        g.lineStyle(3, 0xffffff, 0.25);
        for (let nx = -120; nx <= 120; nx += 24) {
          g.beginPath(); g.moveTo(nx, -70); g.lineTo(nx, 54); g.strokePath();
        }
        for (let ny = -70; ny <= 54; ny += 24) {
          g.beginPath(); g.moveTo(-120, ny); g.lineTo(120, ny); g.strokePath();
        }
        g.lineStyle(9, theme.frame, 1);
        g.strokeRoundedRect(-124, -74, 248, 132, 8);
      } else if (themeKey === 'basketball') {
        // backboard + hoop
        g.fillStyle(0xf2f6f8, 0.9);
        g.fillRoundedRect(-86, -74, 172, 100, 10);
        g.lineStyle(5, theme.frame, 1);
        g.strokeRect(-30, -52, 60, 44);
        g.lineStyle(8, theme.frame, 1);
        g.strokeEllipse(0, 32, 92, 26);
        g.lineStyle(2, 0xffffff, 0.5);
        for (let k = -3; k <= 3; k++) {
          g.beginPath(); g.moveTo(k * 13, 40); g.lineTo(k * 9, 70); g.strokePath();
        }
      } else { // archery
        const rings = [[0xf2f6f8, 56], [0x079a90, 44], [0xd93b5e, 30], [0xef9722, 16]];
        rings.forEach(([col, r]) => {
          g.fillStyle(col, 1);
          g.fillCircle(0, -10, r);
        });
      }

      // label card (candy style, teal = tappable)
      const cardW = 286, cardH = 76;
      const card = this.add.graphics();
      card.fillStyle(GameFeel.darken(0x079a90, 0.3), 1);
      card.fillRoundedRect(-cardW / 2, 66 + 5, cardW, cardH, 16);
      card.fillStyle(0x079a90, 1);
      card.fillRoundedRect(-cardW / 2, 66, cardW, cardH, 16);
      const txt = this.add.text(0, 66 + cardH / 2, label,
        EduCore.textStyle(EduCore.isRTL ? 28 : 24, {
          weight: '800', color: '#FFFFFF', align: 'center', wrap: cardW - 28,
        })).setOrigin(0.5);

      c.add([g, card, txt]);
      c.setSize(300, 250);
      c.setInteractive({ useHandCursor: true });
      c.goalIndex = i;
      c.card = card;
      c.labelText = txt;
      c.netG = g;
      c.on('pointerdown', () => this.feel.wiggle(c, 1));
      if (opts && opts.onTap) {
        c.on('pointerup', () => { if (!c.disabled) opts.onTap(i); });
      }
      this.goalLayer.add(c);
      return c;
    }

    clearGoals() {
      this.goalLayer.removeAll(true);
      this.goals = [];
    }

    // ----------------------------------------------------------- shooting
    /** Ball arcs to the goal with rotation + scale; resolves at impact. */
    shootBall(target) {
      return new Promise((resolve) => {
        this.ballIdle.pause();
        const sx = BALL_HOME.x, sy = BALL_HOME.y;
        const tx = target.x, ty = target.y - 8;
        // anticipation: lean back before launch (follow-through later)
        this.tweens.add({
          targets: this.ball, y: sy + 16, scaleX: 1.12, scaleY: 0.86, duration: 110, ease: 'Cubic.easeOut',
          onComplete: () => {
            GameFeel.audio.pop();
            this.tweens.addCounter({
              from: 0, to: 1, duration: 520, ease: 'Sine.easeIn',
              onUpdate: (tw) => {
                const t = tw.getValue();
                const x = sx + (tx - sx) * t;
                const arc = -220 * 4 * t * (1 - t); // parabola peak ~220px
                const y = sy + (ty - sy) * t + arc;
                this.ball.setPosition(x, y);
                this.ball.setRotation(t * Math.PI * 3);
                const s = 1 - 0.45 * t;
                this.ball.setScale(s);
              },
              onComplete: resolve,
            });
          },
        });
      });
    }

    /** Ball pops back to its spot with a satisfying double bounce. */
    resetBall() {
      this.ball.setRotation(0);
      this.tweens.add({
        targets: this.ball,
        x: BALL_HOME.x,
        y: BALL_HOME.y,
        scale: 1,
        duration: 420,
        ease: 'Bounce.easeOut',
        onComplete: () => {
          this.feel.squash(this.ball, 0.16, 200);
          this.ballIdle.resume();
        },
      });
    }

    keeperDive(target, save) {
      this.keeperSway.pause();
      const dx = target.x - KEEPER_HOME.x;
      const dy = target.y - KEEPER_HOME.y;
      // dive-left or dive-right toward (or away from) the shot
      const dir = save ? 1 : -1;
      const destX = KEEPER_HOME.x + dx * (save ? 0.82 : -0.6);
      const destY = KEEPER_HOME.y + dy * (save ? 0.82 : 0.25);
      this.tweens.add({
        targets: this.keeper,
        x: destX,
        y: destY,
        angle: dx * dir > 0 ? 56 : -56,
        duration: 300,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          this.time.delayedCall(460, () => {
            this.tweens.add({
              targets: this.keeper,
              x: KEEPER_HOME.x, y: KEEPER_HOME.y, angle: 0,
              duration: 420, ease: 'Sine.easeInOut',
              onComplete: () => this.keeperSway.resume(),
            });
          });
        },
      });
    }

    netRipple(goal) {
      this.tweens.add({
        targets: goal.netG,
        scaleX: 1.06,
        scaleY: 1.08,
        duration: 110,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeInOut',
      });
    }

    scoreGoal(goal) {
      this.scoreVal++;
      this.scoreText.setText(EduCore.fmtNum(this.scoreVal));
      this.feel.squash(this.scoreboard, 0.14, 240);
      this.netRipple(goal);
      this.feel.confetti(goal.x, goal.y - 40, null, 12);
      this.feel.burst(goal.x, goal.y, 0x84a253, 8);
      GameFeel.audio.cheer();
      this.feel.shake(0.0035, 130);
    }

    saveBlock(goal) {
      this.feel.wiggle(goal, 2.4);
      this.feel.burst(this.keeper.x, this.keeper.y, 0xcfd8e0, 6);
    }

    // -------------------------------------------------------------- items
    async presentItem(item, hintApi) {
      this.clearGoals();
      this.tweens.add({ targets: this.promptPanel, alpha: 1, duration: 200 });
      // On a supportive retry the prompt is already familiar — no re-typing.
      if (hintApi.attempt > 1) {
        this.promptText.setText(item.prompt);
      } else {
        this.promptText.setText('');
        await this.feel.typewriter(this.promptText, item.prompt, { cps: 46 });
      }

      const chosen = await new Promise((resolve) => {
        let settled = false;
        this.goals = item.options.map((label, i) =>
          this.buildGoal(i, label, {
            onTap: (idx) => {
              if (settled) return;
              settled = true;
              EduCore.reportLearning('object_interacted', { kind: 'goal', itemId: item.id, index: idx });
              this.goals.forEach((gl) => (gl.disabled = true));
              resolve(idx);
            },
          })
        );
        this.feel.cascadeIn(this.goals, { stagger: 80, dy: 20 });
        EduCore.setTappables(this.goals.map((gl, i) => ({
          id: 'goal' + i, label: item.options[i],
          x: gl.x, y: gl.y, w: 300, h: 230,
          correct: i === item.correctIndex,
        })));
        hintApi.onNarrow(() => {
          const wrongIdx = item.options.map((_, i) => i).filter((i) => i !== item.correctIndex);
          const kill = wrongIdx[Math.floor(Math.random() * wrongIdx.length)];
          const gl = this.goals[kill];
          gl.disabled = true;
          this.tweens.add({ targets: gl, alpha: 0.22, duration: 300 });
        });
      });

      const target = this.goals[chosen];
      const correct = chosen === item.correctIndex;
      this.keeperDive(target, !correct);
      await this.shootBall(target);

      if (correct) {
        this.scoreGoal(target);
        this.ball.setAlpha(0);
        this.time.delayedCall(380, () => {
          this.ball.setAlpha(1).setPosition(BALL_HOME.x, BALL_HOME.y - 60);
          this.resetBall();
        });
      } else {
        this.saveBlock(target);
        // ball ricochets off the keeper
        this.tweens.add({
          targets: this.ball,
          x: BALL_HOME.x + (Math.random() > 0.5 ? 130 : -130),
          y: BALL_HOME.y - 140,
          scale: 0.9,
          duration: 260,
          ease: 'Cubic.easeOut',
          onComplete: () => this.resetBall(),
        });
        if (hintApi.lastAttempt) {
          // no more retries — the right goal glows so learning lands
          const right = this.goals[item.correctIndex];
          this.feel.sparkle(right.x, right.y, 0x84a253, 7);
        }
      }

      await new Promise((r) => this.time.delayedCall(800, r));
      EduCore.setTappables([]);
      return { correct, optionIndex: chosen };
    }

    // ----------------------------------------------------------- tutorial
    async runTutorial() {
      const T = TUTORIAL[EduCore.lang] || TUTORIAL.en;
      await this.coachSay(T.coach);

      // Round 1: two goals, ✓ and ✗.
      this.setPrompt(T.q1);
      let done = false;
      while (!done) {
        this.clearGoals();
        const labels = [T.good, T.bad];
        const tapped = await new Promise((resolve) => {
          this.goals = labels.map((lb, i) =>
            this.buildGoal(i, lb, { onTap: (idx) => resolve(idx) })
          );
          this.feel.cascadeIn(this.goals);
          EduCore.setTappables(this.goals.map((gl, i) => ({
            id: 'goal' + i, label: labels[i], x: gl.x, y: gl.y, w: 300, h: 230, correct: i === 0,
          })));
        });
        const target = this.goals[tapped];
        this.keeperDive(target, tapped !== 0);
        await this.shootBall(target);
        if (tapped === 0) {
          this.scoreGoal(target);
          this.resetBall();
          done = true;
        } else {
          this.saveBlock(target);
          GameFeel.audio.wrongTone();
          this.resetBall();
          await this.coachSay(T.wrongDemo);
        }
      }

      // Round 2: four goals, find the star.
      this.setPrompt(T.q2);
      this.clearGoals();
      const starIdx = Math.floor(Math.random() * 4);
      const labels2 = [0, 1, 2, 3].map((i) => (i === starIdx ? T.star : T.blank));
      const tapped2 = await new Promise((resolve) => {
        this.goals = labels2.map((lb, i) => this.buildGoal(i, lb, { onTap: (idx) => resolve(idx) }));
        this.feel.cascadeIn(this.goals);
        EduCore.setTappables(this.goals.map((gl, i) => ({
          id: 'goal' + i, label: labels2[i], x: gl.x, y: gl.y, w: 300, h: 230, correct: i === starIdx,
        })));
      });
      const t2 = this.goals[tapped2];
      this.keeperDive(t2, tapped2 !== starIdx);
      await this.shootBall(t2);
      if (tapped2 === starIdx) this.scoreGoal(t2);
      else { this.saveBlock(t2); GameFeel.audio.wrongTone(); }
      this.resetBall();
      this.clearGoals();
      EduCore.setTappables([]);
      this.setPrompt('');
    }

    coachSay(text) {
      return new Promise((resolve) => {
        const c = this.add.container(0, 0).setDepth(60);
        const py = 1010;
        const panel = GameFeel.cardPanel(this, W / 2, py, 640, 190, {
          color: 0xfae9d0, stroke: EduCore.accentInt, strokeWidth: 3,
        });
        const tx = this.add.text(W / 2, py - 60, '',
          EduCore.textStyle(26, { color: '#19725E', align: EduCore.isRTL ? 'right' : 'left', wrap: 560, lineSpacing: 7 }))
          .setOrigin(0.5, 0);
        c.add([panel, tx]);
        this.guide.react('hint');
        const zone = this.add.zone(W / 2, py, 660, 210).setInteractive().setDepth(61);
        this.feel.typewriter(tx, text, { cps: 42, skipOn: zone }).then(() => {
          zone.removeAllListeners();
          const cont = this.add.text(W / 2, py + 70, EduCore.t('tapToContinue'),
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
    gameType: 'goal_shootout',
    createGameScene: () => GoalShootoutScene,
    buildMenuBackdrop(scene) {
      const theme = THEMES[EduCore.spec.meta.theme] || THEMES.football;
      const g = scene.add.graphics();
      g.fillStyle(theme.sky, 1);
      g.fillRect(0, 0, W, H * 0.4);
      g.fillStyle(theme.field, 1);
      g.fillRect(0, H * 0.4, W, H * 0.6);
      for (let i = 0; i < 4; i++) {
        g.fillStyle(theme.stripe, 1);
        g.fillRect(0, H * 0.4 + 60 + i * 200, W, 100);
      }
    },
  });
})();
