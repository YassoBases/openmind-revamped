/**
 * Shell CI — static validators.
 *
 * v3 ran 18 validators against every generated game at runtime. v4's games are
 * hand-built templates, so the same guarantees become build-time assertions
 * run once per shell change. Checks run against the lib/game sources and the
 * built dist HTML (run `npm -w shells run build` first — the test script does).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shellsDir = join(here, '..');

const GAMES = ['quest_path', 'goal_shootout', 'draw_connect'];
const read = (p) => readFileSync(p, 'utf8');

const libs = {
  gamefeel: read(join(shellsDir, 'src', 'lib', 'gamefeel.js')),
  interact: read(join(shellsDir, 'src', 'lib', 'interact.js')),
  mascot: read(join(shellsDir, 'src', 'lib', 'mascot.js')),
  educore: read(join(shellsDir, 'src', 'lib', 'educore.js')),
};
const games = Object.fromEntries(
  GAMES.map((g) => [g, read(join(shellsDir, 'src', 'games', `${g}.js`))])
);
const template = read(join(shellsDir, 'src', 'template.html'));
const allOurCode = Object.values(libs).join('\n') + Object.values(games).join('\n');

describe('built artifacts', () => {
  it('all three shells are built single-file HTML with the spec slot', () => {
    for (const g of GAMES) {
      const p = join(shellsDir, 'dist', `${g}.html`);
      expect(existsSync(p), `${g}.html missing — run build`).toBe(true);
      const html = read(p);
      expect(html).toContain('/*__EDUMIND_SPEC_JSON__*/null');
      expect(html.length).toBeGreaterThan(500_000); // phaser inlined
      // no external resource loads in the document
      expect(html).not.toMatch(/<script[^>]+src=/i);
      expect(html).not.toMatch(/<link[^>]+href=/i);
      expect(html).not.toMatch(/url\(\s*['"]?https?:/i);
    }
  });

  it('manifest carries a shellVersion hash per game', () => {
    const manifest = JSON.parse(read(join(shellsDir, 'dist', 'manifest.json')));
    expect(manifest.phaserVersion).toBe('4.1.0');
    for (const g of GAMES) {
      expect(manifest.shells[g].shellVersion).toMatch(/^[0-9a-f]{16}$/);
    }
  });
});

