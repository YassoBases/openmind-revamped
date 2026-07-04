/**
 * The golden fixture serialization shared by the export script and the
 * staleness test — one function so "what the file should contain" has a
 * single definition.
 */
import { allGoldens } from './registry.js';

export function buildGoldenFixture(): string {
  const fixture = {
    _generated: 'by backend/src/scripts/export-goldens.ts — do not edit by hand',
    goldens: allGoldens(),
  };
  return `${JSON.stringify(fixture, null, 2)}\n`;
}
