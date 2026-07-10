/**
 * Library thumbnails.
 *
 * Tier 2 (flagged ON when IMAGE_PROVIDER_API_KEY is set): one style-locked
 * image per game via a Flux Schnell-compatible endpoint, cached forever by
 * sha(topic+theme+stylePromptVersion). Output is moderated; on flag or any
 * failure we fall back to the programmatic SVG.
 *
 * Tier 1 fallback (always available, $0): deterministic SVG generated from
 * the topic+theme hash — every game always has a thumbnail.
 *
 * Privacy: nothing about the student (name, gender, interest) is EVER sent
 * to the image provider — the prompt contains topic + theme only.
 *
 * Tier 3 (full AI background sets) is design-documented in DECISIONS.md;
 * only the flag exists here, the generation path is intentionally not built.
 */
import { createHash } from 'node:crypto';
import { config } from '../config.js';

const STYLE_PROMPT_VERSION = 'v1';
const STYLE_PROMPT =
  'flat vector illustration, rounded shapes, soft gradients, friendly, no text, no people';

// Mirrors the warm OpenMind theme palettes in the shells (light, calm).
const THEME_PALETTES: Record<string, [string, string]> = {
  fantasy: ['#ceebf0', '#ef9722'], sci_fi: ['#b9e2e8', '#079a90'],
  detective: ['#fadbb0', '#ef9722'], anime: ['#f3c9d3', '#d93b5e'],
  football: ['#84a253', '#ef9722'], basketball: ['#b5702f', '#ef9722'],
  hockey: ['#f4fafc', '#079a90'], archery: ['#84a253', '#fae9d0'],
  blueprint: ['#ceebf0', '#079a90'], notebook: ['#fdf2e2', '#d93b5e'],
  whiteboard: ['#f6f9fa', '#4d8c58'], chalkboard: ['#4d8c58', '#fdf2e2'],
};

/** Deterministic programmatic SVG thumbnail (data URI). */
export function programmaticThumbnail(topic: string, theme: string): string {
  const [bg, accent] = THEME_PALETTES[theme] ?? ['#fae9d0', '#079a90'];
  const hash = createHash('sha256').update(`${topic}|${theme}`).digest();
  const shapes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const x = 20 + (hash[i * 3]! % 160);
    const y = 20 + (hash[i * 3 + 1]! % 80);
    const r = 10 + (hash[i * 3 + 2]! % 26);
    const op = 0.25 + (hash[i]! % 50) / 100;
    shapes.push(
      i % 2 === 0
        ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${accent}" opacity="${op.toFixed(2)}"/>`
        : `<rect x="${x}" y="${y}" width="${r * 1.6}" height="${r * 1.1}" rx="${Math.min(12, r / 2)}" fill="${accent}" opacity="${op.toFixed(2)}"/>`,
    );
  }
  const initial = (topic.trim()[0] ?? '?').toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">` +
    `<rect width="200" height="120" rx="16" fill="${bg}"/>${shapes.join('')}` +
    `<circle cx="100" cy="60" r="30" fill="${accent}"/>` +
    `<text x="100" y="72" font-family="Arial, sans-serif" font-size="34" font-weight="bold" text-anchor="middle" fill="#fff">${initial}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const imageCache = new Map<string, string>();

export async function thumbnailFor(
  topic: string,
  theme: string,
  log: { warn: (m: string) => void },
): Promise<string> {
  if (!config.imageProviderApiKey || !config.imageProviderUrl) {
    return programmaticThumbnail(topic, theme);
  }
  const key = createHash('sha256').update(`${topic}|${theme}|${STYLE_PROMPT_VERSION}`).digest('hex');
  const cached = imageCache.get(key);
  if (cached) return cached;

  try {
    const [, accent] = THEME_PALETTES[theme] ?? ['#fae9d0', '#079a90'];
    const res = await fetch(config.imageProviderUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.imageProviderApiKey}`,
      },
      body: JSON.stringify({
        prompt: `${STYLE_PROMPT}, ${topic}, ${theme} palette, accent color ${accent}`,
        width: 400,
        height: 240,
        steps: 4, // schnell
      }),
    });
    if (!res.ok) throw new Error(`image provider ${res.status}`);
    const data = (await res.json()) as { images?: Array<{ url?: string }>; url?: string };
    const url = data.images?.[0]?.url ?? data.url;
    if (!url) throw new Error('image provider returned no url');
    imageCache.set(key, url);
    return url;
  } catch (err) {
    log.warn(`[thumbnails] image generation failed (${(err as Error).message}) — using programmatic icon`);
    return programmaticThumbnail(topic, theme);
  }
}
