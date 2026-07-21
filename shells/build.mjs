/**
 * Shell build: inlines Phaser 4.1.0 + fonts + libs + ALL game modules into
 * ONE single-file unified HTML shell (dist/edumind.html), hashes it
 * (shellVersion), and copies the artifact everywhere it's consumed:
 *   - shells/dist/            (preview harness, tests)
 *   - backend/src/data/shells (server-side assembly)
 *   - flutter_module/assets/  (bundled offline shell + demo specs)
 *
 * Every game registers via EduCore.register(); the template's final script
 * calls EduCore.bootFromRegistry(spec), which selects the module named by
 * spec.meta.gameType. One artifact hosts every game — one WebView path for
 * any stage type, and ~6.5MB less app weight than five per-game shells.
 *
 * The spec slot marker `/*__EDUMIND_SPEC_JSON__*\/null` stays in the built
 * file — hosts replace it with the (escaped) GameSpec JSON at serve time.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const GAMES = ['quest_path', 'goal_shootout', 'draw_connect', 'number_city', 'scene_play'];

function read(p) {
  return readFileSync(p, 'utf8');
}

function fontFace(family, weight, file) {
  const data = readFileSync(file).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format('woff2');}`;
}

function findModule(rel) {
  // works whether deps land in shells/node_modules or hoisted to the root
  for (const base of [join(here, 'node_modules'), join(root, 'node_modules')]) {
    const p = join(base, rel);
    if (existsSync(p)) return p;
  }
  throw new Error(`Cannot find module file: ${rel} — run npm install first`);
}

console.log('[shells] building…');

const template = read(join(here, 'src', 'template.html'));
const phaser = read(findModule('phaser/dist/phaser.min.js'));
const phaserVersion = JSON.parse(read(findModule('phaser/package.json'))).version;
const gamefeel = read(join(here, 'src', 'lib', 'gamefeel.js'));
const interact = read(join(here, 'src', 'lib', 'interact.js'));
const mascot = read(join(here, 'src', 'lib', 'mascot.js'));
const educore = read(join(here, 'src', 'lib', 'educore.js'));
const scenekit = read(join(here, 'src', 'lib', 'scenekit.js'));

const fontsCss = [
  fontFace('Nunito', 700, findModule('@fontsource/nunito/files/nunito-latin-700-normal.woff2')),
  fontFace('Nunito', 800, findModule('@fontsource/nunito/files/nunito-latin-800-normal.woff2')),
  fontFace('Tajawal', 700, findModule('@fontsource/tajawal/files/tajawal-arabic-700-normal.woff2')),
  fontFace('Tajawal', 800, findModule('@fontsource/tajawal/files/tajawal-arabic-800-normal.woff2')),
].join('\n');

// Optional Kenney art (user-fetched; the shells are complete without it).
const kenneyDir = join(here, 'assets', 'kenney');
const kenneyNote = existsSync(kenneyDir) && readdirSync(kenneyDir).length > 0
  ? `/* kenney assets present: ${readdirSync(kenneyDir).length} files (not inlined in v4.0 — programmatic art is primary) */`
  : '/* no kenney assets — programmatic art (by design, fully supported) */';

function inject(tpl, marker, code) {
  const slot = `/* {{${marker}}} */`;
  const idx = tpl.indexOf(slot);
  if (idx === -1) throw new Error(`template missing marker ${marker}`);
  // split/join (not replace) so `$` sequences in minified code stay intact
  return tpl.split(slot).join(code);
}

const distDir = join(here, 'dist');
mkdirSync(distDir, { recursive: true });

const UNIFIED = 'edumind';

const gamesJs = GAMES
  .map((game) => `/* ==== game module: ${game} ==== */\n${read(join(here, 'src', 'games', `${game}.js`))}`)
  .join('\n');

let html = template;
html = html.split('{{GAME_NAME}}').join('Games');
html = inject(html, 'FONTS_CSS', fontsCss);
html = inject(html, 'PHASER_JS', `${kenneyNote}\n${phaser}`);
html = inject(html, 'GAMEFEEL_JS', gamefeel);
html = inject(html, 'INTERACT_JS', interact);
html = inject(html, 'MASCOT_JS', mascot);
html = inject(html, 'EDUCORE_JS', educore);
html = inject(html, 'SCENEKIT_JS', scenekit);
html = inject(html, 'GAME_JS', gamesJs);

writeFileSync(join(distDir, `${UNIFIED}.html`), html);
const hash = createHash('sha256').update(html).digest('hex').slice(0, 16);
const manifest = {
  builtAt: new Date().toISOString(),
  phaserVersion,
  unifiedShell: UNIFIED,
  games: GAMES,
  shells: {
    [UNIFIED]: {
      file: `${UNIFIED}.html`,
      shellVersion: hash,
      bytes: Buffer.byteLength(html),
      games: GAMES,
    },
  },
};
console.log(`[shells] ${UNIFIED}.html  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB  v=${hash}  (games: ${GAMES.join(', ')})`);

writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

// Remove stale per-game artifacts from the pre-unified layout.
function dropLegacyShells(dir) {
  for (const game of GAMES) rmSync(join(dir, `${game}.html`), { force: true });
}
dropLegacyShells(distDir);

// ---- copy artifacts to consumers --------------------------------------
const backendShells = join(root, 'backend', 'src', 'data', 'shells');
mkdirSync(backendShells, { recursive: true });
copyFileSync(join(distDir, `${UNIFIED}.html`), join(backendShells, `${UNIFIED}.html`));
copyFileSync(join(distDir, 'manifest.json'), join(backendShells, 'manifest.json'));
dropLegacyShells(backendShells);

// Both Flutter apps consume the bundled shells + demo specs: the original
// flutter_module and the merged edumind-ui (OpenMind AI engine inside the
// EduMind skin). Keep them in lockstep from this single build.
const samplesDir = join(root, 'samples');
const sampleFiles = readdirSync(samplesDir).filter((f) => f.endsWith('.json'));

function copyToFlutterApp(appDir) {
  const shellsOut = join(appDir, 'assets', 'shells');
  mkdirSync(shellsOut, { recursive: true });
  copyFileSync(join(distDir, `${UNIFIED}.html`), join(shellsOut, `${UNIFIED}.html`));
  copyFileSync(join(distDir, 'manifest.json'), join(shellsOut, 'manifest.json'));
  dropLegacyShells(shellsOut);

  const samplesOut = join(appDir, 'assets', 'samples');
  mkdirSync(samplesOut, { recursive: true });
  for (const f of sampleFiles) {
    copyFileSync(join(samplesDir, f), join(samplesOut, f));
  }
}

const flutterApps = [join(root, 'flutter_module'), join(root, 'edumind-ui')]
  .filter((d) => existsSync(d));
for (const app of flutterApps) copyToFlutterApp(app);

console.log(`[shells] copied to backend/src/data/shells + ${flutterApps.length} flutter app(s) assets/{shells,samples}`);
console.log('[shells] done.');
