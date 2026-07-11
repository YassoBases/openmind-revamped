/**
 * EduCore.js — the engine shared by all three EduMind shells.
 *
 * Owns: spec intake (full + progressive-start stubs via receiveSpec),
 * i18n + RTL + Arabic-Indic numerals + gender-aware Arabic strings,
 * the AdaptiveEngine (first-try correctness only — combos and hints NEVER
 * feed it), the Teach → Practice level loop, the two-stage hint system
 * (nudge, narrow; never reveal), the supportive retry loop (no hearts, no
 * lives, no point loss — a wrong answer earns another go with a hint, and
 * "take a break" is strain-triggered, never a fail screen), XP rules, the
 * host bridge (dual-channel) including the 8-event learning contract, the
 * shared IntroScene / EndScene, and the EduMindDebug test surface.
 *
 * Scene contract: every shell registers exactly IntroScene, GameScene, EndScene.
 */
(function () {
  'use strict';

  const W = 720;
  const H = 1280;

  // The warm OpenMind palette — light, calm backgrounds; teal for
  // interactive elements; deep teal instead of heavy black; orange and green
  // for success and progress; berry pink very sparingly, decoration only.
  const PALETTE = {
    cream: 0xfdf2e2, // Warm Cream — backgrounds
    sand: 0xfae9d0, // Soft Sand — cards and panels
    teal: 0x079a90, // Main Teal — interactive elements
    deepTeal: 0x19725e, // Deep Teal — ink and scrims, never heavy black
    orange: 0xef9722, // Bright Orange — progress, XP, celebration
    peach: 0xfadbb0, // Soft Peach — highlights, hint bubbles
    leaf: 0x84a253, // Leaf Green — success
    deepGreen: 0x4d8c58, // Deep Green — positive CTAs
    sky: 0xceebf0, // Soft Sky Blue — calm info accents
    berry: 0xd93b5e, // Berry Pink — decoration only, sparingly
    brown: 0xb5702f, // Warm Brown — paths, secondary text
    // Legacy role aliases (kept so role names stay meaningful at call sites):
    green: 0x4d8c58,
    greenShadow: 0x3a6b43,
    blue: 0x079a90,
    yellow: 0xef9722,
    dark: 0x19725e,
    soft: 0xfdf2e2,
    grey: 0xb5702f,
  };

  const XP = { noHint: 10, oneHint: 7, twoHints: 5, retry: 5, level: 50, mastery: 200 };

  const ADAPT = {
    start: { easy: 1.5, normal: 2.5, hard: 3.5 },
    step: 0.75,
    streak: 2,
    min: 1,
    max: 5,
    perLevel: 3,
    masteryFinal: 0.75,
    masteryRun: 3,
    masteryRunScore: 0.8,
    frustration: 3,
    frustrationScore: 0.4,
    strain: 3, // consecutive not-first-try items before a gentle break
  };

  // ------------------------------------------------------------------ i18n
  // AR entries may be { m, f, n } for gender-aware grammar (n = neutral).
  const STRINGS = {
    play: { en: 'PLAY', ar: 'العب' },
    hi: { en: 'Hi {name}!', ar: { m: 'أهلًا {name}!', f: 'أهلًا {name}!', n: 'أهلًا {name}!' } },
    tapToContinue: { en: 'TAP TO CONTINUE', ar: 'اضغط للمتابعة' },
    tapToSkip: { en: 'tap to skip', ar: 'اضغط للتخطي' },
    level: { en: 'Level {n}', ar: 'المرحلة {n}' },
    levelOf: { en: 'Level {n} of {total}', ar: 'المرحلة {n} من {total}' },
    intro: { en: 'Tutorial', ar: 'تدريب' },
    teachTitle: { en: 'Learn this!', ar: 'تعلّم هذا!' },
    gotIt: { en: 'GOT IT', ar: 'فهمت' },
    hint: { en: 'Hint', ar: 'تلميح' },
    anotherHint: { en: 'One more hint', ar: 'تلميح آخر' },
    correct: {
      en: ['Exactly!', 'Brilliant!', 'You got it!', 'Nailed it!'],
      ar: {
        m: ['أحسنتَ!', 'رائع!', 'إجابة صحيحة!', 'ممتاز!'],
        f: ['أحسنتِ!', 'رائع!', 'إجابة صحيحة!', 'ممتازة!'],
        n: ['أحسنت!', 'رائع!', 'إجابة صحيحة!', 'ممتاز!'],
      },
    },
    wrong: {
      en: ['Not quite —', 'Almost!', 'Good try —'],
      ar: { m: 'قريب من الصواب —', f: 'قريبة من الصواب —', n: 'محاولة جيدة —' },
    },
    tryAgain: {
      en: ['Good try — look again!', 'Almost! Have another go.'],
      ar: { m: 'محاولة جيدة — دقّق مرة أخرى!', f: 'محاولة جيدة — دقّقي مرة أخرى!', n: 'محاولة جيدة — لننظر مرة أخرى!' },
    },
    solvedIt: {
      en: 'You worked it out!',
      ar: { m: 'توصلتَ إليها!', f: 'توصلتِ إليها!', n: 'توصلت إليها!' },
    },
    takeABreak: { en: 'Take a break', ar: 'خذ استراحة' },
    breakBody: {
      en: "You're working hard, {name}. Breathe with me for a moment — then we'll try something a little easier.",
      ar: { m: 'أنت تبذل جهدًا رائعًا يا {name}. تنفّس معي لحظة، ثم سنجرب شيئًا أسهل قليلًا.', f: 'أنتِ تبذلين جهدًا رائعًا يا {name}. تنفّسي معي لحظة، ثم سنجرب شيئًا أسهل قليلًا.', n: 'جهدك رائع يا {name}. لنتنفس معًا لحظة، ثم نجرب شيئًا أسهل قليلًا.' },
    },
    keepGoing: { en: "LET'S CONTINUE", ar: 'لنُكمل' },
    levelClear: { en: 'Level complete!', ar: 'أنهيت المرحلة!' },
    encourage: {
      en: ["You're getting stronger!", 'Every try teaches you something.', "Let's take it step by step."],
      ar: { m: 'أنت تتقدم خطوة بخطوة!', f: 'أنتِ تتقدمين خطوة بخطوة!', n: 'كل محاولة تعلّمك شيئًا جديدًا!' },
    },
    waitingTitle: { en: 'Building your adventure…', ar: 'نجهّز مغامرتك…' },
    waitingBody: { en: 'Hudhud is scouting for your questions!', ar: 'الهدهد يستكشف أسئلتك!' },
    failedTitle: { en: 'Oh no, my magic fizzled!', ar: 'عذرًا، تعثّر سحري قليلًا!' },
    failedBody: { en: "I couldn't finish building this lesson.", ar: 'لم أستطع إكمال تجهيز هذا الدرس.' },
    retry: { en: 'TRY AGAIN', ar: 'حاول مجددًا' },
    summaryTitle: { en: 'Lesson complete!', ar: 'اكتمل الدرس!' },
    summaryMastery: { en: 'MASTERED', ar: 'إتقان' },
    accuracy: { en: 'Accuracy', ar: 'الدقة' },
    conceptsTitle: { en: 'What you learned', ar: 'ما تعلمته' },
    hintNote: {
      en: 'You leaned on hints for {concept} — a good topic to review next.',
      ar: 'استعنتَ بالتلميحات في {concept} — موضوع جيد لمراجعته لاحقًا.',
    },
    noHintNote: { en: 'You barely needed hints. Impressive!', ar: 'لم تحتج إلى تلميحات تقريبًا. مذهل!' },
    nextTopics: { en: 'Explore next', ar: 'استكشف بعدها' },
    playAgain: { en: 'PLAY AGAIN', ar: 'العب مجددًا' },
    done: { en: 'DONE', ar: 'تم' },
    xp: { en: 'XP', ar: 'نقاط' },
    combo: { en: 'x{n} combo!', ar: 'سلسلة x{n}!' },
    streakFire: { en: 'ON FIRE!', ar: 'متألق!' },
    tips: {
      en: [
        'Hints never spoil the answer — they nudge you toward it.',
        'Wrong answers grow your brain the most. Really!',
        'Watch for key words highlighted in your color.',
        'Combos are for glory. Learning is for keeps.',
        'You can replay any saved game offline, anytime.',
      ],
      ar: [
        'التلميحات لا تكشف الإجابة أبدًا — بل تقرّبك منها.',
        'الإجابات الخاطئة تنمّي عقلك أكثر. حقًا!',
        'انتبه للكلمات المميزة بلونك المفضل.',
        'السلاسل للمتعة، أما التعلم فيبقى معك.',
        'يمكنك إعادة لعب أي لعبة محفوظة دون إنترنت.',
      ],
    },
    bossWarning: { en: 'FINAL CHALLENGE', ar: 'التحدي الأخير' },
  };

  // ------------------------------------------------------------- utilities
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  const EduCore = {
    W,
    H,
    PALETTE,
    XP_RULES: XP,
    ADAPT,
    VERSION: '4.0.0',
    spec: null,
    stub: false,
    session: null,
    engine: null,
    game: null,
    _specWaiters: [],
    _failed: false,

    // ----------------------------------------------------------- language
    get lang() {
      return this.spec && this.spec.meta.language === 'ar' ? 'ar' : 'en';
    },
    get isRTL() {
      return this.lang === 'ar';
    },
    get gender() {
      const g = this.spec && this.spec.student ? this.spec.student.gender : null;
      return g === 'm' || g === 'f' ? g : 'n';
    },

    /** i18n lookup with {var} interpolation, AR gender forms, array variants. */
    t(key, vars) {
      const entry = STRINGS[key];
      if (!entry) return key;
      let v = entry[this.lang] == null ? entry.en : entry[this.lang];
      if (v && typeof v === 'object' && !Array.isArray(v)) v = v[this.gender] || v.n || v.m;
      if (Array.isArray(v)) v = pick(v);
      if (vars) for (const k of Object.keys(vars)) v = v.split('{' + k + '}').join(String(vars[k]));
      return v;
    },

    /** Format a number, honoring Arabic-Indic numerals when configured. */
    fmtNum(n) {
      const s = String(n);
      const numerals = this.spec && this.spec.meta.numerals;
      if (numerals === 'arabic_indic' || (numerals == null && this.lang === 'ar')) {
        return s.replace(/[0-9]/g, (d) => AR_DIGITS[+d]);
      }
      return s;
    },

    /**
     * Text style enforcing the floor sizes (>=24px EN, >=28px AR), language
     * font and RTL flag. ALL text in the shells goes through this.
     */
    textStyle(size, opts) {
      const o = opts || {};
      const min = this.isRTL ? 28 : 24;
      const px = Math.max(size, min);
      const style = {
        fontFamily: this.isRTL ? 'Tajawal, sans-serif' : 'Nunito, sans-serif',
        fontSize: px + 'px',
        fontStyle: o.weight || '700',
        color: o.color || '#19725E', // deep-teal ink on the warm palette

        align: o.align || (this.isRTL ? 'right' : 'left'),
        rtl: this.isRTL,
      };
      if (o.wrap) style.wordWrap = { width: o.wrap, useAdvancedWrap: true };
      if (o.stroke) {
        style.stroke = o.stroke;
        style.strokeThickness = o.strokeThickness || 6;
      }
      if (o.lineSpacing != null) style.lineSpacing = o.lineSpacing;
      return style;
    },

    get accentInt() {
      return GameFeel.hexToInt(this.spec.student.color || '#079A90');
    },

    // ------------------------------------------------------------- bridge
    bridge: {
      _seq: 0,
      send(type, payload) {
        const msg = {
          source: 'EduMind',
          type,
          seq: ++this._seq,
          at: Date.now(),
          payload: payload || {},
        };
        try {
          if (window.EduMind && typeof window.EduMind.postMessage === 'function') {
            window.EduMind.postMessage(JSON.stringify(msg));
          }
        } catch (e) { /* native channel absent — fine */ }
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(msg, '*');
          }
        } catch (e) { /* cross-origin host — fine */ }
        const dbg = window.EduMindDebug;
        dbg.events.push(msg);
        if (dbg.events.length > 300) dbg.events.shift();
      },
      reportScore(p) { this.send('reportScore', p); },
      reportLevel(p) { this.send('reportLevel', p); },
      reportSummary(p) { this.send('reportSummary', p); },
      reportComplete(p) { this.send('reportComplete', p); },
      reportEvent(name, p) { this.send('reportEvent', Object.assign({ name }, p || {})); },
    },

    /**
     * Learning-evidence event contract. Every event carries the same
     * envelope so the host can record concept/level/template/wrapper
     * dimensions uniformly. Events: experience_started, object_interacted,
     * attempt_submitted, hint_requested, hint_shown, misconception_detected,
     * level_completed, experience_completed.
     */
    /** The learning-ladder rung of the level in play (set by runLevelShell). */
    currentLearningLevel: null,

    reportLearning(name, extra) {
      const meta = this.spec && this.spec.meta ? this.spec.meta : {};
      this.bridge.reportEvent(name, Object.assign({
        conceptId: meta.conceptId || null,
        learningLevel: this.currentLearningLevel || null,
        templateId: meta.gameType || null,
        wrapperId: meta.wrapper || meta.theme || null,
      }, extra || {}));
    },

    // ---------------------------------------------------------- debug API
    setState(state) {
      window.EduMindDebug.state = state;
    },
    setTappables(list) {
      window.EduMindDebug.tappables = list || [];
    },

    // ---------------------------------------------------------- spec flow
    /** Host pushes the full spec once generation finishes (progressive start). */
    receiveSpec(input) {
      let spec = input;
      if (typeof input === 'string') {
        try { spec = JSON.parse(input); } catch (e) { return false; }
      }
      if (!spec || spec.specVersion !== 1 || !spec.meta || !Array.isArray(spec.levels) || spec.levels.length < 1) {
        return false;
      }
      if (this.spec && spec.meta.gameType !== this.spec.meta.gameType) return false;
      this.spec = spec;
      this.stub = false;
      this._failed = false;
      window.EduMindDebug.specReady = true;
      this.bridge.reportEvent('spec_received', { levels: spec.levels.length });
      const waiters = this._specWaiters.splice(0);
      waiters.forEach((w) => w.resolve());
      return true;
    },

    /** Host signals generation failure → friendly mascot apology + retry. */
    generationFailed() {
      this._failed = true;
      const waiters = this._specWaiters.splice(0);
      waiters.forEach((w) => w.reject(new Error('generation_failed')));
    },

    specReady() {
      return !this.stub;
    },

    waitForSpec() {
      if (!this.stub) return Promise.resolve();
      if (this._failed) return Promise.reject(new Error('generation_failed'));
      return new Promise((resolve, reject) => this._specWaiters.push({ resolve, reject }));
    },

    educationalLevels() {
      return this.spec.levels.filter((l) => !l.isIntro);
    },

    // ----------------------------------------------------------- boot
    /**
     * Boot a shell. gameDef = { gameType, createGameScene(BaseGameScene) -> Scene class }.
     * Reads window.__EDUMIND_SPEC__ (full spec or stub).
     */
    boot(rawSpec, gameDef) {
      window.EduMindDebug = window.EduMindDebug || {
        state: 'boot',
        sceneKey: '',
        events: [],
        tappables: [],
        specReady: false,
        version: this.VERSION,
      };

      let spec = rawSpec;
      if (typeof spec === 'string') {
        try { spec = JSON.parse(spec); } catch (e) { spec = null; }
      }
      if (!spec) {
        document.body.innerHTML =
          '<div style="color:#19725E;font-family:sans-serif;padding:40px;text-align:center">' +
          '<h2>EduMind shell</h2><p>No GameSpec injected. Open this shell through the preview harness, the backend, or the app.</p></div>';
        return;
      }
      this.spec = spec;
      this.stub = !!spec.stub;
      window.EduMindDebug.specReady = !this.stub;

      document.documentElement.setAttribute('dir', spec.meta.language === 'ar' ? 'rtl' : 'ltr');
      document.documentElement.setAttribute('lang', spec.meta.language);

      // Listen for host messages (web iframe path).
      window.addEventListener('message', (e) => {
        const d = e && e.data;
        if (!d || d.source !== 'EduMindHost') return;
        if (d.type === 'spec') this.receiveSpec(d.payload);
        if (d.type === 'generationFailed') this.generationFailed();
        if (d.type === 'mute') GameFeel.audio.setMuted(!!d.payload);
      });

      const fontSpecs = this.isRTL
        ? ['700 28px Tajawal', '800 40px Tajawal']
        : ['700 24px Nunito', '800 40px Nunito'];

      const startGame = () => {
        const scenes = [
          createIntroScene(gameDef),
          gameDef.createGameScene(BaseGameScene),
          createEndScene(gameDef),
        ];
        this.game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: 'game-container',
          backgroundColor: '#FDF2E2',
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: W,
            height: H,
          },
          scene: scenes,
        });
        // First user gesture unlocks audio (mobile WebView policy).
        const unlock = () => {
          GameFeel.audio.ensure();
          window.removeEventListener('pointerdown', unlock);
        };
        window.addEventListener('pointerdown', unlock);
        this.bridge.reportEvent('boot', {
          gameType: spec.meta.gameType,
          stub: this.stub,
          language: spec.meta.language,
        });
      };

      Promise.all(fontSpecs.map((f) => document.fonts.load(f).catch(() => null)))
        .then(() => document.fonts.ready)
        .then(startGame, startGame);
    },

    newSession() {
      this.session = {
        xp: 0,
        correct: 0,
        recovered: 0, // solved after a supportive retry
        presented: 0,
        combo: 0,
        maxCombo: 0,
        strain: 0, // consecutive not-first-try items (break trigger)
        items: [], // {id, levelIndex, correct, recovered, attempts, hintsUsed, concepts, difficulty}
        levelScores: [],
        startedAt: Date.now(),
        mastery: false,
      };
      this.engine = new AdaptiveEngine(this.spec.meta.difficulty);
      return this.session;
    },
  };

  // ------------------------------------------------------- AdaptiveEngine
  /**
   * Correctness-only difficulty steering. Hints and combos are explicitly
   * not inputs (XP/visual juice respectively) — same isolation rule as v3.
   */
  class AdaptiveEngine {
    constructor(difficulty) {
      this.target = ADAPT.start[difficulty] == null ? ADAPT.start.normal : ADAPT.start[difficulty];
      this.winStreak = 0;
      this.lossStreak = 0;
      this.levelScores = [];
    }

    /** Pick `count` items from the level pool, nearest to the current target band. */
    pickItems(pool, count) {
      const n = Math.min(count == null ? ADAPT.perLevel : count, pool.length);
      const scored = pool
        .map((item, i) => ({ item, i, d: Math.abs(item.difficulty - this.target) + Math.random() * 0.15 }))
        .sort((a, b) => a.d - b.d || a.i - b.i)
        .slice(0, n)
        .sort((a, b) => a.item.difficulty - b.item.difficulty); // ease in
      return scored.map((s) => s.item);
    }

    recordAnswer(correct) {
      if (correct) {
        this.winStreak++;
        this.lossStreak = 0;
        if (this.winStreak >= ADAPT.streak) {
          this.target = Math.min(ADAPT.max, this.target + ADAPT.step);
          this.winStreak = 0;
        }
      } else {
        this.lossStreak++;
        this.winStreak = 0;
        if (this.lossStreak >= ADAPT.streak) {
          this.target = Math.max(ADAPT.min, this.target - ADAPT.step);
          this.lossStreak = 0;
        }
      }
    }

    recordLevel(ratio) {
      this.levelScores.push(ratio);
    }

    rampDown() {
      this.target = Math.max(ADAPT.min, this.target - 1);
    }

    isMastery() {
      const s = this.levelScores;
      if (!s.length) return false;
      if (s[s.length - 1] >= ADAPT.masteryFinal) return true;
      for (let i = 0; i + ADAPT.masteryRun <= s.length; i++) {
        if (s.slice(i, i + ADAPT.masteryRun).every((x) => x >= ADAPT.masteryRunScore)) return true;
      }
      return false;
    }

    isFrustrated() {
      const s = this.levelScores;
      if (s.length < ADAPT.frustration) return false;
      return s.slice(-ADAPT.frustration).every((x) => x < ADAPT.frustrationScore);
    }
  }
  EduCore.AdaptiveEngine = AdaptiveEngine;

  // ------------------------------------------------------- BaseGameScene
  /**
   * The shared Teach → Practice session loop. Game shells subclass this and
   * implement: buildStage(), runTutorial(), presentItem(item, api),
   * and may override levelTransition(), bossIntro(), narrativeMoment().
   */
  class BaseGameScene extends Phaser.Scene {
    constructor() {
      super({ key: 'GameScene' });
    }

    create() {
      window.EduMindDebug.sceneKey = 'GameScene';
      EduCore.setState('boot');
      EduCore.setTappables([]);
      this.feel = GameFeel.attach(this);
      this.uiDepth = 800;
      EduCore.newSession();
      EduCore.reportLearning('experience_started', {
        topic: EduCore.spec.meta.topic || null,
        language: EduCore.spec.meta.language,
        sessionLength: EduCore.spec.meta.sessionLength || null,
      });
      this.buildStage();
      this.buildHud();
      this.beginSession().catch((err) => {
        if (err && err.message === 'generation_failed') this.showGenerationFailed();
        else console.error(err);
      });
    }

    // --------------------------------------------------------------- HUD
    buildHud() {
      const rtl = EduCore.isRTL;
      const edgeX = (x) => (rtl ? W - x : x); // HUD sides swap in RTL

      this.hud = this.add.container(0, 0).setDepth(this.uiDepth);

      // XP pill
      this.hudXpBg = this.add.graphics();
      const pillX = edgeX(86) - 66, pillY = 18;
      this.hudXpBg.fillStyle(PALETTE.deepTeal, 0.14);
      this.hudXpBg.fillRoundedRect(pillX, pillY, 132, 44, 22); // radius must be ≤ h/2 in Phaser 4
      this.hudXpText = this.add.text(edgeX(86), 40, '0 ' + EduCore.t('xp'),
        EduCore.textStyle(24, { weight: '800', color: '#EF9722', align: 'center' })).setOrigin(0.5);

      // Combo flame text (visual juice ONLY)
      this.comboText = this.add.text(W / 2, 40, '',
        EduCore.textStyle(26, { weight: '800', color: '#EF9722', align: 'center', stroke: '#FDF2E2' }))
        .setOrigin(0.5).setAlpha(0);

      this.hud.add([this.hudXpBg, this.hudXpText, this.comboText]);

      // Nahla the bee is NOT HUD furniture: she appears only as a brief
      // success celebration (level/session complete) via beeCelebration().

      // Interest companion idles near the HUD.
      const interest = EduCore.spec.student.interest;
      if (interest) {
        this.companion = new Companion(this, edgeX(W - 200), 44, interest, EduCore.accentInt);
        this.companion.setScale(0.62).setDepth(this.uiDepth);
      }
    }

    refreshHud() {
      const s = EduCore.session;
      this.hudXpText.setText(EduCore.fmtNum(s.xp) + ' ' + EduCore.t('xp'));
    }

    /**
     * Brief, non-blocking Nahla celebration: fly in, rejoice, fly out
     * (~2.2s). The ONLY way the bee appears during play — never persistent,
     * never blocking, never sharing a moment with Hudhud.
     */
    beeCelebration(kind) {
      const fromX = EduCore.isRTL ? -60 : W + 60;
      const bee = new Bee(this, fromX, 190, { accent: EduCore.accentInt, scale: 0.9 });
      bee.setDepth(this.uiDepth + 55);
      this.tweens.add({
        targets: bee, x: W / 2 + (EduCore.isRTL ? -110 : 110), duration: 420, ease: 'Cubic.easeOut',
        onComplete: () => bee.react(kind || 'levelComplete'),
      });
      this.time.delayedCall(1800, () => {
        this.tweens.add({
          targets: bee, x: fromX, alpha: 0, duration: 400, ease: 'Cubic.easeIn',
          onComplete: () => bee.destroy(),
        });
      });
    }

    // ------------------------------------------------------------ session
    async beginSession() {
      const spec = EduCore.spec;
      const total = spec.meta.sessionLength;

      // Level 0 — the built-in tutorial. Needs no generated content.
      await this.runLevelShell(0, async () => {
        EduCore.setState('tutorial');
        await this.runTutorial();
      });

      // Educational levels (may still be generating — progressive start).
      for (let li = 1; li < total; li++) {
        if (!EduCore.specReady()) await this.waitingRoom();
        const level = EduCore.spec.levels[li];
        if (!level) break; // spec shorter than promised — fail soft
        await this.runLevelShell(li, async () => {
          await this.teachPhase(level);
          await this.practicePhase(level, li);
        });
        if (EduCore.engine.isFrustrated()) await this.gentleRampDown();
      }

      this.finishSession();
    }

    /** Level card in → body → level clear card. levelStart returns a Promise
     *  and the body AWAITS it — the v3 "question under the intro card" bug fix. */
    async runLevelShell(levelIndex, body) {
      const spec = EduCore.spec;
      const level = spec.levels[levelIndex];
      const title = level ? level.title : EduCore.t('intro'); // stub specs carry no levels yet
      EduCore.currentLearningLevel = level && level.learningLevel ? level.learningLevel : null;
      EduCore.bridge.reportEvent('level_start', { index: levelIndex, title });

      await this.levelTransition(levelIndex);
      await this.levelStart(levelIndex, title);
      const before = EduCore.session;
      const correctBefore = before.correct;
      const presentedBefore = before.presented;

      await body();

      const presented = before.presented - presentedBefore;
      const ratio = presented > 0 ? (before.correct - correctBefore) / presented : 1;
      if (levelIndex > 0) {
        EduCore.engine.recordLevel(ratio);
        EduCore.session.levelScores.push(ratio);
      }
      before.xp += XP.level;
      this.refreshHud();
      EduCore.bridge.reportLevel({ index: levelIndex, title, ratio, xp: before.xp });
      if (levelIndex > 0) {
        EduCore.reportLearning('level_completed', { index: levelIndex, ratio, xp: before.xp });
      }
      await this.levelEnd(levelIndex, ratio);
    }

    /** Animated level intro card. RESOLVES only when dismissed. */
    levelStart(levelIndex, title) {
      EduCore.setState('levelStart');
      const isIntro = levelIndex === 0;
      const total = EduCore.spec.meta.sessionLength;
      const label = isIntro
        ? EduCore.t('intro')
        : EduCore.t('levelOf', { n: EduCore.fmtNum(levelIndex), total: EduCore.fmtNum(total - 1) });

      return new Promise((resolve) => {
        const c = this.add.container(0, 0).setDepth(this.uiDepth + 50);
        const dim = this.add.rectangle(W / 2, H / 2, W, H, PALETTE.deepTeal, 0.45);
        const panel = GameFeel.cardPanel(this, W / 2, H / 2 - 40, 560, 250, { color: PALETTE.sand });
        const small = this.add.text(W / 2, H / 2 - 110, label,
          EduCore.textStyle(26, { weight: '800', color: '#079A90', align: 'center' })).setOrigin(0.5);
        const big = this.add.text(W / 2, H / 2 - 40, title,
          EduCore.textStyle(38, { weight: '800', color: '#19725E', align: 'center', wrap: 500 })).setOrigin(0.5);
        const tap = this.add.text(W / 2, H / 2 + 62, EduCore.t('tapToContinue'),
          EduCore.textStyle(24, { weight: '700', color: '#B5702F', align: 'center' })).setOrigin(0.5);
        c.add([dim, panel, small, big, tap]);
        c.setAlpha(0);

        this.tweens.add({ targets: c, alpha: 1, duration: 240, ease: 'Cubic.easeOut' });
        this.tweens.add({ targets: tap, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
        GameFeel.audio.sting(EduCore.spec.meta.theme);

        const zone = this.add.zone(W / 2, H / 2, W, H).setInteractive().setDepth(this.uiDepth + 51);
        zone.once('pointerdown', () => {
          zone.destroy();
          this.tweens.add({
            targets: c,
            alpha: 0,
            duration: 200,
            onComplete: () => { c.destroy(); resolve(); },
          });
        });
      });
    }

    /** Level-clear moment: real celebration, then TAP TO CONTINUE (never auto). */
    levelEnd(levelIndex, ratio) {
      EduCore.setState('levelEnd');
      return new Promise((resolve) => {
        this.feel.celebrate();
        this.beeCelebration('levelComplete'); // the celebration is Nahla's moment alone
        if (this.companion) this.companion.celebrate();

        const c = this.add.container(0, 0).setDepth(this.uiDepth + 50);
        const dim = this.add.rectangle(W / 2, H / 2, W, H, PALETTE.deepTeal, 0.55);
        const txt = this.add.text(W / 2, H / 2 - 60, EduCore.t('levelClear'),
          EduCore.textStyle(46, { weight: '800', color: '#EF9722', align: 'center', stroke: '#FDF2E2' })).setOrigin(0.5);
        const sub = this.add.text(W / 2, H / 2 + 6, '+' + EduCore.fmtNum(XP.level) + ' ' + EduCore.t('xp'),
          EduCore.textStyle(30, { weight: '800', color: '#FDF2E2', align: 'center' })).setOrigin(0.5);
        const tap = this.add.text(W / 2, H / 2 + 90, EduCore.t('tapToContinue'),
          EduCore.textStyle(24, { color: '#CEEBF0', align: 'center' })).setOrigin(0.5);
        c.add([dim, txt, sub, tap]);
        c.setAlpha(0);
        txt.setScale(0.5);
        this.tweens.add({ targets: c, alpha: 1, duration: 220 });
        this.tweens.add({ targets: txt, scale: 1, duration: 420, ease: 'Back.easeOut' });
        this.tweens.add({ targets: tap, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });

        const zone = this.add.zone(W / 2, H / 2, W, H).setInteractive().setDepth(this.uiDepth + 51);
        zone.once('pointerdown', () => {
          zone.destroy();
          this.tweens.add({ targets: c, alpha: 0, duration: 180, onComplete: () => { c.destroy(); resolve(); } });
        });
      });
    }

    // -------------------------------------------------------- teach phase
    /**
     * Teach cards: in-theme, tap-to-advance (never auto), key terms
     * highlighted in the student's color. Games may set this.teachStyle
     * { speaker, panelColor } to flavor the presenter.
     */
    async teachPhase(level) {
      EduCore.setState('teach');
      for (let i = 0; i < level.teaching.length; i++) {
        await this.showTeachCard(level.teaching[i], i, level.teaching.length);
      }
    }

    showTeachCard(card, index, totalCards) {
      const style = this.teachStyle || {};
      return new Promise((resolve) => {
        const c = this.add.container(0, 0).setDepth(this.uiDepth + 40);
        const dim = this.add.rectangle(W / 2, H / 2, W, H, PALETTE.deepTeal, 0.4).setInteractive();
        const panelH = 430;
        const py = H - panelH / 2 - 36;
        const panel = GameFeel.cardPanel(this, W / 2, py, 656, panelH, {
          color: style.panelColor == null ? PALETTE.sand : style.panelColor,
          stroke: EduCore.accentInt, strokeWidth: 3,
        });

        // Hudhud presents every teach card — the guide teaches.
        const mascot = new Hoopoe(this, EduCore.isRTL ? W - 96 : 96, py - panelH / 2 - 8, {
          accent: EduCore.accentInt, scale: 0.7,
        });
        mascot.setExpression('happy');

        const titleTxt = this.add.text(W / 2, py - panelH / 2 + 46,
          (style.speaker || EduCore.t('teachTitle')) + '  ' + EduCore.fmtNum(index + 1) + '/' + EduCore.fmtNum(totalCards),
          EduCore.textStyle(24, { weight: '800', color: '#079A90', align: 'center' })).setOrigin(0.5);

        const bodyTxt = this.add.text(W / 2, py - panelH / 2 + 88, '',
          EduCore.textStyle(28, { color: '#19725E', align: EduCore.isRTL ? 'right' : 'left', wrap: 580, lineSpacing: 9 }))
          .setOrigin(0.5, 0);

        const tap = this.add.text(W / 2, py + panelH / 2 - 40, EduCore.t('tapToContinue'),
          EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5).setAlpha(0);

        c.add([dim, panel, titleTxt, bodyTxt, tap, mascot]);
        c.setAlpha(0);
        this.tweens.add({ targets: c, alpha: 1, duration: 240 });

        this.feel.typewriter(bodyTxt, card.text, { cps: 42, skipOn: dim }).then(() => {
          this.highlightEmphasis(c, card, py + panelH / 2 - 96);
          this.tweens.add({ targets: tap, alpha: 1, duration: 250 });
          this.tweens.add({ targets: tap, alpha: 0.4, duration: 600, yoyo: true, repeat: -1, delay: 250 });
          dim.once('pointerdown', () => {
            this.tweens.add({
              targets: c, alpha: 0, duration: 200,
              onComplete: () => { mascot.destroy(); c.destroy(); resolve(); },
            });
          });
        });
      });
    }

    /**
     * Key-term chips in the student's color, laid out as a centered row at
     * the bottom of the teach card. Phaser Text has no rich spans, so chips
     * beat fragile underline hacks. Owned by the card container — they leave
     * with it.
     */
    highlightEmphasis(container, card, rowY) {
      if (!card.emphasis || !card.emphasis.length) return;
      const gapX = 12;
      const maxRow = 600;
      const made = [];
      let totalW = 0;
      const chipInk = '#' + GameFeel.contrastOn(EduCore.accentInt).toString(16).padStart(6, '0');
      for (const term of card.emphasis.slice(0, 3)) {
        const chip = this.add.text(0, 0, term, EduCore.textStyle(24, {
          weight: '800', color: chipInk, align: 'center',
        })).setOrigin(0.5);
        const w = chip.width + 34;
        if (totalW + w > maxRow) { chip.destroy(); break; }
        made.push({ chip, w, h: chip.height + 12 });
        totalW += w + gapX;
      }
      if (!made.length) return;
      totalW -= gapX;
      let x = W / 2 - totalW / 2;
      made.forEach(({ chip, w, h }, i) => {
        const cx = x + w / 2;
        x += w + gapX;
        const bg = this.add.graphics();
        bg.fillStyle(EduCore.accentInt, 1);
        bg.fillRoundedRect(cx - w / 2, rowY - h / 2, w, h, Math.min(16, h / 2));
        chip.setPosition(cx, rowY);
        bg.setAlpha(0); chip.setAlpha(0);
        container.add([bg, chip]);
        this.tweens.add({ targets: [bg, chip], alpha: 1, duration: 220, delay: i * 90, ease: 'Cubic.easeOut' });
      });
    }

    // ----------------------------------------------------- practice phase
    async practicePhase(level, levelIndex) {
      const items = EduCore.engine.pickItems(level.items, ADAPT.perLevel);
      for (const item of items) {
        await this.runItem(item, levelIndex);
        if (EduCore.session.strain >= ADAPT.strain) {
          EduCore.session.strain = 0;
          await this.takeABreak();
        }
      }
    }

    /**
     * One full item: present (game-specific), two-stage hints, and the
     * supportive retry loop — a wrong answer never costs anything; the
     * learner simply tries again with the next hint auto-offered, and after
     * the last attempt the answer is revealed with its explanation. Scoring,
     * mastery and the AdaptiveEngine all read FIRST-TRY correctness so
     * retries make the experience kinder without inflating progress.
     */
    async runItem(item, levelIndex) {
      EduCore.setState('question');
      const session = EduCore.session;
      session.presented++;
      let hintsUsed = 0;
      const startedAt = Date.now();

      const hintApi = this.buildHintButton(item, () => hintsUsed, (n) => { hintsUsed = n; });
      // One retry per available hint, then a supported reveal (hints are 1-2).
      const maxAttempts = 1 + Math.min(2, item.hints.length);
      let attempt = 0;
      let result = { correct: false };
      while (attempt < maxAttempts) {
        attempt++;
        hintApi.attempt = attempt;
        hintApi.lastAttempt = attempt === maxAttempts; // games reveal only now
        EduCore.setState('question');
        result = await this.presentItem(item, hintApi);
        EduCore.reportLearning('attempt_submitted', {
          itemId: item.id,
          attempt,
          outcome: result.correct ? 'correct' : 'incorrect',
          hintsUsed,
          // Six-beat flow position (try/practice/checkpoint) when the shell
          // runs one — null for the classic teach → practice loop.
          beat: this.currentBeat || null,
          ms: Date.now() - startedAt,
        });
        if (result.correct || result.final) break;
        session.combo = 0; // a miss breaks the combo even when recovered later
        if (attempt >= maxAttempts) break;
        await this.supportiveRetry(item, hintApi);
      }
      hintApi.destroy();

      const solved = !!result.correct;
      const firstTry = solved && attempt === 1;
      // Recovered = worked it out after stumbling: solved on a retry, or a
      // completion mechanic (final) finished despite wrong tries along the
      // way — the learner still got there, which is a win, just not first-try.
      const recovered = (solved && attempt > 1) || (!solved && !!result.completed);
      session.items.push({
        id: item.id,
        kind: item.kind,
        levelIndex,
        correct: firstTry,
        recovered,
        attempts: attempt,
        hintsUsed,
        beat: this.currentBeat || null,
        concepts: item.concepts,
        difficulty: item.difficulty,
        prompt: item.prompt,
      });

      if (firstTry) {
        session.correct++;
        session.strain = 0;
        session.combo++;
        session.maxCombo = Math.max(session.maxCombo, session.combo);
        const gained = hintsUsed === 0 ? XP.noHint : hintsUsed === 1 ? XP.oneHint : XP.twoHints;
        session.xp += gained;
        GameFeel.audio.correctChain(session.combo);
        if (this.companion && session.combo >= 2) this.companion.celebrate();
        this.feel.popText(W / 2, H * 0.42, '+' + EduCore.fmtNum(gained) + ' ' + EduCore.t('xp'), { color: '#EF9722' });
        if (session.combo >= 2) this.showCombo(session.combo);
      } else if (recovered) {
        // Working it out on a retry is a real win — celebrated, smaller.
        session.recovered++;
        session.strain++;
        session.xp += XP.retry;
        GameFeel.audio.correctChain(1);
        this.feel.popText(W / 2, H * 0.42,
          EduCore.t('solvedIt') + '  +' + EduCore.fmtNum(XP.retry) + ' ' + EduCore.t('xp'),
          { color: '#EF9722', size: 28 });
      } else {
        session.strain++;
        GameFeel.audio.wrongTone();
        // Gentle moments belong to the hoopoe; the bee never goes sad.
        if (this.guide) this.guide.react('wrong');
        this.feel.popText(W / 2, H * 0.42, EduCore.t('encourage'), { color: '#B5702F', size: 28 });
        EduCore.reportLearning('misconception_detected', {
          itemId: item.id,
          signal: 'unresolved_after_retries',
          attempts: attempt,
          concepts: item.concepts,
        });
      }
      this.refreshHud();

      // Engine sees FIRST-TRY correctness ONLY (hints, combo and retries are
      // excluded by design — kindness must not steer difficulty upward).
      EduCore.engine.recordAnswer(firstTry);

      EduCore.bridge.reportScore({
        xp: session.xp,
        correct: session.correct,
        presented: session.presented,
        combo: session.combo,
        itemId: item.id,
        wasCorrect: firstTry,
        recovered,
        attempts: attempt,
        hintsUsed,
      });

      // Getting there (even with stumbles) earns the celebratory frame.
      await this.showExplanation(item, solved || recovered);
    }

    /** Between attempts: warm feedback + the next hint rung, auto-offered. */
    supportiveRetry(item, hintApi) {
      GameFeel.audio.wrongTone();
      if (this.guide) this.guide.react('wrong');
      this.feel.popText(W / 2, H * 0.42, EduCore.t('tryAgain'), { color: '#B5702F', size: 28 });
      return hintApi.autoHint();
    }

    showCombo(combo) {
      this.comboText.setText(EduCore.t('combo', { n: EduCore.fmtNum(combo) }));
      this.comboText.setAlpha(1).setScale(0.6);
      this.tweens.add({ targets: this.comboText, scale: 1, duration: 300, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.comboText, alpha: 0, delay: 1100, duration: 300 });
      if (combo >= 4) {
        this.feel.sparkle(W / 2, 80, 0xef9722, 8);
      }
    }

    /** Two-stage hint button. Hint 1 nudges; hint 2 narrows via game callback.
     *  Games set this.hintPos / this.hintBubbleY to place it in their layout.
     *  The retry loop can auto-offer the next rung between attempts; because
     *  a re-presented item registers a FRESH onNarrow callback, narrowing
     *  requested between attempts is deferred until that registration. */
    buildHintButton(item, getUsed, setUsed) {
      const rtl = EduCore.isRTL;
      const scene = this;
      const pos = this.hintPos || { x: rtl ? 70 : W - 70, y: H - 64 };
      const btn = GameFeel.candyButton(this, pos.x, pos.y, 96, 64, '💡', {
        color: PALETTE.teal, fontSize: 30,
      });
      btn.setDepth(this.uiDepth + 10);
      const maxHints = Math.min(2, item.hints.length);
      let narrowCb = null;
      let narrowWanted = false;
      let bubble = null;

      const showBubble = (text) => {
        if (bubble) bubble.destroy();
        bubble = this.add.container(0, 0).setDepth(this.uiDepth + 30);
        const tx = this.add.text(W / 2, this.hintBubbleY == null ? H - 158 : this.hintBubbleY, text,
          EduCore.textStyle(25, { color: '#19725E', align: 'center', wrap: 520 })).setOrigin(0.5);
        const pad = 20;
        const bg = this.add.graphics();
        bg.fillStyle(PALETTE.peach, 0.98);
        bg.fillRoundedRect(W / 2 - tx.width / 2 - pad, tx.y - tx.height / 2 - pad * 0.6,
          tx.width + pad * 2, tx.height + pad * 1.2, 18);
        bubble.add([bg, tx]);
        bubble.setAlpha(0);
        this.tweens.add({ targets: bubble, alpha: 1, duration: 200 });
        this.time.delayedCall(5200, () => {
          if (bubble) {
            this.tweens.add({
              targets: bubble, alpha: 0, duration: 250,
              onComplete: () => { if (bubble) { bubble.destroy(); bubble = null; } },
            });
          }
        });
      };

      const applyHint = (auto) => {
        const used = getUsed();
        if (used >= maxHints) return false;
        if (this.guide) this.guide.react('hint'); // crest fans — an idea strikes!
        EduCore.bridge.reportEvent('hint_used', { itemId: item.id, hint: used + 1 });
        if (!auto) {
          EduCore.reportLearning('hint_requested', { itemId: item.id, rung: used + 1 });
        }
        EduCore.reportLearning('hint_shown', { itemId: item.id, rung: used + 1, auto: !!auto });
        showBubble(item.hints[used]);
        if (used + 1 === 2) {
          narrowWanted = true;
          if (narrowCb) narrowCb(); // game-specific narrowing
        }
        setUsed(used + 1);
        if (used + 1 >= maxHints) btn.setEnabled(false);
        return true;
      };

      btn.onTap = () => applyHint(false);

      return {
        button: btn,
        attempt: 1,
        onNarrow(cb) {
          narrowCb = cb;
          if (narrowWanted) cb(); // narrowing owed from an auto-hint between attempts
        },
        /** Auto-offer the next rung (retry support); resolves after a beat. */
        autoHint() {
          applyHint(true);
          return new Promise((resolve) => scene.time.delayedCall(1100, resolve));
        },
        destroy: () => {
          if (bubble) bubble.destroy();
          btn.destroy();
        },
      };
    }

    /** Explanation always shows — celebratory frame when right, gentle when wrong. */
    showExplanation(item, correct) {
      EduCore.setState('feedback');
      return new Promise((resolve) => {
        const head = correct ? EduCore.t('correct') : EduCore.t('wrong');
        const frameColor = correct ? PALETTE.leaf : PALETTE.sky;
        const c = this.add.container(0, 0).setDepth(this.uiDepth + 40);
        const panelH = 320;
        const py = H - panelH / 2 - 28;
        const dim = this.add.rectangle(W / 2, H / 2, W, H, PALETTE.deepTeal, 0.35).setInteractive();
        const panel = GameFeel.cardPanel(this, W / 2, py, 660, panelH, {
          color: PALETTE.sand, stroke: frameColor, strokeWidth: 5,
        });
        const headTxt = this.add.text(W / 2, py - panelH / 2 + 44, (correct ? '✓ ' : '') + head,
          EduCore.textStyle(32, { weight: '800', color: correct ? '#4D8C58' : '#079A90', align: 'center' })).setOrigin(0.5);
        const body = this.add.text(W / 2, py - panelH / 2 + 86, item.explanation,
          EduCore.textStyle(26, { color: '#19725E', align: 'center', wrap: 590, lineSpacing: 8 })).setOrigin(0.5, 0);
        const tap = this.add.text(W / 2, py + panelH / 2 - 36, EduCore.t('tapToContinue'),
          EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5);
        c.add([dim, panel, headTxt, body, tap]);
        c.setY(60).setAlpha(0);
        this.tweens.add({ targets: c, y: 0, alpha: 1, duration: 280, ease: 'Back.easeOut' });
        this.tweens.add({ targets: tap, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
        if (correct) this.feel.sparkle(W / 2, py - panelH / 2, 0x84a253, 8);

        dim.once('pointerdown', () => {
          this.tweens.add({
            targets: c, alpha: 0, y: 40, duration: 200,
            onComplete: () => { c.destroy(); resolve(); },
          });
        });
      });
    }

    // ---------------------------------------------- supportive break room
    /** Strain-triggered (never hearts, never a fail screen): breathe, then
     *  continue with genuinely easier picks. Nothing is lost or refilled. */
    takeABreak() {
      EduCore.setState('break');
      EduCore.bridge.reportEvent('take_a_break');
      return new Promise((resolve) => {
        const c = this.add.container(0, 0).setDepth(this.uiDepth + 60);
        const dim = this.add.rectangle(W / 2, H / 2, W, H, PALETTE.deepTeal, 0.92).setInteractive();
        const mascot = new Hoopoe(this, W / 2, H * 0.3, { accent: EduCore.accentInt, scale: 1.3 });
        mascot.setExpression('happy');
        const title = this.add.text(W / 2, H * 0.46, EduCore.t('takeABreak'),
          EduCore.textStyle(42, { weight: '800', color: '#FDF2E2', align: 'center' })).setOrigin(0.5);
        const body = this.add.text(W / 2, H * 0.55, EduCore.t('breakBody', { name: EduCore.spec.student.name }),
          EduCore.textStyle(27, { color: '#CEEBF0', align: 'center', wrap: 560, lineSpacing: 8 })).setOrigin(0.5);
        // Breathing circle — inhale… exhale…
        const circle = this.add.graphics({ x: W / 2, y: H * 0.7 });
        circle.fillStyle(EduCore.accentInt, 0.35);
        circle.fillCircle(0, 0, 52);
        const breathe = this.tweens.add({ targets: circle, scale: 1.5, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        const btn = GameFeel.candyButton(this, W / 2, H * 0.86, 360, 86, EduCore.t('keepGoing'), {
          color: PALETTE.green, arabic: EduCore.isRTL,
          onTap: () => {
            breathe.stop();
            EduCore.engine.rampDown(); // genuinely easier next picks
            this.refreshHud();
            this.tweens.add({
              targets: c, alpha: 0, duration: 240,
              onComplete: () => { mascot.destroy(); c.destroy(); resolve(); },
            });
          },
        });
        c.add([dim, title, body, circle, btn, mascot]);
        c.setAlpha(0);
        this.tweens.add({ targets: c, alpha: 1, duration: 300 });
      });
    }

    async gentleRampDown() {
      EduCore.engine.rampDown();
      const msg = EduCore.t('encourage', { name: EduCore.spec.student.name });
      this.feel.popText(W / 2, H * 0.3, msg, { color: '#079A90', size: 26 });
      if (this.mascot) this.mascot.react('correct');
    }

    // -------------------------------------------- progressive-start waits
    /** Mascot "thinking" mini-scene with a tip carousel while the spec bakes. */
    waitingRoom() {
      EduCore.setState('waiting');
      EduCore.bridge.reportEvent('waiting_for_spec');
      return new Promise((resolve, reject) => {
        const c = this.add.container(0, 0).setDepth(this.uiDepth + 60);
        const dim = this.add.rectangle(W / 2, H / 2, W, H, PALETTE.deepTeal, 0.94).setInteractive();
        // The scout is out scouting — Hudhud paces while questions are found.
        const mascot = new Hoopoe(this, W / 2, H * 0.32, { accent: EduCore.accentInt, scale: 1.35 });
        mascot.setExpression('thinking');
        // pacing left-right
        const pace = this.tweens.add({
          targets: mascot, x: { from: W / 2 - 70, to: W / 2 + 70 },
          duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        const title = this.add.text(W / 2, H * 0.5, EduCore.t('waitingTitle'),
          EduCore.textStyle(36, { weight: '800', color: '#FDF2E2', align: 'center' })).setOrigin(0.5);
        const sub = this.add.text(W / 2, H * 0.565, EduCore.t('waitingBody'),
          EduCore.textStyle(25, { color: '#CEEBF0', align: 'center' })).setOrigin(0.5);
        const tip = this.add.text(W / 2, H * 0.7, '',
          EduCore.textStyle(25, { color: '#FADBB0', align: 'center', wrap: 540, lineSpacing: 7 })).setOrigin(0.5);

        const tips = STRINGS.tips[EduCore.lang] || STRINGS.tips.en;
        let ti = 0;
        const showTip = () => {
          tip.setText('💡 ' + tips[ti % tips.length]);
          tip.setAlpha(0);
          this.tweens.add({ targets: tip, alpha: 1, duration: 350 });
          ti++;
        };
        showTip();
        const carousel = this.time.addEvent({ delay: 3800, loop: true, callback: showTip });

        const dots = [];
        for (let i = 0; i < 3; i++) {
          const d = this.add.circle(W / 2 - 30 + i * 30, H * 0.6, 7, PALETTE.sky, 0.9);
          this.tweens.add({ targets: d, y: d.y - 12, duration: 380, yoyo: true, repeat: -1, delay: i * 130, ease: 'Sine.easeInOut' });
          dots.push(d);
        }

        c.add([dim, title, sub, tip, mascot, ...dots]);
        c.setAlpha(0);
        this.tweens.add({ targets: c, alpha: 1, duration: 300 });

        const cleanup = () => {
          pace.stop();
          carousel.remove();
          this.tweens.add({
            targets: c, alpha: 0, duration: 260,
            onComplete: () => { mascot.destroy(); c.destroy(); },
          });
        };
        EduCore.waitForSpec().then(() => { cleanup(); resolve(); },
          (err) => { cleanup(); reject(err); });
      });
    }

    /** Generation failed → friendly mascot apology + one-tap retry (host handles). */
    showGenerationFailed() {
      EduCore.setState('failed');
      const c = this.add.container(0, 0).setDepth(this.uiDepth + 70);
      const dim = this.add.rectangle(W / 2, H / 2, W, H, PALETTE.deepTeal, 0.96).setInteractive();
      const mascot = new Hoopoe(this, W / 2, H * 0.32, { accent: EduCore.accentInt, scale: 1.35 });
      mascot.setExpression('sad');
      this.time.delayedCall(1200, () => mascot.active && mascot.setExpression('idle'));
      const title = this.add.text(W / 2, H * 0.5, EduCore.t('failedTitle'),
        EduCore.textStyle(34, { weight: '800', color: '#FDF2E2', align: 'center', wrap: 560 })).setOrigin(0.5);
      const body = this.add.text(W / 2, H * 0.57, EduCore.t('failedBody'),
        EduCore.textStyle(26, { color: '#CEEBF0', align: 'center', wrap: 540 })).setOrigin(0.5);
      const btn = GameFeel.candyButton(this, W / 2, H * 0.72, 340, 86, EduCore.t('retry'), {
        color: PALETTE.blue, arabic: EduCore.isRTL,
        onTap: () => EduCore.bridge.reportEvent('retry_requested'),
      });
      c.add([dim, title, body, btn, mascot]);
    }

    // ------------------------------------------------------------- finish
    finishSession() {
      const s = EduCore.session;
      EduCore.currentLearningLevel = null; // session-level events carry no rung
      s.mastery = EduCore.engine.isMastery();
      if (s.mastery) s.xp += XP.mastery;

      const concepts = {};
      for (const it of s.items) {
        for (const cn of it.concepts) {
          concepts[cn] = concepts[cn] || { correct: 0, total: 0, hints: 0 };
          concepts[cn].total++;
          if (it.correct) concepts[cn].correct++;
          concepts[cn].hints += it.hintsUsed;
        }
      }

      const summary = {
        gameType: EduCore.spec.meta.gameType,
        topic: EduCore.spec.meta.topic,
        language: EduCore.spec.meta.language,
        xp: s.xp,
        correct: s.correct,
        recovered: s.recovered,
        presented: s.presented,
        accuracy: s.presented ? s.correct / s.presented : 0,
        maxCombo: s.maxCombo,
        mastery: s.mastery,
        levelScores: s.levelScores,
        durationMs: Date.now() - s.startedAt,
        items: s.items,
        concepts,
      };
      EduCore.lastSummary = summary;
      EduCore.reportLearning('experience_completed', {
        xp: s.xp,
        accuracy: summary.accuracy,
        mastery: s.mastery,
        recovered: s.recovered,
        durationMs: summary.durationMs,
      });
      EduCore.bridge.reportSummary(summary);
      this.scene.start('EndScene');
    }

    // ----------------------------------------------------- override hooks
    buildStage() { /* implemented by each game */ }
    async runTutorial() { /* implemented by each game */ }
    async presentItem() { return { correct: true }; } // implemented by each game
    levelTransition(levelIndex) {
      // Default: quick camera wipe via fade — games override with style.
      return new Promise((resolve) => {
        this.cameras.main.fadeOut(140, 253, 242, 226);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.cameras.main.fadeIn(180, 253, 242, 226);
          resolve();
        });
      });
    }
  }
  EduCore.BaseGameScene = BaseGameScene;

  // ----------------------------------------------------------- IntroScene
  function createIntroScene(gameDef) {
    return class IntroScene extends Phaser.Scene {
      constructor() { super({ key: 'IntroScene' }); }

      create() {
        window.EduMindDebug.sceneKey = 'IntroScene';
        EduCore.setState('menu');
        this.feel = GameFeel.attach(this);
        const spec = EduCore.spec;

        if (gameDef.buildMenuBackdrop) gameDef.buildMenuBackdrop(this);
        else this.add.rectangle(W / 2, H / 2, W, H, PALETTE.cream);
        // Soft cream wash over any backdrop so the deep-teal menu text stays
        // readable on every theme (light boards, fields and skies alike).
        this.add.rectangle(W / 2, H / 2, W, H, PALETTE.cream, 0.55);

        // Floating accent motes — ambient life on the menu.
        for (let i = 0; i < 7; i++) {
          const m = this.add.circle(Math.random() * W, 200 + Math.random() * 800, 3 + Math.random() * 4,
            EduCore.accentInt, 0.35);
          this.tweens.add({
            targets: m,
            y: m.y - 60 - Math.random() * 80,
            alpha: 0,
            duration: 4000 + Math.random() * 3000,
            repeat: -1,
            delay: Math.random() * 3000,
            onRepeat: () => { m.y = 900 + Math.random() * 250; m.alpha = 0.35; m.x = Math.random() * W; },
          });
        }

        // Hudhud fronts the adventure alone — the bee only ever appears as a
        // brief success celebration, never on the menu.
        this.mascot = new Hoopoe(this, W / 2, H * 0.3, { accent: EduCore.accentInt, scale: 1.7 });
        this.mascot.setExpression('happy');

        const hi = this.add.text(W / 2, H * 0.455, EduCore.t('hi', { name: spec.student.name }),
          EduCore.textStyle(30, { weight: '800', color: '#079A90', align: 'center' })).setOrigin(0.5);

        const title = this.add.text(W / 2, H * 0.535, spec.meta.topic,
          EduCore.textStyle(52, { weight: '800', color: '#19725E', align: 'center', wrap: 620 })).setOrigin(0.5);

        const sub = this.add.text(W / 2, H * 0.62, spec.meta.subject,
          EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5);

        const playBtn = GameFeel.candyButton(this, W / 2, H * 0.76, 380, 104, EduCore.t('play'), {
          color: EduCore.accentInt, arabic: EduCore.isRTL, fontSize: 38,
          onTap: () => {
            GameFeel.audio.sting(spec.meta.theme);
            this.cameras.main.fadeOut(220, 253, 242, 226);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene'));
          },
        });
        this.feel.breathe(playBtn); // CTA breathes — alive, not static

        if (spec.student.interest) {
          this.companion = new Companion(this, W / 2 + 150, H * 0.39, spec.student.interest, EduCore.accentInt);
          this.companion.setScale(0.8);
        }

        // mute toggle
        const mute = this.add.text(EduCore.isRTL ? 48 : W - 48, 48, '🔊',
          EduCore.textStyle(28, { align: 'center' })).setOrigin(0.5).setInteractive({ useHandCursor: true });
        mute.on('pointerdown', () => {
          GameFeel.audio.setMuted(!GameFeel.audio.muted);
          mute.setText(GameFeel.audio.muted ? '🔇' : '🔊');
        });

        this.feel.cascadeIn([hi, title, sub, playBtn]);
        EduCore.setTappables([
          { id: 'play', label: 'play', x: playBtn.x, y: playBtn.y, w: playBtn.btnWidth, h: playBtn.btnHeight },
        ]);
      }
    };
  }

  // ------------------------------------------------------------- EndScene
  function createEndScene(gameDef) {
    return class EndScene extends Phaser.Scene {
      constructor() { super({ key: 'EndScene' }); }

      create() {
        window.EduMindDebug.sceneKey = 'EndScene';
        EduCore.setState('summary');
        this.feel = GameFeel.attach(this);
        const spec = EduCore.spec;
        const sum = EduCore.lastSummary || { xp: 0, accuracy: 0, concepts: {}, mastery: false, items: [] };

        this.add.rectangle(W / 2, H / 2, W, H, PALETTE.cream);
        // gentle aurora ribbons (ambient)
        const ribbon = this.add.graphics();
        ribbon.fillStyle(EduCore.accentInt, 0.08);
        ribbon.fillEllipse(W / 2, 130, 900, 320);
        this.tweens.add({ targets: ribbon, x: { from: -40, to: 40 }, duration: 5200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        // The summary is the rewards moment — Nahla's alone. The bee and
        // Hudhud never share a moment: rewards are hers, guidance is his.
        this.bee = new Bee(this, W / 2, 168, { accent: EduCore.accentInt, scale: 1.35 });
        this.bee.setExpression('celebrating');
        this.time.delayedCall(400, () => {
          this.feel.celebrate();
          this.bee.react('mastery');
        });

        const title = this.add.text(W / 2, 300, EduCore.t('summaryTitle'),
          EduCore.textStyle(44, { weight: '800', color: '#19725E', align: 'center' })).setOrigin(0.5);

        if (sum.mastery) {
          const badge = this.add.container(W / 2, 366);
          const bg = this.add.graphics();
          bg.fillStyle(PALETTE.orange, 1);
          bg.fillRoundedRect(-120, -26, 240, 52, 26);
          const t = this.add.text(0, 0, '★ ' + EduCore.t('summaryMastery') + ' ★',
            EduCore.textStyle(26, { weight: '800', color: '#FFFFFF', align: 'center' })).setOrigin(0.5);
          badge.add([bg, t]);
          badge.setScale(0);
          this.tweens.add({ targets: badge, scale: 1, duration: 500, ease: 'Back.easeOut', delay: 500 });
          this.feel.breathe(badge, 0.04);
        }

        // XP count-up
        const xpText = this.add.text(W / 2, 446, '0 ' + EduCore.t('xp'),
          EduCore.textStyle(40, { weight: '800', color: '#EF9722', align: 'center' })).setOrigin(0.5);
        this.tweens.addCounter({
          from: 0, to: sum.xp, duration: 1100, ease: 'Cubic.easeOut',
          onUpdate: (tw) => xpText.setText(EduCore.fmtNum(Math.round(tw.getValue())) + ' ' + EduCore.t('xp')),
        });

        // accuracy ring
        const ringY = 446;
        const ringX = EduCore.isRTL ? W - 130 : 130;
        const ring = this.add.graphics({ x: ringX, y: ringY });
        const pct = Math.round((sum.accuracy || 0) * 100);
        this.tweens.addCounter({
          from: 0, to: pct, duration: 1100, ease: 'Cubic.easeOut', delay: 200,
          onUpdate: (tw) => {
            const v = tw.getValue();
            ring.clear();
            ring.lineStyle(10, PALETTE.sand, 1);
            ring.strokeCircle(0, 0, 46);
            ring.lineStyle(10, PALETTE.leaf, 1);
            ring.beginPath();
            ring.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * v) / 100, false);
            ring.strokePath();
          },
        });
        const pctText = this.add.text(ringX, ringY, EduCore.fmtNum(pct) + (EduCore.isRTL ? '٪' : '%'),
          EduCore.textStyle(24, { weight: '800', color: '#19725E', align: 'center' })).setOrigin(0.5);
        this.tweens.add({ targets: pctText, alpha: { from: 0, to: 1 }, duration: 400, delay: 300 });
        const accLabel = this.add.text(ringX, ringY + 72, EduCore.t('accuracy'),
          EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5);

        // Concept breakdown panel
        const concepts = Object.entries(sum.concepts || {}).slice(0, 5);
        const panelTop = 560;
        GameFeel.cardPanel(this, W / 2, panelTop + 130, 640, 280, { color: PALETTE.sand });
        this.add.text(W / 2, panelTop + 24, EduCore.t('conceptsTitle'),
          EduCore.textStyle(26, { weight: '800', color: '#079A90', align: 'center' })).setOrigin(0.5);
        concepts.forEach(([name, st], i) => {
          const y = panelTop + 66 + i * 38;
          const ok = st.correct / st.total >= 0.5;
          const lx = EduCore.isRTL ? W / 2 + 280 : W / 2 - 280;
          const icon = this.add.text(lx, y, ok ? '✓' : '○',
            EduCore.textStyle(24, { weight: '800', color: ok ? '#4D8C58' : '#EF9722', align: 'center' })).setOrigin(0.5);
          const nm = this.add.text(EduCore.isRTL ? lx - 30 : lx + 30, y, name,
            EduCore.textStyle(24, { color: '#19725E' })).setOrigin(EduCore.isRTL ? 1 : 0, 0.5);
          const score = this.add.text(EduCore.isRTL ? W / 2 - 280 : W / 2 + 280, y,
            EduCore.fmtNum(st.correct) + '/' + EduCore.fmtNum(st.total),
            EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5);
          [icon, nm, score].forEach((o) => {
            o.setAlpha(0);
            this.tweens.add({ targets: o, alpha: 1, duration: 240, delay: 600 + i * 110 });
          });
        });

        // Hint-usage growth note
        const hinted = concepts
          .filter(([, st]) => st.hints > 0)
          .sort((a, b) => b[1].hints - a[1].hints);
        const note = hinted.length
          ? EduCore.t('hintNote', { concept: hinted[0][0] })
          : EduCore.t('noHintNote');
        this.add.text(W / 2, panelTop + 296, note,
          EduCore.textStyle(24, { color: '#B5702F', align: 'center', wrap: 600 })).setOrigin(0.5);

        // Narrative outro (quest flavor) or next topics
        const nextY = panelTop + 354;
        if (spec.narrative && spec.narrative.outro && spec.meta.gameType === 'quest_path') {
          this.add.text(W / 2, nextY, spec.narrative.outro,
            EduCore.textStyle(24, { color: '#4D8C58', align: 'center', wrap: 620, lineSpacing: 6 })).setOrigin(0.5, 0);
        } else if (spec.summaryHints && spec.summaryHints.nextTopics) {
          this.add.text(W / 2, nextY, EduCore.t('nextTopics') + ': ' + spec.summaryHints.nextTopics.join('  •  '),
            EduCore.textStyle(24, { color: '#079A90', align: 'center', wrap: 620, lineSpacing: 6 })).setOrigin(0.5, 0);
        }

        const againBtn = GameFeel.candyButton(this, W / 2 - 150, H - 110, 270, 88, EduCore.t('playAgain'), {
          color: PALETTE.blue, arabic: EduCore.isRTL, fontSize: 26,
          onTap: () => {
            EduCore.bridge.reportEvent('replay');
            this.scene.start('GameScene');
          },
        });
        const doneBtn = GameFeel.candyButton(this, W / 2 + 150, H - 110, 270, 88, EduCore.t('done'), {
          color: PALETTE.green, arabic: EduCore.isRTL, fontSize: 26,
          onTap: () => {
            EduCore.bridge.reportComplete({
              xp: sum.xp, accuracy: sum.accuracy, mastery: sum.mastery,
            });
          },
        });
        this.feel.breathe(doneBtn);

        EduCore.setTappables([
          { id: 'again', label: 'play again', x: againBtn.x, y: againBtn.y, w: 270, h: 88 },
          { id: 'done', label: 'done', x: doneBtn.x, y: doneBtn.y, w: 270, h: 88 },
        ]);
      }
    };
  }

  EduCore.createIntroScene = createIntroScene;
  EduCore.createEndScene = createEndScene;

  window.EduCore = EduCore;
})();
