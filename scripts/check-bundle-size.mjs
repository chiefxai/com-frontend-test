import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const assetsDir = 'dist/assets';
const files = readdirSync(assetsDir).filter(name => name.endsWith('.js'));
const entries = files.filter(name => /^index-[\w-]+\.js$/.test(name));
if (entries.length !== 1) {
  console.error('Expected exactly one frontend entry JS asset; found', entries.length);
  process.exit(1);
}

const bytes = name => statSync(join(assetsDir, name)).size;
const maxEntryBytes = 350_000; // Current ~251kB. Keeps route-level lazy loading intact.
const maxChunkBytes = 500_000; // Avoid expensive monolithic feature chunks.
const entryBytes = bytes(entries[0]);
const oversized = files.filter(name => bytes(name) > maxChunkBytes);
console.log(`Entry JS: ${entries[0]} (${(entryBytes / 1000).toFixed(1)} kB / ${(maxEntryBytes / 1000).toFixed(0)} kB budget)`);
if (oversized.length) console.error('Oversized JS chunks:', oversized.map(name => `${name} (${(bytes(name) / 1000).toFixed(1)} kB)`).join(', '));
if (entryBytes > maxEntryBytes || oversized.length) process.exit(1);
console.log(`Bundle size budget passed across ${files.length} JS assets.`);
