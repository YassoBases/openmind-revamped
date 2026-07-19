/**
 * SceneKit.js — the living-scene foundation shared by the learning shells.
 *
 * Owns the OpenMind interest kits (nature / construction / space / cars /
 * ocean): kit-drawn backgrounds with slow parallax, ambient life, a canonical
 * label → visual table so AI-supplied labels always render as drawn art (chip
 * fallback otherwise), idle/pulse "alive" helpers, Hudhud's kit commentary
 * bubble, and the generic observe/notice beat overlays of the six-beat flow.
 *
 * Doctrine (same as the wrapper seam in number_city): kits are PRESENTATION
 * ONLY. Same spec, same answers, same difficulty, same evidence — only what
 * the scene looks like, its ambient life and Hudhud's flavor lines change
 * with the child's interest. Kit tables never read `correct`.
 *
 * Budget rules baked in:
 *  - ambient life: ≤6 tweened flecks per scene, zero new particle pools
 *  - parallax: 2 layers, tweens only (no filters, no pipelines)
 *  - liveliness is choreography: tween existing objects, don't spawn new ones
 */
(function () {
  'use strict';

  const W = 720;
  const H = 1280;

  // The OpenMind palette (ints) — the ONLY colors kits may use (+ derived tints).
  const C = {
    cream: 0xfdf2e2,
    sand: 0xfae9d0,
    teal: 0x079a90,
    deepTeal: 0x19725e,
    orange: 0xef9722,
    peach: 0xfadbb0,
    leaf: 0x84a253,
    deepGreen: 0x4d8c58,
    sky: 0xceebf0,
    berry: 0xd93b5e,
    brown: 0xb5702f,
  };

  // ------------------------------------------------------------------ kits
  /**
   * Each kit: background composition + ambient life + celebration colors +
   * one flavor line + Hudhud commentary (presentation-only, never canonical
   * learning content — the spec's prompts/hints/explanations stay untouched).
   */
  const KITS = {
    nature: {
      id: 'nature',
      skyTop: C.sky, skyBottom: C.cream,
      ground: C.leaf, groundDeep: 0x6d8a42,
      ambient: { type: 'leaves', color: C.leaf, count: 6 },
      confetti: [C.leaf, C.deepGreen, C.orange, C.sky],
      containerColor: C.brown,
      flavor: { en: 'The forest is wide awake today!', ar: 'الغابة مستيقظة تمامًا اليوم!' },
      commentary: {
        enter: { en: 'Look how the forest moves…', ar: 'انظر كيف تتحرك الغابة…' },
        firstCorrect: { en: 'The birds liked that!', ar: 'أعجب هذا العصافير!' },
        recovered: { en: 'Even tall trees grow slowly.', ar: 'حتى الأشجار العالية تنمو ببطء.' },
        createDone: { en: 'The forest loves what you made!', ar: 'الغابة أحبت ما صنعتَه!' },
      },
      horizon(g) {
        // rolling hills + trees + a pond
        g.fillStyle(C.deepGreen, 0.18);
        g.fillEllipse(140, 950, 420, 220);
        g.fillEllipse(560, 960, 460, 260);
        g.fillStyle(C.brown, 0.5);
        g.fillRect(96, 830, 14, 70);
        g.fillRect(560, 850, 12, 56);
        g.fillStyle(C.deepGreen, 0.45);
        g.fillCircle(103, 806, 44);
        g.fillCircle(566, 830, 34);
        g.fillStyle(C.leaf, 0.45);
        g.fillCircle(132, 830, 28);
      },
      near(g) {
        // pond + grass tufts
        g.fillStyle(C.sky, 0.8);
        g.fillEllipse(590, 946, 180, 42);
        g.lineStyle(3, C.deepGreen, 0.7);
        for (const x of [80, 150, 320, 470, 660]) {
          g.beginPath(); g.moveTo(x, 962); g.lineTo(x - 6, 938); g.strokePath();
          g.beginPath(); g.moveTo(x + 4, 962); g.lineTo(x + 10, 942); g.strokePath();
        }
      },
    },

    construction: {
      id: 'construction',
      skyTop: C.sky, skyBottom: C.cream,
      ground: C.sand, groundDeep: 0xe8d3b0,
      ambient: { type: 'dust', color: C.brown, count: 6 },
      confetti: [C.orange, C.teal, C.brown, C.peach],
      containerColor: C.teal,
      flavor: { en: 'The building site is buzzing!', ar: 'ورشة البناء تعجّ بالنشاط!' },
      commentary: {
        enter: { en: 'Helmets on — let us build!', ar: 'لنرتدِ الخوذات ونبدأ البناء!' },
        firstCorrect: { en: 'Solid work, builder!', ar: 'عمل متين أيها البنّاء!' },
        recovered: { en: 'Every wall needs a second look.', ar: 'كل جدار يحتاج نظرة ثانية.' },
        createDone: { en: 'What a build! The crew cheers!', ar: 'يا له من بناء! الفريق يهتف لك!' },
      },
      horizon(g) {
        // crane + scaffold silhouettes
        g.fillStyle(C.deepTeal, 0.22);
        g.fillRect(600, 570, 14, 300);
        g.fillRect(510, 570, 190, 12);
        g.lineStyle(3, C.deepTeal, 0.22);
        g.beginPath(); g.moveTo(534, 582); g.lineTo(534, 650); g.strokePath();
        g.fillRect(522, 650, 24, 18);
        g.fillStyle(C.deepTeal, 0.16);
        g.fillRect(90, 760, 120, 190);
        g.fillRect(240, 810, 90, 140);
      },
      near(g) {
        // brick stacks + a cone
        g.fillStyle(C.brown, 0.55);
        g.fillRect(70, 930, 46, 20); g.fillRect(94, 908, 46, 20);
        g.fillStyle(C.orange, 0.8);
        g.fillTriangle(620, 962, 660, 962, 640, 918);
        g.fillStyle(C.cream, 0.9);
        g.fillRect(628, 944, 24, 6);
      },
    },

    space: {
      id: 'space',
      skyTop: C.sky, skyBottom: C.cream,
      ground: C.peach, groundDeep: 0xe8c393,
      ambient: { type: 'stars', color: C.orange, count: 6 },
      confetti: [C.orange, C.teal, C.sky, C.peach],
      containerColor: C.deepTeal,
      flavor: { en: 'Ready for lift-off, explorer!', ar: 'استعد للانطلاق أيها المستكشف!' },
      commentary: {
        enter: { en: 'The stars are watching us…', ar: 'النجوم تراقبنا…' },
        firstCorrect: { en: 'Mission control says WOW!', ar: 'مركز التحكم يقول: رائع!' },
        recovered: { en: 'Rockets test many times too.', ar: 'الصواريخ أيضًا تُجرَّب مرات كثيرة.' },
        createDone: { en: 'A whole new galaxy — yours!', ar: 'مجرّة جديدة كاملة — من صنعك!' },
      },
      horizon(g) {
        // pale stars + a ringed planet + rocket gantry
        g.fillStyle(C.teal, 0.35);
        for (const [x, y] of [[80, 240], [200, 140], [340, 300], [520, 180], [640, 260], [420, 90]]) {
          g.fillCircle(x, y, 4);
        }
        g.fillStyle(C.orange, 0.3);
        g.fillCircle(560, 700, 52);
        g.lineStyle(5, C.deepTeal, 0.25);
        g.strokeEllipse(560, 700, 150, 40);
        g.fillStyle(C.deepTeal, 0.2);
        g.fillRect(120, 700, 14, 250);
        g.fillRect(88, 730, 90, 10);
      },
      near(g) {
        // crater rims on the pad
        g.lineStyle(4, C.brown, 0.4);
        g.strokeEllipse(180, 950, 120, 30);
        g.strokeEllipse(520, 965, 90, 24);
      },
    },

    cars: {
      id: 'cars',
      skyTop: C.sky, skyBottom: C.cream,
      ground: 0xd8cbb3, groundDeep: 0xc4b79f,
      ambient: { type: 'puffs', color: C.sky, count: 5 },
      confetti: [C.orange, C.teal, C.berry, C.sand],
      containerColor: C.orange,
      flavor: { en: 'Engines humming — race day!', ar: 'المحركات تدندن — يوم السباق!' },
      commentary: {
        enter: { en: 'Buckle up, racer!', ar: 'اربط الحزام أيها المتسابق!' },
        firstCorrect: { en: 'Green flag! Great lap!', ar: 'راية خضراء! لفة رائعة!' },
        recovered: { en: 'Pit stops make champions.', ar: 'التوقف للصيانة يصنع الأبطال.' },
        createDone: { en: 'Your track is ready to race!', ar: 'حلبتك جاهزة للسباق!' },
      },
      horizon(g) {
        // hills + a checkered start arch
        g.fillStyle(C.leaf, 0.2);
        g.fillEllipse(160, 930, 460, 200);
        g.fillEllipse(600, 940, 420, 180);
        g.fillStyle(C.deepTeal, 0.25);
        g.fillRect(180, 700, 12, 160);
        g.fillRect(530, 700, 12, 160);
        g.fillRect(180, 690, 362, 16);
        g.fillStyle(C.deepTeal, 0.35);
        for (let i = 0; i < 9; i++) {
          if (i % 2 === 0) g.fillRect(186 + i * 39, 692, 19, 12);
        }
      },
      near(g) {
        // the road band with dashes
        g.fillStyle(C.brown, 0.35);
        g.fillRect(0, 928, W, 44);
        g.fillStyle(C.cream, 0.9);
        for (let x = 20; x < W; x += 90) g.fillRect(x, 946, 42, 7);
      },
    },

    ocean: {
      id: 'ocean',
      skyTop: C.sky, skyBottom: 0xdff3f6,
      ground: 0xe9ddc0, groundDeep: 0xd9c9a5,
      ambient: { type: 'bubbles', color: C.sky, count: 6 },
      confetti: [C.teal, C.sky, C.orange, C.deepGreen],
      containerColor: C.teal,
      flavor: { en: 'The sea is full of secrets!', ar: 'البحر مليء بالأسرار!' },
      commentary: {
        enter: { en: 'Dive in — gently…', ar: 'لنغُص بهدوء…' },
        firstCorrect: { en: 'The fish are dancing for you!', ar: 'الأسماك ترقص فرحًا بك!' },
        recovered: { en: 'Waves try again and again.', ar: 'الأمواج تحاول مرة بعد مرة.' },
        createDone: { en: 'A reef of your very own!', ar: 'شعاب مرجانية من صنعك أنت!' },
      },
      horizon(g) {
        // water bands + a sail + a distant island
        g.fillStyle(C.teal, 0.16);
        g.fillRect(0, 640, W, 320);
        g.fillStyle(C.teal, 0.1);
        g.fillRect(0, 700, W, 260);
        g.fillStyle(C.cream, 0.8);
        g.fillTriangle(560, 620, 560, 560, 610, 620);
        g.fillStyle(C.brown, 0.4);
        g.fillRect(556, 616, 60, 8);
        g.fillStyle(C.leaf, 0.3);
        g.fillEllipse(140, 640, 180, 60);
      },
      near(g) {
        // seaweed + coral on the sea floor
        g.lineStyle(5, C.deepGreen, 0.6);
        for (const x of [90, 130, 620]) {
          g.beginPath();
          g.moveTo(x, 966);
          g.lineTo(x - 8, 928);
          g.lineTo(x + 6, 900);
          g.strokePath();
        }
        g.fillStyle(C.berry, 0.35);
        g.fillCircle(540, 946, 14);
        g.fillCircle(558, 938, 10);
        g.fillCircle(524, 936, 9);
      },
    },
  };

  function getKit(id) {
    return KITS[id] || KITS.nature;
  }

  // -------------------------------------------------- label → visual table
  /**
   * Canonical (wrapper-independent) label → drawn visual. Arabic + English
   * keyword tables; unknown labels fall back to the readable chip, so any
   * AI-supplied label is ALWAYS renderable — the invariant that makes the
   * contract safe for generation.
   */
  const VISUAL_KEYS = [
    ['bird', /عصفور|طائر(?!ة)|bird/i],
    ['nest', /عش|nest/i],
    ['brick', /طوب|لبنة|قرميد|brick/i],
    ['wall', /جدار|حائط|wall/i],
    ['star', /نجم|star/i],
    ['planet', /كوكب|planet/i],
    ['rocket', /صاروخ|rocket/i],
    ['moon', /قمر|moon/i],
    ['sun', /شمس|sun/i],
    ['cloud', /غيم|سحاب|cloud/i],
    ['fish', /سمك|fish/i],
    ['shellfish', /صدف|seashell|shell/i],
    ['boat', /قارب|مركب|سفينة|boat|ship/i],
    ['car', /سيارة|car\b/i],
    ['wheel', /عجلة|دولاب|إطار|wheel|tire/i],
    ['tree', /شجرة|tree/i],
    ['leafy', /ورقة الشجر|ورقة نبات|leaf/i],
    ['flower', /زهرة|وردة|flower|rose/i],
    ['apple', /تفاح|apple/i],
    ['house', /بيت|منزل|house|home/i],
    ['kite', /طائرة ورقية|kite/i],
    ['ball', /كرة|ball/i],
    ['book', /كتاب|دفتر|book|notebook/i],
    ['lamp', /مصباح|ضوء|lamp|light bulb|bulb/i],
    ['drop', /قطرة|ماء|drop|water/i],
    ['circle', /دائر|circle/i],
    ['rect', /مستطيل|rectangle/i],
    ['square', /مربع|square/i],
    ['triangle', /مثلث|triangle/i],
  ];

  function visualFor(label) {
    const s = String(label || '');
    for (const [key, re] of VISUAL_KEYS) {
      if (re.test(s)) return key;
    }
    return null;
  }

  /** Draw a visual centered on (0,0). Returns false for unknown keys. */
  function drawVisual(g, key, size) {
    const r = size / 2;
    const ink = (c) => GameFeel.darken(c, 0.3);
    switch (key) {
      case 'bird': {
        g.fillStyle(C.teal, 1);
        g.fillEllipse(0, 2, r * 1.7, r * 1.2); // body
        g.fillCircle(r * 0.62, -r * 0.4, r * 0.42); // head
        g.fillStyle(C.orange, 1);
        g.fillTriangle(r * 0.95, -r * 0.4, r * 1.3, -r * 0.3, r * 0.95, -r * 0.18); // beak
        g.fillStyle(GameFeel.darken(C.teal, 0.25), 1);
        g.fillEllipse(-r * 0.15, 0, r * 0.8, r * 0.55); // wing
        g.fillStyle(0x123f36, 1);
        g.fillCircle(r * 0.68, -r * 0.48, 3); // eye
        break;
      }
      case 'nest': {
        g.fillStyle(C.brown, 1);
        g.fillEllipse(0, r * 0.3, r * 1.9, r * 0.9);
        g.fillStyle(GameFeel.darken(C.brown, 0.25), 1);
        g.fillEllipse(0, r * 0.16, r * 1.4, r * 0.55);
        g.lineStyle(3, GameFeel.darken(C.brown, 0.4), 0.9);
        g.strokeEllipse(0, r * 0.3, r * 1.9, r * 0.9);
        break;
      }
      case 'brick': {
        g.fillStyle(C.brown, 1);
        g.fillRoundedRect(-r, -r * 0.55, size, size * 0.55, 6);
        g.lineStyle(3, ink(C.brown), 1);
        g.strokeRoundedRect(-r, -r * 0.55, size, size * 0.55, 6);
        g.beginPath(); g.moveTo(0, -r * 0.55); g.lineTo(0, 0); g.strokePath();
        g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.strokePath();
        g.beginPath(); g.moveTo(-r * 0.5, 0); g.lineTo(-r * 0.5, r * 0.28); g.strokePath();
        g.beginPath(); g.moveTo(r * 0.5, 0); g.lineTo(r * 0.5, r * 0.28); g.strokePath();
        break;
      }
      case 'wall': {
        g.fillStyle(C.peach, 1);
        g.fillRoundedRect(-r, -r * 0.8, size, size * 0.8, 4);
        g.lineStyle(3, C.brown, 1);
        g.strokeRoundedRect(-r, -r * 0.8, size, size * 0.8, 4);
        for (let row = 0; row < 3; row++) {
          const y = -r * 0.8 + ((row + 1) * size * 0.8) / 4;
          g.beginPath(); g.moveTo(-r, y); g.lineTo(r, y); g.strokePath();
          const off = row % 2 === 0 ? 0 : r * 0.5;
          g.beginPath(); g.moveTo(-r * 0.5 + off, y - size * 0.2); g.lineTo(-r * 0.5 + off, y); g.strokePath();
        }
        break;
      }
      case 'star': {
        g.fillStyle(C.orange, 1);
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rad = i % 2 === 0 ? r : r * 0.45;
          pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
        }
        g.fillPoints(pts, true);
        g.lineStyle(3, ink(C.orange), 1);
        g.strokePoints(pts, true);
        break;
      }
      case 'planet': {
        g.fillStyle(C.teal, 1);
        g.fillCircle(0, 0, r * 0.8);
        g.fillStyle(GameFeel.lighten(C.teal, 0.35), 1);
        g.fillCircle(-r * 0.25, -r * 0.2, r * 0.2);
        g.fillCircle(r * 0.3, r * 0.25, r * 0.14);
        g.lineStyle(5, C.orange, 0.9);
        g.strokeEllipse(0, 0, r * 2.1, r * 0.6);
        break;
      }
      case 'rocket': {
        g.fillStyle(C.cream, 1);
        g.fillRoundedRect(-r * 0.32, -r * 0.9, r * 0.64, r * 1.5, r * 0.3);
        g.fillStyle(C.berry, 1);
        g.fillTriangle(0, -r, -r * 0.32, -r * 0.55, r * 0.32, -r * 0.55);
        g.fillTriangle(-r * 0.32, r * 0.6, -r * 0.62, r * 0.95, -r * 0.32, r * 0.2);
        g.fillTriangle(r * 0.32, r * 0.6, r * 0.62, r * 0.95, r * 0.32, r * 0.2);
        g.fillStyle(C.sky, 1);
        g.fillCircle(0, -r * 0.35, r * 0.18);
        g.fillStyle(C.orange, 1);
        g.fillTriangle(-r * 0.18, r * 0.6, r * 0.18, r * 0.6, 0, r * 1.05);
        break;
      }
      case 'moon': {
        g.fillStyle(C.peach, 1);
        g.fillCircle(0, 0, r * 0.85);
        g.fillStyle(C.cream, 1);
        g.fillCircle(r * 0.35, -r * 0.1, r * 0.62);
        g.lineStyle(3, C.brown, 0.6);
        g.strokeCircle(0, 0, r * 0.85);
        break;
      }
      case 'sun': {
        g.fillStyle(C.orange, 1);
        g.fillCircle(0, 0, r * 0.6);
        g.lineStyle(4, C.orange, 1);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.beginPath();
          g.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
          g.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
          g.strokePath();
        }
        break;
      }
      case 'cloud': {
        g.fillStyle(C.sky, 1);
        g.fillCircle(-r * 0.45, r * 0.1, r * 0.42);
        g.fillCircle(0, -r * 0.15, r * 0.55);
        g.fillCircle(r * 0.45, r * 0.12, r * 0.4);
        g.fillRoundedRect(-r * 0.6, r * 0.05, r * 1.2, r * 0.42, r * 0.2);
        g.lineStyle(3, GameFeel.darken(C.sky, 0.2), 0.8);
        g.strokeCircle(0, -r * 0.15, r * 0.55);
        break;
      }
      case 'fish': {
        g.fillStyle(C.orange, 1);
        g.fillEllipse(0, 0, r * 1.6, r);
        g.fillTriangle(-r * 0.7, 0, -r * 1.15, -r * 0.45, -r * 1.15, r * 0.45);
        g.fillStyle(GameFeel.lighten(C.orange, 0.3), 1);
        g.fillEllipse(0, -r * 0.1, r * 0.6, r * 0.35);
        g.fillStyle(0x123f36, 1);
        g.fillCircle(r * 0.45, -r * 0.12, 3.5);
        break;
      }
      case 'shellfish': {
        g.fillStyle(C.peach, 1);
        g.fillEllipse(0, r * 0.15, r * 1.5, r);
        g.lineStyle(3, C.brown, 0.9);
        for (let i = -2; i <= 2; i++) {
          g.beginPath();
          g.moveTo(0, r * 0.6);
          g.lineTo(i * r * 0.34, -r * 0.3);
          g.strokePath();
        }
        g.strokeEllipse(0, r * 0.15, r * 1.5, r);
        break;
      }
      case 'boat': {
        g.fillStyle(C.brown, 1);
        g.fillTriangle(-r, 0, r, 0, r * 0.6, r * 0.5);
        g.fillTriangle(-r, 0, r * 0.6, r * 0.5, -r * 0.6, r * 0.5);
        g.fillStyle(C.cream, 1);
        g.fillTriangle(0, -r, 0, -r * 0.1, r * 0.65, -r * 0.1);
        g.lineStyle(3, C.deepTeal, 1);
        g.beginPath(); g.moveTo(0, -r); g.lineTo(0, 0); g.strokePath();
        break;
      }
      case 'car': {
        g.fillStyle(C.teal, 1);
        g.fillRoundedRect(-r, -r * 0.15, size, r * 0.55, 8);
        g.fillRoundedRect(-r * 0.5, -r * 0.55, size * 0.5, r * 0.5, 8);
        g.fillStyle(C.sky, 1);
        g.fillRoundedRect(-r * 0.36, -r * 0.46, r * 0.6, r * 0.32, 5);
        g.fillStyle(0x123f36, 1);
        g.fillCircle(-r * 0.5, r * 0.45, r * 0.22);
        g.fillCircle(r * 0.5, r * 0.45, r * 0.22);
        g.fillStyle(C.cream, 1);
        g.fillCircle(-r * 0.5, r * 0.45, r * 0.1);
        g.fillCircle(r * 0.5, r * 0.45, r * 0.1);
        break;
      }
      case 'wheel': {
        g.fillStyle(0x123f36, 1);
        g.fillCircle(0, 0, r * 0.85);
        g.fillStyle(C.sand, 1);
        g.fillCircle(0, 0, r * 0.55);
        g.lineStyle(4, 0x123f36, 1);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          g.beginPath();
          g.moveTo(-Math.cos(a) * r * 0.5, -Math.sin(a) * r * 0.5);
          g.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
          g.strokePath();
        }
        g.fillStyle(0x123f36, 1);
        g.fillCircle(0, 0, r * 0.12);
        break;
      }
      case 'tree': {
        g.fillStyle(C.brown, 1);
        g.fillRect(-r * 0.12, r * 0.1, r * 0.24, r * 0.8);
        g.fillStyle(C.deepGreen, 1);
        g.fillCircle(0, -r * 0.3, r * 0.55);
        g.fillStyle(C.leaf, 1);
        g.fillCircle(-r * 0.35, 0, r * 0.35);
        g.fillCircle(r * 0.35, -r * 0.05, r * 0.32);
        break;
      }
      case 'leafy': {
        g.fillStyle(C.leaf, 1);
        g.fillEllipse(0, 0, r * 0.9, r * 1.6);
        g.lineStyle(3, C.deepGreen, 1);
        g.beginPath(); g.moveTo(0, r * 0.8); g.lineTo(0, -r * 0.7); g.strokePath();
        g.beginPath(); g.moveTo(0, r * 0.2); g.lineTo(r * 0.3, -r * 0.1); g.strokePath();
        g.beginPath(); g.moveTo(0, -r * 0.1); g.lineTo(-r * 0.28, -r * 0.4); g.strokePath();
        break;
      }
      case 'flower': {
        g.fillStyle(C.berry, 0.9);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.fillEllipse(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.5, r * 0.32);
        }
        g.fillStyle(C.orange, 1);
        g.fillCircle(0, 0, r * 0.26);
        break;
      }
      case 'apple': {
        g.fillStyle(C.berry, 1);
        g.fillCircle(-r * 0.22, r * 0.1, r * 0.5);
        g.fillCircle(r * 0.22, r * 0.1, r * 0.5);
        g.fillRoundedRect(-r * 0.55, r * 0.05, r * 1.1, r * 0.5, r * 0.25);
        g.fillStyle(C.brown, 1);
        g.fillRect(-3, -r * 0.7, 6, r * 0.4);
        g.fillStyle(C.leaf, 1);
        g.fillEllipse(r * 0.2, -r * 0.55, r * 0.4, r * 0.22);
        break;
      }
      case 'house': {
        g.fillStyle(C.sand, 1);
        g.fillRect(-r * 0.7, -r * 0.1, r * 1.4, r * 0.9);
        g.fillStyle(C.berry, 0.9);
        g.fillTriangle(0, -r * 0.85, -r * 0.85, -r * 0.1, r * 0.85, -r * 0.1);
        g.fillStyle(C.teal, 1);
        g.fillRect(-r * 0.16, r * 0.25, r * 0.32, r * 0.55);
        g.fillStyle(C.sky, 1);
        g.fillRect(r * 0.25, r * 0.05, r * 0.3, r * 0.3);
        g.lineStyle(3, C.brown, 1);
        g.strokeRect(-r * 0.7, -r * 0.1, r * 1.4, r * 0.9);
        break;
      }
      case 'kite': {
        g.fillStyle(C.orange, 1);
        g.fillTriangle(0, -r, -r * 0.62, 0, 0, r * 0.35);
        g.fillStyle(C.teal, 1);
        g.fillTriangle(0, -r, r * 0.62, 0, 0, r * 0.35);
        g.lineStyle(3, C.brown, 0.9);
        g.beginPath(); g.moveTo(0, r * 0.35); g.lineTo(-r * 0.2, r * 0.7); g.lineTo(r * 0.1, r * 0.95); g.strokePath();
        break;
      }
      case 'ball': {
        g.fillStyle(C.orange, 1);
        g.fillCircle(0, 0, r * 0.8);
        g.lineStyle(3, ink(C.orange), 1);
        g.strokeCircle(0, 0, r * 0.8);
        g.strokeEllipse(0, 0, r * 0.7, r * 1.6);
        g.strokeEllipse(0, 0, r * 1.6, r * 0.7);
        break;
      }
      case 'book': {
        g.fillStyle(C.teal, 1);
        g.fillRoundedRect(-r * 0.7, -r * 0.85, r * 1.4, r * 1.7, 6);
        g.fillStyle(C.cream, 1);
        g.fillRoundedRect(-r * 0.56, -r * 0.7, r * 1.18, r * 1.4, 4);
        g.lineStyle(3, C.brown, 0.7);
        for (let i = 0; i < 3; i++) {
          const y = -r * 0.35 + i * r * 0.35;
          g.beginPath(); g.moveTo(-r * 0.4, y); g.lineTo(r * 0.42, y); g.strokePath();
        }
        break;
      }
      case 'lamp': {
        g.fillStyle(C.orange, 1);
        g.fillCircle(0, -r * 0.2, r * 0.55);
        g.fillStyle(C.peach, 1);
        g.fillCircle(-r * 0.18, -r * 0.35, r * 0.16);
        g.fillStyle(C.deepTeal, 1);
        g.fillRoundedRect(-r * 0.22, r * 0.3, r * 0.44, r * 0.4, 6);
        g.lineStyle(3, C.orange, 0.8);
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI * 0.8 + (i / 4) * Math.PI * 0.6;
          g.beginPath();
          g.moveTo(Math.cos(a) * r * 0.7, -r * 0.2 + Math.sin(a) * r * 0.7);
          g.lineTo(Math.cos(a) * r * 0.9, -r * 0.2 + Math.sin(a) * r * 0.9);
          g.strokePath();
        }
        break;
      }
      case 'drop': {
        g.fillStyle(C.teal, 0.9);
        g.fillCircle(0, r * 0.25, r * 0.55);
        g.fillTriangle(0, -r * 0.85, -r * 0.5, r * 0.05, r * 0.5, r * 0.05);
        g.fillStyle(C.sky, 0.9);
        g.fillCircle(-r * 0.18, r * 0.2, r * 0.15);
        break;
      }
      case 'circle': {
        g.fillStyle(C.orange, 1);
        g.fillCircle(0, 0, r);
        g.lineStyle(4, ink(C.orange), 1);
        g.strokeCircle(0, 0, r);
        break;
      }
      case 'square': {
        g.fillStyle(C.leaf, 1);
        g.fillRoundedRect(-r, -r, size, size, 10);
        g.lineStyle(4, ink(C.leaf), 1);
        g.strokeRoundedRect(-r, -r, size, size, 10);
        break;
      }
      case 'rect': {
        g.fillStyle(C.brown, 1);
        g.fillRoundedRect(-r * 1.25, -r * 0.7, size * 1.25, size * 0.7, 10);
        g.lineStyle(4, ink(C.brown), 1);
        g.strokeRoundedRect(-r * 1.25, -r * 0.7, size * 1.25, size * 0.7, 10);
        break;
      }
      case 'triangle': {
        g.fillStyle(C.deepGreen, 1);
        g.fillTriangle(0, -r, r, r * 0.85, -r, r * 0.85);
        g.lineStyle(4, ink(C.deepGreen), 1);
        g.strokeTriangle(0, -r, r, r * 0.85, -r, r * 0.85);
        break;
      }
      default:
        return false;
    }
    return true;
  }

  // ------------------------------------------------------- scene building
  /** Gradient sky + kit horizon + ground + 2-layer parallax (tweens only). */
  function buildBackground(scene, kit) {
    const g = scene.add.graphics().setDepth(0);
    for (let i = 0; i < 8; i++) {
      const f = i / 7;
      const rr = Math.round(((kit.skyTop >> 16) & 255) * (1 - f) + ((kit.skyBottom >> 16) & 255) * f);
      const gg = Math.round(((kit.skyTop >> 8) & 255) * (1 - f) + ((kit.skyBottom >> 8) & 255) * f);
      const bb = Math.round((kit.skyTop & 255) * (1 - f) + (kit.skyBottom & 255) * f);
      g.fillStyle((rr << 16) | (gg << 8) | bb, 1);
      g.fillRect(0, (H * 0.75 * i) / 8, W, (H * 0.75) / 8 + 2);
    }

    // far layer — the kit horizon, drifting almost imperceptibly
    const far = scene.add.graphics().setDepth(0);
    kit.horizon(far);
    scene.tweens.add({
      targets: far, x: { from: -12, to: 12 },
      duration: 11000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // ground band (static — the stage floor never swims under the objects)
    const ground = scene.add.graphics().setDepth(1);
    ground.fillStyle(kit.groundDeep, 1);
    ground.fillRect(0, 950, W, H - 950);
    ground.fillStyle(kit.ground, 1);
    ground.fillEllipse(W / 2, 965, W * 1.3, 70);

    // near layer — foreground details, drifting a touch faster (parallax)
    const near = scene.add.graphics().setDepth(1);
    if (kit.near) kit.near(near);
    scene.tweens.add({
      targets: near, x: { from: 10, to: -10 },
      duration: 8000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    return { far, near };
  }

  /** Ambient life: ≤6 tweened flecks. Types: leaves/dust/stars/puffs/bubbles. */
  function spawnAmbient(scene, kit) {
    const spec = kit.ambient || { type: 'dust', color: C.brown, count: 5 };
    const count = Math.min(spec.count || 5, 6);
    for (let i = 0; i < count; i++) {
      let fleck;
      let drift = { dy: 120 + Math.random() * 80, dx: 24 - Math.random() * 48, spin: 0, alpha: 0.4 };
      if (spec.type === 'leaves') {
        fleck = scene.add.ellipse(Math.random() * W, 200 + Math.random() * 700, 14, 8, spec.color, 0.5);
        drift = { dy: 140 + Math.random() * 80, dx: 60 - Math.random() * 120, spin: 180, alpha: 0.5 };
      } else if (spec.type === 'stars') {
        fleck = scene.add.star
          ? scene.add.star(Math.random() * W, 120 + Math.random() * 500, 5, 3, 7, spec.color, 0.55)
          : scene.add.circle(Math.random() * W, 120 + Math.random() * 500, 4, spec.color, 0.55);
        drift = { dy: 40 + Math.random() * 40, dx: 10 - Math.random() * 20, spin: 90, alpha: 0.55 };
      } else if (spec.type === 'puffs') {
        fleck = scene.add.circle(Math.random() * W, 700 + Math.random() * 240, 8 + Math.random() * 6, spec.color, 0.4);
        drift = { dy: -(60 + Math.random() * 50), dx: 70 + Math.random() * 60, spin: 0, alpha: 0.4 };
      } else if (spec.type === 'bubbles') {
        fleck = scene.add.circle(Math.random() * W, 500 + Math.random() * 500, 4 + Math.random() * 5, spec.color, 0.55);
        drift = { dy: -(140 + Math.random() * 100), dx: 20 - Math.random() * 40, spin: 0, alpha: 0.55 };
      } else { // dust
        fleck = scene.add.circle(Math.random() * W, 300 + Math.random() * 600, 3, spec.color, 0.3);
        drift = { dy: 120 + Math.random() * 60, dx: 24 - Math.random() * 48, spin: 0, alpha: 0.3 };
      }
      fleck.setDepth(1);
      const homeY = fleck.y;
      scene.tweens.add({
        targets: fleck,
        y: fleck.y + drift.dy,
        x: fleck.x + drift.dx,
        angle: drift.spin,
        alpha: 0,
        duration: 5200 + Math.random() * 2800,
        repeat: -1,
        delay: Math.random() * 4000,
        onRepeat: () => {
          fleck.y = homeY + (Math.random() * 120 - 60);
          fleck.x = Math.random() * W;
          fleck.alpha = drift.alpha;
        },
      });
    }
  }

  // ---------------------------------------------------------- live objects
  /**
   * Build one scene object: glow halo + drawn visual (or readable chip for
   * unknown labels — generic contract support). Mirrors number_city's
   * buildShapeObject so mechanics across shells feel like one family.
   */
  function makeObject(scene, def, size) {
    const c = scene.add.container(0, 0);
    const glow = scene.add.circle(0, 0, size * 0.62, EduCore.accentInt, 0);
    c.add(glow);
    const g = scene.add.graphics();
    const key = visualFor(def.label);
    if (key && drawVisual(g, key, size)) {
      c.add(g);
    } else {
      const tmp = scene.add.text(0, 0, def.label, EduCore.textStyle(24, {
        weight: '700', color: '#19725E', align: 'center', wrap: 200,
      })).setOrigin(0.5);
      const chipW = Math.max(tmp.width + 34, 90);
      const chipH = Math.max(tmp.height + 22, 56);
      g.fillStyle(C.sand, 1);
      g.fillRoundedRect(-chipW / 2, -chipH / 2, chipW, chipH, 16);
      g.lineStyle(3, EduCore.accentInt, 0.85);
      g.strokeRoundedRect(-chipW / 2, -chipH / 2, chipW, chipH, 16);
      c.add([g, tmp]);
    }
    c.glow = glow;
    c.visualKey = key;
    c.def = def;
    return c;
  }

  /**
   * Idle life for a field of objects: staggered breathing or a slow ±2° sway
   * so scenes read alive, never synchronized, never distracting.
   */
  function idle(scene, obj, style, index) {
    const phase = ((index || 0) % 5) * 260;
    if (style === 'sway') {
      scene.tweens.add({
        targets: obj, angle: { from: -2, to: 2 },
        duration: 1900 + phase, yoyo: true, repeat: -1, delay: phase, ease: 'Sine.easeInOut',
      });
    } else {
      scene.tweens.add({
        targets: obj, scaleX: obj.scaleX * 1.025, scaleY: obj.scaleY * 1.025,
        duration: 1400 + phase, yoyo: true, repeat: -1, delay: phase, ease: 'Sine.easeInOut',
      });
    }
  }

  /** Hint-2 narrowing pulse (glow + scale), guarded against destroyed objs. */
  function pulse(scene, o) {
    if (!o || !o.glow) return;
    o.glow.setAlpha(0.5);
    scene.tweens.add({ targets: o, scale: 1.14, duration: 280, yoyo: true, repeat: 2 });
    scene.time.delayedCall(1800, () => {
      if (o.glow && o.glow.scene) o.glow.setAlpha(0);
    });
  }

  /** Objects spawn disarmed and arm a moment later — a tap meant for a
   *  dialog that lands on a just-spawned object must never count as wrong. */
  function armLater(scene, objs) {
    for (const o of objs) o.tapDisabled = true;
    scene.time.delayedCall(450, () => {
      for (const o of objs) {
        if (o.scene && !o.done) o.tapDisabled = false;
      }
    });
  }

  /** Kit-colored confetti through the existing pooled emitters. */
  function celebrate(scene, x, y, kit, count) {
    scene.feel.confetti(x, y, kit.confetti, count == null ? 12 : count);
  }

  // ------------------------------------------------- Hudhud kit commentary
  /** Localized kit commentary line ('enter' | 'firstCorrect' | 'recovered'
   *  | 'createDone') — presentation-only flavor, never learning content. */
  function commentaryLine(kit, key) {
    const entry = kit.commentary && kit.commentary[key];
    if (!entry) return null;
    return entry[EduCore.lang] || entry.en;
  }

  /**
   * Hudhud says a kit flavor line in a soft peach bubble (auto-fades). The
   * same visual grammar as the hint bubble so the guide has ONE voice.
   */
  function say(scene, guide, text, opts) {
    if (!text) return;
    const o = opts || {};
    if (guide) guide.react(o.react || 'hint');
    const bubbleY = o.y == null ? (scene.hintBubbleY == null ? H - 158 : scene.hintBubbleY) : o.y;
    const holder = scene.add.container(0, 0).setDepth((scene.uiDepth || 800) + 30);
    const tx = scene.add.text(W / 2, bubbleY, text,
      EduCore.textStyle(25, { color: '#19725E', align: 'center', wrap: 520 })).setOrigin(0.5);
    const pad = 20;
    const bg = scene.add.graphics();
    bg.fillStyle(C.peach, 0.98);
    bg.fillRoundedRect(W / 2 - tx.width / 2 - pad, tx.y - tx.height / 2 - pad * 0.6,
      tx.width + pad * 2, tx.height + pad * 1.2, 18);
    holder.add([bg, tx]);
    holder.setAlpha(0);
    scene.tweens.add({ targets: holder, alpha: 1, duration: 200 });
    scene.time.delayedCall(o.holdMs == null ? 3600 : o.holdMs, () => {
      scene.tweens.add({
        targets: holder, alpha: 0, duration: 250,
        onComplete: () => holder.destroy(),
      });
    });
  }

  // -------------------------------------------- six-beat generic overlays
  /**
   * Observe beat: the scene comes alive — just watch, no task. Generic
   * caption/flavor panel; the game supplies `opts.showcase(container)` to
   * parade its own art through the moment. Resolves on tap.
   */
  function observeBeat(scene, level, opts) {
    if (!level.observe) return Promise.resolve();
    const o = opts || {};
    EduCore.setState('observe');
    return new Promise((resolve) => {
      const c = scene.add.container(0, 0).setDepth((scene.uiDepth || 800) + 20);
      if (o.showcase) o.showcase(c);

      const panel = GameFeel.cardPanel(scene, W / 2, 940, 640, 200, {
        color: C.sand, alpha: 0.97, stroke: EduCore.accentInt, strokeWidth: 3,
      });
      const caption = scene.add.text(W / 2, 890, level.observe,
        EduCore.textStyle(28, { color: '#19725E', align: 'center', wrap: 560, lineSpacing: 8 }))
        .setOrigin(0.5, 0);
      const flavorLine = o.flavor ? (o.flavor[EduCore.lang] || o.flavor.en) : null;
      const flavor = flavorLine
        ? scene.add.text(W / 2, 862, flavorLine,
          EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5)
        : null;
      const tapTxt = scene.add.text(W / 2, 1000, EduCore.t('tapToContinue'),
        EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5);
      scene.tweens.add({ targets: tapTxt, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
      c.add(flavor ? [panel, flavor, caption, tapTxt] : [panel, caption, tapTxt]);
      c.setAlpha(0);
      scene.tweens.add({ targets: c, alpha: 1, duration: 260 });
      GameFeel.audio.tick();

      const zone = scene.add.zone(W / 2, H / 2, W, H).setInteractive().setDepth((scene.uiDepth || 800) + 21);
      zone.once('pointerdown', () => {
        zone.destroy();
        scene.tweens.add({
          targets: c, alpha: 0, duration: 220,
          onComplete: () => { c.destroy(); resolve(); },
        });
      });
    });
  }

  /** Notice beat: name the pattern the learner just felt with their fingers. */
  function noticeBeat(scene, level, guide) {
    if (!level.notice) return Promise.resolve();
    EduCore.setState('notice');
    return new Promise((resolve) => {
      const c = scene.add.container(0, 0).setDepth((scene.uiDepth || 800) + 20);
      const panel = GameFeel.cardPanel(scene, W / 2, 620, 620, 240, {
        color: C.peach, alpha: 0.98, stroke: EduCore.accentInt, strokeWidth: 3,
      });
      const bulb = scene.add.text(W / 2, 540, '💡',
        EduCore.textStyle(40, { align: 'center' })).setOrigin(0.5);
      const caption = scene.add.text(W / 2, 590, level.notice,
        EduCore.textStyle(28, { color: '#19725E', align: 'center', wrap: 540, lineSpacing: 8 }))
        .setOrigin(0.5, 0);
      const tapTxt = scene.add.text(W / 2, 706, EduCore.t('tapToContinue'),
        EduCore.textStyle(24, { color: '#B5702F', align: 'center' })).setOrigin(0.5);
      scene.tweens.add({ targets: tapTxt, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
      scene.tweens.add({ targets: bulb, scale: { from: 0.6, to: 1 }, duration: 420, ease: 'Back.easeOut' });
      c.add([panel, bulb, caption, tapTxt]);
      c.setAlpha(0);
      scene.tweens.add({ targets: c, alpha: 1, duration: 260 });
      if (guide) guide.react('hint'); // the crest fans — an idea!
      scene.feel.sparkle(W / 2, 520, 0xef9722, 8);

      const zone = scene.add.zone(W / 2, H / 2, W, H).setInteractive().setDepth((scene.uiDepth || 800) + 21);
      zone.once('pointerdown', () => {
        zone.destroy();
        scene.tweens.add({
          targets: c, alpha: 0, duration: 220,
          onComplete: () => { c.destroy(); resolve(); },
        });
      });
    });
  }

  // ---------------------------------------------------------------- layout
  /** Scatter positions across the play area (grid + jitter, no overlap). */
  function scatterPositions(count, area) {
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

  window.SceneKit = {
    C,
    KITS,
    get: getKit,
    visualFor,
    drawVisual,
    buildBackground,
    spawnAmbient,
    makeObject,
    idle,
    pulse,
    armLater,
    celebrate,
    commentaryLine,
    say,
    observeBeat,
    noticeBeat,
    scatterPositions,
  };
})();
