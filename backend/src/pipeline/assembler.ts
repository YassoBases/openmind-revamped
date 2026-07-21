/**
 * Shell assembly: inject a GameSpec into the versioned template shell at the
 * spec-slot marker. Assembled HTML is produced on serve, never stored.
 * `<` is escaped in the JSON so spec content can never break out of the
 * script tag (LLM/user-influenced text).
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const shellsDir = join(dataDir, 'shells');
const repoRoot = join(here, '..', '..', '..');

const SPEC_MARKER = '/*__EDUMIND_SPEC_JSON__*/null';

/** The unified shell hosts every game; spec.meta.gameType selects the module. */
const UNIFIED_SHELL = 'edumind';

interface Manifest {
  phaserVersion: string;
  unifiedShell?: string;
  games?: string[];
  shells: Record<string, { file: string; shellVersion: string; bytes: number; games?: string[] }>;
}

let manifest: Manifest | null = null;
let unifiedShellHtml: string | null = null;

/**
 * Boot-time data check: ensure shells exist (built by `npm -w shells run
 * build`) and copy phaser.min.js into data/ if absent (brief requirement;
 * shells already inline Phaser, this is the rebuild-source copy).
 */
export function ensureShellData(log: { info: (m: string) => void; warn: (m: string) => void }): void {
  const phaserTarget = join(dataDir, 'phaser.min.js');
  if (!existsSync(phaserTarget)) {
    for (const candidate of [
      join(repoRoot, 'node_modules', 'phaser', 'dist', 'phaser.min.js'),
      join(here, '..', '..', 'node_modules', 'phaser', 'dist', 'phaser.min.js'),
    ]) {
      if (existsSync(candidate)) {
        copyFileSync(candidate, phaserTarget);
        log.info('[shells] copied phaser.min.js into backend data dir');
        break;
      }
    }
  }
  if (!existsSync(join(shellsDir, 'manifest.json'))) {
    log.warn('[shells] built shells missing — run `npm -w shells run build` (play/assembly endpoints will 503)');
  } else {
    const m = getManifest();
    const games = m.shells[UNIFIED_SHELL]?.games ?? m.games ?? Object.keys(m.shells);
    log.info(`[shells] unified shell ready — games: ${games.join(', ')} (phaser ${m.phaserVersion})`);
  }
}

export function getManifest(): Manifest {
  if (!manifest) {
    manifest = JSON.parse(readFileSync(join(shellsDir, 'manifest.json'), 'utf8')) as Manifest;
  }
  return manifest;
}

export function shellVersionFor(_gameType: string): string {
  try {
    return getManifest().shells[UNIFIED_SHELL]?.shellVersion ?? '';
  } catch {
    return '';
  }
}

export function safeSpecJson(spec: unknown): string {
  return JSON.stringify(spec).replace(/</g, '\\u003c');
}

export function assembleHtml(_gameType: string, spec: unknown): string {
  if (!unifiedShellHtml) {
    const file = join(shellsDir, `${UNIFIED_SHELL}.html`);
    if (!existsSync(file)) throw new Error('shell not built: run `npm -w shells run build`');
    unifiedShellHtml = readFileSync(file, 'utf8');
  }
  return unifiedShellHtml.replace(SPEC_MARKER, safeSpecJson(spec));
}
