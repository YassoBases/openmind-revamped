/**
 * Quest Path — story-driven adventure shell.
 *
 * A chibi adventurer walks a path through themed environments; at decision
 * points the student answers questions. Correct → the glowing gate opens and
 * the story advances; wrong → brief "wrong path" reveal, then route-correct.
 * Final educational level is a boss chamber with a dramatic intro.
 *
 * Themes: fantasy, sci_fi, detective, anime — all procedural Graphics.
 * Driven entirely by the injected GameSpec; tutorial level is built in.
 */
(function () {
  'use strict';

  const W = 720;
  const H = 1280;
  const WORLD_H = 700; // top world view; dialog + options below

  // Light, calm worlds on the warm OpenMind palette — no dark skies, no neon.
  const THEMES = {
    fantasy: {
      skyTop: 0xceebf0, skyBottom: 0xfdf2e2, ground: 0x84a253, path: 0xb5702f,
      propColor: 0x4d8c58, accent: 0xef9722, ambient: 'fireflies',
    },
    sci_fi: {
      skyTop: 0xb9e2e8, skyBottom: 0xe9f6f8, ground: 0x57a79f, path: 0xfae9d0,
      propColor: 0x19725e, accent: 0x079a90, ambient: 'stars',
    },
    detective: {
      skyTop: 0xfadbb0, skyBottom: 0xfdf2e2, ground: 0x9c6128, path: 0xfae9d0,
      propColor: 0xb5702f, accent: 0xef9722, ambient: 'rain',
    },
    anime: {
      skyTop: 0xf3c9d3, skyBottom: 0xfdf2e2, ground: 0x9fd98a, path: 0xead3ae,
      propColor: 0x4d8c58, accent: 0xd93b5e, ambient: 'petals',
    },
  };

  // Environment progression: forest → cave → mountain → castle → boss chamber.
  const ENV_SHIFTS = [
    { name: 'forest', dark: 0 },
    { name: 'cave', dark: 0.35 },
    { name: 'mountain', dark: 0.12 },
    { name: 'castle', dark: 0.22 },
    { name: 'boss', dark: 0.5 },
  ];

  const TUTORIAL = {
    en: {
      sageIntro: 'I am your guide! Walking this path, choices appear. Tap an answer to choose your way.',
      q1: 'Ready to begin the adventure?',
      q1opts: ["Let's go!", 'Absolutely!'],
      q2: 'Which path looks safe to walk?',
      q2good: 'The glowing path ✨',
      q2bad: 'The dark thorny path',
      wrongDemo: 'See? A wrong turn just bounces us back — no harm done. Onward!',
    },
    ar: {
      sageIntro: 'أنا دليلك! على هذا الدرب تظهر خيارات. اضغط إجابة لتختار طريقك.',
      q1: 'هل أنت مستعد لبدء المغامرة؟',
      q1opts: ['هيا بنا!', 'بالتأكيد!'],
      q2: 'أي طريق يبدو آمنًا للسير؟',
      q2good: 'الطريق المتوهج ✨',
      q2bad: 'الطريق المظلم الشائك',
      wrongDemo: 'أرأيت؟ المنعطف الخاطئ يعيدنا فقط إلى الدرب — لا ضرر. لنتقدم!',
    },
  };

  class QuestPathScene extends EduCore.BaseGameScene {
    // ------------------------------------------------------------- stage
    buildStage() {
      const theme = THEMES[EduCore.spec.meta.theme] || THEMES.fantasy;
      this.theme = theme;
      this.envIndex = 0;
      this.hintPos = { x: EduCore.isRTL ? 86 : W - 86, y: 806 };
      this.hintBubbleY = 880;

      this.sky = this.add.graphics().setDepth(0);
      this.farProps = this.add.container(0, 0).setDepth(1);
      this.nearProps = this.add.container(0, 0).setDepth(2);
      this.groundG = this.add.graphics().setDepth(3);
      this.gateLayer = this.add.container(0, 0).setDepth(4);
      this.ambientLayer = this.add.container(0, 0).setDepth(5);

      this.drawEnvironment(0);
      this.buildAmbient(theme.ambient);

      // The adventurer.
      this.heroX = 150;
      this.hero = this.buildHero(theme);
      this.hero.setPosition(this.heroX, WORLD_H - 120).setDepth(6);

      // Sidekick mascot in the world (small).
      this.guide = new Hoopoe(this, this.heroX - 86, WORLD_H - 130, {
        accent: EduCore.accentInt, scale: 0.52,
      });
      this.guide.setDepth(6);

      // Dialog panel (persistent, reused).
      this.dialogPanel = GameFeel.cardPanel(this, W / 2, 800, 664, 186, {
        color: 0xfae9d0, stroke: 0xdccdb7, strokeWidth: 3,
      }).setDepth(10);
      this.dialogText = this.add.text(EduCore.isRTL ? W / 2 + 300 : W / 2 - 300, 724, '',
        EduCore.textStyle(26, { color: '#19725E', wrap: 530, lineSpacing: 6 }))
        .setOrigin(EduCore.isRTL ? 1 : 0, 0).setDepth(11);

      this.optionButtons = [];
      this.teachStyle = { panelColor: 0xfae9d0 };
    }

    buildHero(theme) {
      const c = this.add.container(0, 0);
      const g = this.add.graphics();
      const accent = EduCore.accentInt;
      const themeKey = EduCore.spec.meta.theme;
      // body (accent cloak)
      g.fillStyle(accent, 1);
      g.fillRoundedRect(-20, -26, 40, 52, 14);
      // head
      g.fillStyle(0xffe3c2, 1);
      g.fillCircle(0, -44, 19);
      // eyes
      g.fillStyle(0x35261c, 1);
      g.fillCircle(6, -46, 2.6);
      g.fillCircle(13, -46, 2.6);
      // theme headgear
      if (themeKey === 'fantasy') {
        g.fillStyle(GameFeel.darken(accent, 0.25), 1);
        g.fillTriangle(-18, -56, 0, -86, 18, -56);
      } else if (themeKey === 'sci_fi') {
        g.lineStyle(4, 0x6ef3ff, 1);
        g.strokeCircle(0, -44, 23);
      } else if (themeKey === 'detective') {
        g.fillStyle(0x2c241c, 1);
        g.fillEllipse(0, -60, 52, 10);
        g.fillRoundedRect(-13, -76, 26, 18, 5);
      } else if (themeKey === 'anime') {
        g.fillStyle(0x4a3328, 1);
        g.fillTriangle(-16, -58, -4, -72, 4, -56);
        g.fillTriangle(0, -58, 12, -74, 18, -54);
      }
      const legL = this.add.graphics({ x: -9, y: 24 });
      legL.fillStyle(0x19725e, 1);
      legL.fillRoundedRect(-5, 0, 10, 22, 4);
      const legR = this.add.graphics({ x: 9, y: 24 });
      legR.fillStyle(0x19725e, 1);
      legR.fillRoundedRect(-5, 0, 10, 22, 4);
      c.add([legL, legR, g]);
      c.legL = legL;
      c.legR = legR;
      // idle bob
      this.tweens.add({
        targets: c, y: '-=6', duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      return c;
    }

    drawEnvironment(envIndex) {
      const t = this.theme;
      const env = ENV_SHIFTS[Math.min(envIndex, ENV_SHIFTS.length - 1)];
      const dk = env.dark;
      const top = GameFeel.darken(t.skyTop, dk);
      const bottom = GameFeel.darken(t.skyBottom, dk);

      this.sky.clear();
      // vertical gradient in 8 bands (cheap, no shaders)
      for (let i = 0; i < 8; i++) {
        const f = i / 7;
        const r1 = (top >> 16) & 255, g1 = (top >> 8) & 255, b1 = top & 255;
        const r2 = (bottom >> 16) & 255, g2 = (bottom >> 8) & 255, b2 = bottom & 255;
        const col = ((r1 + (r2 - r1) * f) << 16) | ((g1 + (g2 - g1) * f) << 8) | (b1 + (b2 - b1) * f);
        this.sky.fillStyle(col, 1);
        this.sky.fillRect(0, (WORLD_H / 8) * i, W, WORLD_H / 8 + 1);
      }
      // bottom UI zone backdrop
      this.sky.fillStyle(0xfdf2e2, 1);
      this.sky.fillRect(0, WORLD_H, W, H - WORLD_H);

      // ground + path
      this.groundG.clear();
      this.groundG.fillStyle(GameFeel.darken(t.ground, dk), 1);
      this.groundG.fillRect(0, WORLD_H - 90, W, 90);
      this.groundG.fillStyle(GameFeel.darken(t.path, dk), 1);
      this.groundG.fillRoundedRect(-20, WORLD_H - 64, W + 40, 36, 14);
      // stepping stones
      this.groundG.fillStyle(GameFeel.lighten(t.path, 0.12), 0.7);
      for (let i = 0; i < 7; i++) {
        this.groundG.fillEllipse(50 + i * 105, WORLD_H - 46, 38, 10);
      }

      // far props per environment
      this.farProps.removeAll(true);
      this.nearProps.removeAll(true);
      const prop = (g) => { this.farProps.add(g); return g; };
      const nprop = (g) => { this.nearProps.add(g); return g; };
      const pc = GameFeel.darken(t.propColor, dk);
      const g = this.add.graphics();
      g.fillStyle(pc, 1);
      const name = env.name;
      if (name === 'forest') {
        for (let i = 0; i < 4; i++) {
          const x = 70 + i * 190;
          g.fillTriangle(x - 46, WORLD_H - 88, x, WORLD_H - 320 + (i % 2) * 50, x + 46, WORLD_H - 88);
          g.fillRect(x - 8, WORLD_H - 100, 16, 16);
        }
      } else if (name === 'cave') {
        for (let i = 0; i < 6; i++) {
          const x = 40 + i * 130;
          g.fillTriangle(x - 26, 0, x, 150 + (i % 3) * 55, x + 26, 0); // stalactites
        }
        g.fillRoundedRect(-30, WORLD_H - 360, 190, 280, 60);
        g.fillRoundedRect(W - 150, WORLD_H - 320, 190, 240, 60);
      } else if (name === 'mountain') {
        g.fillTriangle(-40, WORLD_H - 88, 180, WORLD_H - 480, 390, WORLD_H - 88);
        g.fillTriangle(300, WORLD_H - 88, 540, WORLD_H - 420, 780, WORLD_H - 88);
        g.fillStyle(0xf0f4f8, 0.9);
        g.fillTriangle(140, WORLD_H - 410, 180, WORLD_H - 480, 222, WORLD_H - 408);
      } else if (name === 'castle') {
        g.fillRect(120, WORLD_H - 380, 110, 292);
        g.fillRect(420, WORLD_H - 430, 110, 342);
        g.fillRect(270, WORLD_H - 300, 130, 212);
        for (let i = 0; i < 3; i++) {
          g.fillRect(118 + i * 40, WORLD_H - 404, 26, 26);
          g.fillRect(418 + i * 40, WORLD_H - 454, 26, 26);
        }
      } else if (name === 'boss') {
        // dramatic chamber (calm dusk, not darkness): pillars + the boss
        g.fillRect(40, WORLD_H - 420, 60, 332);
        g.fillRect(W - 100, WORLD_H - 420, 60, 332);
        this.boss = this.buildBoss();
        nprop(this.boss);
      }
      prop(g);

      // window/torch glows for flavor
      const glow = this.add.graphics();
      glow.fillStyle(t.accent, 0.5);
      if (name === 'castle') {
        glow.fillRect(150, WORLD_H - 340, 18, 26);
        glow.fillRect(452, WORLD_H - 390, 18, 26);
      } else if (name === 'forest' || name === 'cave') {
        glow.fillCircle(70, WORLD_H - 150, 7);
        glow.fillCircle(W - 90, WORLD_H - 170, 7);
      }
      nprop(glow);
      this.tweens.add({ targets: glow, alpha: 0.35, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    buildBoss() {
      const c = this.add.container(W / 2 + 120, WORLD_H - 250);
      const g = this.add.graphics();
      g.fillStyle(0x114a3d, 1); // deep-teal silhouette, not black
      g.fillRoundedRect(-110, -130, 220, 260, 70);
      g.fillTriangle(-95, -110, -130, -190, -50, -130); // horns
      g.fillTriangle(95, -110, 130, -190, 50, -130);
      c.add(g);
      const eyeL = this.add.circle(-40, -50, 12, this.theme.accent, 1);
      const eyeR = this.add.circle(40, -50, 12, this.theme.accent, 1);
      c.add([eyeL, eyeR]);
      this.tweens.add({ targets: [eyeL, eyeR], alpha: 0.45, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: c, scaleX: 1.03, scaleY: 0.985, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // breathing
      return c;
    }

    buildAmbient(kind) {
      this.ambientLayer.removeAll(true);
      if (kind === 'fireflies') {
        for (let i = 0; i < 6; i++) {
          const fly = this.add.circle(Math.random() * W, 120 + Math.random() * 420, 3, 0xef9722, 0.9);
          this.ambientLayer.add(fly);
          this.tweens.add({
            targets: fly,
            x: fly.x + (Math.random() * 120 - 60),
            y: fly.y + (Math.random() * 80 - 40),
            alpha: { from: 0.9, to: 0.2 },
            duration: 2200 + Math.random() * 1800,
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          });
        }
      } else if (kind === 'stars') {
        // drifting sparks read on a light sky where white stars would vanish
        for (let i = 0; i < 12; i++) {
          const s = this.add.circle(Math.random() * W, Math.random() * 380, 1.5 + Math.random() * 1.5, 0x079a90, 0.55);
          this.ambientLayer.add(s);
          this.tweens.add({
            targets: s, alpha: 0.12, duration: 600 + Math.random() * 1400,
            yoyo: true, repeat: -1, delay: Math.random() * 1000,
          });
        }
        const shipLight = this.add.circle(W - 120, 90, 4, 0xd93b5e, 1);
        this.ambientLayer.add(shipLight);
        this.tweens.add({ targets: shipLight, alpha: 0.1, duration: 500, yoyo: true, repeat: -1 });
      } else if (kind === 'rain') {
        for (let i = 0; i < 9; i++) {
          const drop = this.add.rectangle(Math.random() * W, -20, 2, 26, 0x079a90, 0.35);
          this.ambientLayer.add(drop);
          this.tweens.add({
            targets: drop, y: WORLD_H + 30, duration: 750 + Math.random() * 500,
            repeat: -1, delay: Math.random() * 900,
            onRepeat: () => { drop.x = Math.random() * W; },
          });
        }
        // flickering café sign (warm, not neon)
        const neon = this.add.text(EduCore.isRTL ? 96 : W - 130, 110, '★',
          EduCore.textStyle(44, { color: '#EF9722', align: 'center' })).setOrigin(0.5);
        this.ambientLayer.add(neon);
        this.tweens.add({ targets: neon, alpha: { from: 1, to: 0.3 }, duration: 120, yoyo: true, repeat: -1, repeatDelay: 1700 });
      } else if (kind === 'petals') {
        for (let i = 0; i < 7; i++) {
          const petal = this.add.ellipse(Math.random() * W, -10, 12, 8, 0xffb3cd, 0.9);
          this.ambientLayer.add(petal);
          this.tweens.add({
            targets: petal,
            y: WORLD_H - 60,
            x: petal.x + 90,
            angle: 320,
            duration: 6000 + Math.random() * 3000,
            repeat: -1,
            delay: Math.random() * 5000,
            onRepeat: () => { petal.x = Math.random() * W; },
          });
        }
      }
    }

    // ------------------------------------------------------ level changes
    async levelTransition(levelIndex) {
      const spec = EduCore.spec;
      const total = spec.meta.sessionLength;
      const isBoss = levelIndex === total - 1 && levelIndex > 0;
      this.envIndex = levelIndex === 0 ? 0 : isBoss ? 4 : 1 + ((levelIndex - 1) % 3);

      // slide the world out / in (no hard cuts)
      await new Promise((resolve) => {
        this.tweens.add({
          targets: [this.farProps, this.nearProps, this.ambientLayer],
          x: EduCore.isRTL ? W : -W,
          alpha: 0.3,
          duration: 320,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            this.drawEnvironment(this.envIndex);
            this.buildAmbient(this.theme.ambient);
            this.farProps.setX(EduCore.isRTL ? -W : W).setAlpha(1);
            this.nearProps.setX(EduCore.isRTL ? -W : W).setAlpha(1);
            this.ambientLayer.setX(0).setAlpha(1);
            this.tweens.add({
              targets: [this.farProps, this.nearProps],
              x: 0,
              duration: 360,
              ease: 'Cubic.easeOut',
              onComplete: resolve,
            });
          },
        });
        this.hero.setPosition(150, WORLD_H - 120);
        this.heroX = 150;
        this.guide.setPosition(64, WORLD_H - 130);
      });

      if (isBoss) await this.bossIntro();
    }

    bossIntro() {
      return new Promise((resolve) => {
        EduCore.bridge.reportEvent('boss_intro');
        this.feel.flash(0xef9722, 90); // lightning (warm amber, ≤100ms)
        this.feel.shake(0.006, 200);
        this.feel.zoomPunch(1.07, 420);
        GameFeel.audio.drama();
        const warn = this.add.text(W / 2, 320, EduCore.t('bossWarning'),
          EduCore.textStyle(48, { weight: '800', color: '#EF9722', align: 'center', stroke: '#FDF2E2' }))
          .setOrigin(0.5).setDepth(50).setScale(0.4).setAlpha(0);
        this.tweens.add({ targets: warn, alpha: 1, scale: 1, duration: 420, ease: 'Back.easeOut' });
        this.time.delayedCall(1500, () => {
          this.tweens.add({ targets: warn, alpha: 0, duration: 300, onComplete: () => { warn.destroy(); resolve(); } });
        });
      });
    }

    // ------------------------------------------------------------ dialog
    /** Typewritten dialog in the panel. Tap panel to skip/advance. */
    say(text) {
      return new Promise((resolve) => {
        const zone = this.add.zone(W / 2, 800, 664, 190).setInteractive().setDepth(12);
        this.dialogText.setText('');
        this.feel.typewriter(this.dialogText, text, { cps: 40, skipOn: zone }).then(() => {
          zone.removeAllListeners();
          const cont = this.add.text(W / 2, 916, EduCore.t('tapToContinue'),
            EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5).setDepth(12);
          this.tweens.add({ targets: cont, alpha: 0.4, duration: 550, yoyo: true, repeat: -1 });
          zone.once('pointerdown', () => {
            cont.destroy();
            zone.destroy();
            resolve();
          });
        });
      });
    }

    /** Story beat before teach cards: per-level narrative flavor. */
    async teachPhase(level) {
      const spec = EduCore.spec;
      const li = level.index;
      if (spec.narrative && spec.narrative.perLevel && spec.narrative.perLevel[li - 1]) {
        EduCore.setState('teach');
        await this.say(spec.narrative.perLevel[li - 1]);
        this.dialogText.setText('');
      }
      await super.teachPhase(level);
    }

    // ----------------------------------------------------------- tutorial
    async runTutorial() {
      const T = TUTORIAL[EduCore.lang] || TUTORIAL.en;
      const spec = EduCore.spec;
      if (spec.narrative && spec.narrative.intro) {
        await this.say(spec.narrative.intro);
      }
      await this.say(T.sageIntro);

      // Choice 1: both answers are right — teaches the tap + celebration.
      const first = await this.askOptions(T.q1, T.q1opts, [0, 1]);
      this.feel.burst(this.hero.x, this.hero.y - 40, 0x84a253, 10);
      GameFeel.audio.correctChain(1);
      this.guide.react('correct');
      await this.walkForward();

      // Choice 2: one obviously safe path — teaches the wrong-path reveal.
      const second = await this.askOptions(T.q2, [T.q2good, T.q2bad], [0]);
      if (second === 0) {
        await this.celebrateGate();
      } else {
        await this.wrongPathReveal();
        await this.say(T.wrongDemo);
        await this.celebrateGate();
      }
      await this.walkForward();
      this.dialogText.setText('');
      EduCore.session.presented = 0; // tutorial never counts toward score
      EduCore.session.correct = 0;
      EduCore.session.combo = 0;
    }

    // -------------------------------------------------------------- items
    async presentItem(item, hintApi) {
      this.showGates();
      // On a supportive retry the prompt is already familiar — show it
      // instantly instead of re-typing it.
      if (hintApi.attempt > 1) {
        this.dialogText.setText(item.prompt);
      } else {
        this.dialogText.setText('');
        const zone = this.add.zone(W / 2, 800, 664, 190).setInteractive().setDepth(12);
        await this.feel.typewriter(this.dialogText, item.prompt, { cps: 44, skipOn: zone });
        zone.destroy();
      }

      const chosen = await this.askItemOptions(item, hintApi);
      const correct = chosen === item.correctIndex;

      if (correct) {
        await this.celebrateGate();
        await this.walkForward();
        if (this.boss) this.bossHit();
      } else {
        await this.wrongPathReveal();
      }
      this.hideGates();
      return { correct, optionIndex: chosen };
    }

    /** The 4 spec options as candy buttons; supports hint-2 elimination. */
    askItemOptions(item, hintApi) {
      return new Promise((resolve) => {
        const buttons = [];
        const labels = item.options;
        labels.forEach((label, i) => {
          const y = 952 + i * 80;
          const btn = GameFeel.candyButton(this, W / 2, y, 620, 68, label, {
            color: 0x079a90, arabic: EduCore.isRTL, fontSize: EduCore.isRTL ? 28 : 25, wrap: true,
            onTap: () => {
              finish(i);
            },
          });
          btn.setDepth(20);
          btn.on('pointerdown', () => {
            this.feel.wiggle(btn, 1.2);
            EduCore.reportLearning('object_interacted', { kind: 'option', itemId: item.id, index: i });
          });
          buttons.push(btn);
        });
        this.optionButtons = buttons;
        this.feel.cascadeIn(buttons, { stagger: 70 });

        EduCore.setTappables(buttons.map((b, i) => ({
          id: 'opt' + i, label: labels[i], x: b.x, y: 952 + i * 80, w: 620, h: 68,
          correct: i === item.correctIndex,
        })));

        // Hint 2 narrows: fade out one wrong option.
        hintApi.onNarrow(() => {
          const wrongIdx = labels.map((_, i) => i).filter((i) => i !== item.correctIndex);
          const kill = wrongIdx[Math.floor(Math.random() * wrongIdx.length)];
          const b = buttons[kill];
          b.setEnabled(false);
          this.tweens.add({ targets: b, alpha: 0.25, duration: 300 });
        });

        const finish = (i) => {
          buttons.forEach((b) => b.setEnabled(false));
          const pickBtn = buttons[i];
          const correctBtn = buttons[item.correctIndex];
          if (i === item.correctIndex) {
            this.feel.squash(pickBtn, 0.12, 200);
            this.feel.sparkle(pickBtn.x, pickBtn.y, 0x84a253, 8);
          } else {
            this.feel.wiggle(pickBtn, 3);
            this.tweens.add({ targets: pickBtn, alpha: 0.35, duration: 250 });
            if (hintApi.lastAttempt) {
              // no more retries — let the right answer land before the explanation
              this.feel.breathe(correctBtn, 0.03);
              this.feel.sparkle(correctBtn.x, correctBtn.y, 0x84a253, 6);
            }
          }
          this.time.delayedCall(620, () => {
            buttons.forEach((b) => b.destroy());
            this.optionButtons = [];
            EduCore.setTappables([]);
            resolve(i);
          });
        };
      });
    }

    /** Tutorial helper: plain string options; rightIdx = accepted answers. */
    askOptions(prompt, labels, rightIdx) {
      return new Promise(async (resolve) => {
        const zone = this.add.zone(W / 2, 800, 664, 190).setInteractive().setDepth(12);
        this.dialogText.setText('');
        await this.feel.typewriter(this.dialogText, prompt, { cps: 44, skipOn: zone });
        zone.destroy();
        const buttons = labels.map((label, i) => {
          const btn = GameFeel.candyButton(this, W / 2, 968 + i * 96, 560, 78, label, {
            color: 0x079a90, arabic: EduCore.isRTL, fontSize: EduCore.isRTL ? 29 : 26,
            onTap: () => {
              buttons.forEach((b) => b.setEnabled(false));
              this.time.delayedCall(250, () => {
                buttons.forEach((b) => b.destroy());
                EduCore.setTappables([]);
                resolve(i);
              });
            },
          });
          btn.setDepth(20);
          return btn;
        });
        this.feel.cascadeIn(buttons);
        EduCore.setTappables(buttons.map((b, i) => ({
          id: 'opt' + i, label: labels[i], x: b.x, y: b.y, w: 560, h: 78,
          correct: rightIdx.includes(i),
        })));
      });
    }

    // ------------------------------------------------------- path actions
    showGates() {
      this.hideGates();
      const gx = this.heroX + 240;
      const c = this.add.container(0, 0).setDepth(4);
      const up = this.add.graphics();
      up.lineStyle(10, GameFeel.lighten(this.theme.path, 0.2), 0.85);
      up.beginPath();
      up.moveTo(gx - 70, WORLD_H - 64);
      up.lineTo(gx + 60, WORLD_H - 140);
      up.strokePath();
      const down = this.add.graphics();
      down.lineStyle(10, GameFeel.darken(this.theme.path, 0.3), 0.85);
      down.beginPath();
      down.moveTo(gx - 70, WORLD_H - 50);
      down.lineTo(gx + 70, WORLD_H - 22);
      down.strokePath();
      const glow = this.add.circle(gx + 64, WORLD_H - 146, 12, this.theme.accent, 0.8);
      this.tweens.add({ targets: glow, scale: 1.35, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });
      c.add([up, down, glow]);
      this.gates = c;
      this.gateX = gx;
    }

    hideGates() {
      if (this.gates) {
        this.gates.destroy();
        this.gates = null;
      }
    }

    celebrateGate() {
      return new Promise((resolve) => {
        if (this.gates) this.feel.sparkle(this.gateX + 60, WORLD_H - 140, this.theme.accent, 9);
        this.time.delayedCall(240, resolve);
      });
    }

    /** Wrong answer: hero leans down the dark branch, it shudders, route-correct. */
    wrongPathReveal() {
      return new Promise((resolve) => {
        const lean = this.gates ? this.gateX - 40 : this.heroX + 50;
        this.walkLegs(true);
        this.tweens.add({
          targets: [this.hero, this.guide],
          x: '+=46',
          y: '+=12',
          angle: 6,
          duration: 380,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            this.walkLegs(false);
            this.feel.shake(0.003, 130);
            if (this.gates) {
              this.tweens.add({ targets: this.gates, alpha: 0.4, duration: 140, yoyo: true, repeat: 1 });
            }
            // route-correct: hop back onto the path
            this.tweens.add({
              targets: [this.hero, this.guide],
              x: '-=46',
              y: '-=12',
              angle: 0,
              duration: 420,
              ease: 'Back.easeOut',
              delay: 320,
              onComplete: resolve,
            });
          },
        });
      });
    }

    walkLegs(on) {
      if (this._legTweens) {
        this._legTweens.forEach((t) => t.stop());
        this._legTweens = null;
        this.hero.legL.setAngle(0);
        this.hero.legR.setAngle(0);
      }
      if (on) {
        this._legTweens = [
          this.tweens.add({ targets: this.hero.legL, angle: { from: -22, to: 22 }, duration: 160, yoyo: true, repeat: -1 }),
          this.tweens.add({ targets: this.hero.legR, angle: { from: 22, to: -22 }, duration: 160, yoyo: true, repeat: -1 }),
        ];
      }
    }

    walkForward() {
      return new Promise((resolve) => {
        this.walkLegs(true);
        const dist = 120;
        const target = this.heroX + dist > W - 160 ? 150 : this.heroX + dist;
        const wrap = this.heroX + dist > W - 160;
        this.heroX = target;
        // parallax: far props drift opposite the walk
        this.tweens.add({ targets: this.farProps, x: this.farProps.x - 18, duration: 700, ease: 'Sine.easeInOut' });
        this.tweens.add({
          targets: [this.hero, this.guide],
          x: wrap ? '+=40' : '+=' + dist,
          duration: 700,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            this.walkLegs(false);
            if (wrap) {
              this.hero.setX(150);
              this.guide.setX(64);
            }
            resolve();
          },
        });
      });
    }

    bossHit() {
      if (!this.boss) return;
      this.feel.squash(this.boss, 0.2, 260);
      this.feel.shake(0.004, 140);
      this.feel.burst(this.boss.x, this.boss.y, this.theme.accent, 10);
    }
  }

  EduCore.boot(window.__EDUMIND_SPEC__, {
    gameType: 'quest_path',
    createGameScene: () => QuestPathScene,
    buildMenuBackdrop(scene) {
      const theme = THEMES[EduCore.spec.meta.theme] || THEMES.fantasy;
      const g = scene.add.graphics();
      for (let i = 0; i < 10; i++) {
        const f = i / 9;
        const top = theme.skyTop, bottom = theme.skyBottom;
        const r1 = (top >> 16) & 255, g1 = (top >> 8) & 255, b1 = top & 255;
        const r2 = (bottom >> 16) & 255, g2 = (bottom >> 8) & 255, b2 = bottom & 255;
        const col = ((r1 + (r2 - r1) * f) << 16) | ((g1 + (g2 - g1) * f) << 8) | (b1 + (b2 - b1) * f);
        g.fillStyle(col, 1);
        g.fillRect(0, (H / 10) * i, W, H / 10 + 1);
      }
    },
  });
})();