describe('no browser storage, no network, no keyboard (our code)', () => {
  it('never touches localStorage/sessionStorage/indexedDB/cookies', () => {
    expect(allOurCode).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });

  it('never fetches or opens connections', () => {
    expect(allOurCode).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/);
  });

  it('registers no keyboard handlers (one-finger touch only)', () => {
    expect(allOurCode).not.toMatch(/keyboard|addKey\(|createCursorKeys|keydown|keyup/i);
  });

  it('uses Web Audio only — no <audio>, no audio file loads', () => {
    expect(allOurCode).not.toMatch(/\.mp3|\.ogg|\.wav|new Audio\(|load\.audio/);
    expect(libs.gamefeel).toContain('AudioContext');
  });
});

describe('scene contract', () => {
  it('exactly IntroScene / GameScene / EndScene are registered', () => {
    const keys = [...allOurCode.matchAll(/key:\s*'(\w+)'/g)].map((m) => m[1]);
    const sceneKeys = keys.filter((k) => k.endsWith('Scene'));
    expect(new Set(sceneKeys)).toEqual(new Set(['IntroScene', 'GameScene', 'EndScene']));
  });

  it('every game extends EduCore.BaseGameScene and boots through EduCore', () => {
    for (const g of GAMES) {
      expect(games[g]).toMatch(/extends EduCore\.BaseGameScene/);
      expect(games[g]).toMatch(/EduCore\.boot\(window\.__EDUMIND_SPEC__/);
    }
  });

  it('AdaptiveEngine drives item selection, fed by first-try correctness only', () => {
    expect(libs.educore).toContain('class AdaptiveEngine');
    expect(libs.educore).toMatch(/engine\.pickItems/);
    expect(libs.educore).toMatch(/engine\.recordAnswer\(firstTry\)/);
    // combo, hints and retries must never feed the engine
    expect(libs.educore).not.toMatch(/recordAnswer\([^)]*combo/);
    expect(libs.educore).not.toMatch(/recordAnswer\([^)]*hint/);
    expect(libs.educore).not.toMatch(/recordAnswer\(solved\)|recordAnswer\(recovered\)/);
  });

  it('draw_connect builds on the shared Interact drag primitive', () => {
    expect(libs.interact).toMatch(/attachDrag/);
    expect(games.draw_connect).toMatch(/Interact\.attachDrag\(/);
    // the bespoke per-game pointer state machine is gone
    expect(games.draw_connect).not.toMatch(/this\.input\.on\('pointerdown'/);
  });
});

describe('juice density (GameFeel)', () => {
  for (const g of GAMES) {
    it(`${g} uses GameFeel heavily (≥10 calls, ≥4 distinct methods)`, () => {
      const calls = [...games[g].matchAll(/\bthis\.feel\.(\w+)\(|\bGameFeel\.audio\.(\w+)\(/g)]
        .map((m) => m[1] || 'audio.' + m[2]);
      expect(calls.length, `${g}: only ${calls.length} GameFeel calls`).toBeGreaterThanOrEqual(10);
      expect(new Set(calls).size, `${g}: only ${new Set(calls).size} distinct`).toBeGreaterThanOrEqual(4);
    });

    it(`${g} includes the character duo and applies the student's color`, () => {
      // Hudhud the hoopoe (guide) lives in each game; Nahla the bee appears
      // only as EduCore's brief success celebration (never HUD furniture).
      expect(games[g]).toMatch(/new Hoopoe\(/);
      expect(libs.educore).toMatch(/new Bee\(/);
      expect(libs.mascot).toMatch(/class Hoopoe/);
      expect(libs.mascot).toMatch(/class Bee/);
      expect(games[g]).toMatch(/EduCore\.accentInt/);
    });
  }

  it('the bee is celebration-only: no persistent HUD bee, never beside Hudhud', () => {
    // no buddy mounted in the HUD; celebrations go through beeCelebration
    expect(libs.educore).not.toMatch(/this\.buddy/);
    expect(libs.educore).toMatch(/beeCelebration\(kind\)/);
    // games never construct the bee themselves
    for (const g of GAMES) expect(games[g]).not.toMatch(/new Bee\(/);
    // the summary (rewards moment) is Nahla's alone — no Hoopoe in EndScene
    const endScene = libs.educore.slice(libs.educore.indexOf('function createEndScene'));
    expect(endScene).not.toMatch(/new Hoopoe\(/);
  });
});

describe('design system', () => {
  it('renders the warm OpenMind palette — no dark game-studio backgrounds', () => {
    // warm cream base + deep-teal ink live in the engine and template
    expect(libs.educore).toMatch(/0xfdf2e2/i);
    expect(libs.educore).toMatch(/0x19725e/i);
    expect(libs.educore).toMatch(/0x079a90/i);
    expect(template).toContain('#FDF2E2');
    // the old near-black base is gone from every surface (mascot pupils and
    // similar character-art details are the only allowed dark inks)
    expect(template).not.toMatch(/#131F24/i);
    expect(libs.educore).not.toMatch(/131f24/i);
    expect(libs.gamefeel).not.toMatch(/131f24/i);
    for (const g of GAMES) expect(games[g]).not.toMatch(/131f24/i);
  });

  it('candy buttons are the only button primitive (≥3 uses per game incl. core)', () => {
    expect(template).not.toMatch(/<button/i);
    expect(allOurCode).not.toMatch(/add\.dom\(/);
    for (const g of GAMES) {
      const combined = games[g] + libs.educore;
      const count = (combined.match(/candyButton\(/g) || []).length;
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });

  it('touch targets are floored at 44px in the button primitive', () => {
    expect(libs.gamefeel).toMatch(/TOUCH_MIN = 44/);
    expect(libs.gamefeel).toMatch(/Math\.max\(w, TOUCH_MIN\)/);
    expect(libs.gamefeel).toMatch(/Math\.max\(h, TOUCH_MIN\)/);
  });

  it('font sizes are floored (≥24px EN, ≥28px AR) in the shared text style', () => {
    expect(libs.educore).toMatch(/isRTL \? 28 : 24/);
    expect(libs.educore).toMatch(/Math\.max\(size, min\)/);
  });

  it('flashes are clamped ≤100ms and pure red is rewritten to amber', () => {
    expect(libs.gamefeel).toMatch(/Math\.min\(dur \|\| 90, 100\)/);
    expect(libs.gamefeel).toMatch(/safeFlashColor/);
    expect(libs.gamefeel).toMatch(/0xffb020/); // amber
  });

  it('correct-chain pitch caps at +12 semitones; wrong sound is E4→C4, no buzzer', () => {
    expect(libs.gamefeel).toMatch(/Math\.min\(Math\.max\(combo \|\| 0, 0\), 12\)/);
    expect(libs.gamefeel).toMatch(/329\.63/); // E4
    expect(libs.gamefeel).toMatch(/261\.63/); // C4
    expect(allOurCode).not.toMatch(/sawtooth/); // no harsh buzzer waveforms
  });

  it('crowd murmur retriggers every 4.5s, never continuous', () => {
    expect(libs.gamefeel).toMatch(/setInterval\(fire, 4500\)/);
  });

  it('particle pools cap at 36 alive', () => {
    expect(libs.gamefeel).toMatch(/PARTICLE_CAP_PER_POOL = 12/);
    const emitters = (libs.gamefeel.match(/maxAliveParticles: PARTICLE_CAP_PER_POOL/g) || []).length;
    expect(emitters).toBe(3);
  });
});

describe('Phaser 4 API lint', () => {
  it('no setTintFill, no pipelines, no TAU (all v3-isms)', () => {
    expect(allOurCode).not.toMatch(/setTintFill|setPipeline|Light2D|Math\.TAU|PI2\b/);
  });

  it('720x1280 portrait, Scale.FIT + CENTER_BOTH', () => {
    expect(libs.educore).toMatch(/mode: Phaser\.Scale\.FIT/);
    expect(libs.educore).toMatch(/autoCenter: Phaser\.Scale\.CENTER_BOTH/);
    expect(libs.educore).toMatch(/const W = 720/);
    expect(libs.educore).toMatch(/const H = 1280/);
  });
});

describe('bridge + lifecycle guarantees', () => {
  it('all 5 bridge calls exist and are dual-channel', () => {
    for (const fn of ['reportScore', 'reportLevel', 'reportSummary', 'reportComplete', 'reportEvent']) {
      expect(libs.educore).toContain(fn);
    }
    expect(libs.educore).toMatch(/window\.EduMind\.postMessage/);
    expect(libs.educore).toMatch(/window\.parent\.postMessage/);
  });

  it('levelStart returns a Promise and the loop awaits it (v3 overlap bug)', () => {
    expect(libs.educore).toMatch(/await this\.levelStart\(/);
    expect(libs.educore).toMatch(/levelStart\(levelIndex, title\) \{[\s\S]*?return new Promise/);
  });

  it('levelEnd requires TAP TO CONTINUE — never auto-advance', () => {
    expect(libs.educore).toMatch(/levelEnd\(levelIndex, ratio\) \{[\s\S]*?tapToContinue/);
    expect(libs.educore).toMatch(/zone\.once\('pointerdown'/);
  });

  it('no hearts, no lives, no point loss — supportive retry instead', () => {
    // the hearts mechanic is gone from the code entirely (comments may still
    // explain its absence, so match code identifiers and copy, not prose)
    expect(allOurCode).not.toMatch(/session\.hearts|ADAPT\.hearts|drawHeart|heartIcons|Lost a heart|lostHeart/);
    // wrong answers earn a retry with the next hint auto-offered
    expect(libs.educore).toMatch(/supportiveRetry/);
    expect(libs.educore).toMatch(/autoHint/);
    expect(libs.educore).toMatch(/maxAttempts/);
  });

  it('gentle language: try-again and take-a-break, never WRONG/GAME OVER', () => {
    expect(libs.educore).toMatch(/Good try — look again!/);
    expect(libs.educore).toMatch(/Take a break/);
    expect(allOurCode).not.toMatch(/GAME OVER/i);
  });

  it('the 8-event learning contract is emitted through reportLearning', () => {
    expect(libs.educore).toMatch(/reportLearning\(name, extra\)/);
    for (const ev of [
      'experience_started', 'object_interacted', 'attempt_submitted',
      'hint_requested', 'hint_shown', 'misconception_detected',
      'level_completed', 'experience_completed',
    ]) {
      expect(allOurCode, `missing learning event ${ev}`).toContain(`'${ev}'`);
    }
    // every game emits the object-level interaction signal itself
    for (const g of GAMES) {
      expect(games[g]).toMatch(/object_interacted/);
    }
  });

  it('receiveSpec hot-load + generation-failure handling exist (progressive start)', () => {
    expect(libs.educore).toMatch(/receiveSpec\(input\)/);
    expect(libs.educore).toMatch(/generationFailed/);
    expect(libs.educore).toMatch(/waitingRoom/);
  });

  it('hints never feed XP beyond the 10/7/5 ladder and never reach the engine', () => {
    expect(libs.educore).toMatch(/hintsUsed === 0 \? XP\.noHint : hintsUsed === 1 \? XP\.oneHint : XP\.twoHints/);
  });
});

describe('tutorial (intro level) is built in', () => {
  for (const g of GAMES) {
    it(`${g} ships a runTutorial with localized EN+AR strings`, () => {
      expect(games[g]).toMatch(/async runTutorial\(\)/);
      expect(games[g]).toMatch(/TUTORIAL\s*=\s*\{[\s\S]*?en:/);
      expect(games[g]).toMatch(/ar:/);
    });
  }
});
