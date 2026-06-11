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

interface Manifest {
  phaserVersion: string;
  shells: Record<string, { file: string; shellVersion: string; bytes: number }>;
}

let manifest: Manifest | null = null;
const shellCache = new Map<string, string>();

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
    log.info(`[shells] ${Object.keys(m.shells).join(', ')} ready (phaser ${m.phaserVersion})`);
  }
}

export function getManifest(): Manifest {
  if (!manifest) {
    manifest = JSON.parse(readFileSync(join(shellsDir, 'manifest.json'), 'utf8')) as Manifest;
  }
  return manifest;
}

export function shellVersionFor(gameType: string): string {
  try {
    return getManifest().shells[gameType]?.shellVersion ?? '';
  } catch {
    return '';
  }
}

export function safeSpecJson(spec: unknown): string {
  return JSON.stringify(spec).replace(/</g, '\\u003c');
}

export function assembleHtml(gameType: string, spec: unknown): string {
  let shell = shellCache.get(gameType);
  if (!shell) {
    const file = join(shellsDir, `${gameType}.html`);
    if (!existsSync(file)) throw new Error(`shell not built: ${gameType}`);
    shell = readFileSync(file, 'utf8');
    shellCache.set(gameType, shell);
  }
  return shell.replace(SPEC_MARKER, safeSpecJson(spec));
}
