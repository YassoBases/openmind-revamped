/**
 * Exports the tool descriptors' golden payloads to the Flutter test fixture
 * (edumind-ui/test/fixtures/tool_goldens.json). This is the anti-drift bridge
 * between the TypeScript registry and the Dart renderers: a backend test
 * asserts the committed fixture matches the registry, and a Flutter test
 * asserts every golden parses renderable. Run after changing any descriptor:
 *
 *   npm -w backend run export:goldens
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGoldenFixture } from '../tutor/tools/fixture.js';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', '..', '..', 'edumind-ui', 'test', 'fixtures', 'tool_goldens.json');

writeFileSync(target, buildGoldenFixture());
console.log(`wrote ${target}`);
