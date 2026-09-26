/**
 * Renders the "simple pictures" (original flat illustrations) into photos/library/<category>/simple-*.jpg
 * with attribution sidecars, then rebuilds photos.json.
 * Usage: npm run photos:simple
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config';
import { SIMPLE_SCENES, sceneSvg } from '../scenes/simpleScenes';
import { buildManifest } from './seedManifest';

async function main(): Promise<void> {
  const slugs = new Set<string>();
  for (const scene of SIMPLE_SCENES) {
    if (slugs.has(scene.slug)) throw new Error(`duplicate scene slug ${scene.slug}`);
    slugs.add(scene.slug);
    const dir = path.join(config.photos.dir, 'library', scene.category);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `simple-${scene.slug}.jpg`);
    const jpeg = await sharp(Buffer.from(sceneSvg(scene))).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
    await fs.writeFile(file, jpeg);
    await fs.writeFile(
      `${file}.json`,
      JSON.stringify(
        {
          title: scene.title,
          difficulty: scene.difficulty,
          theme: 'simple',
          author: 'Copy Cat Clash',
          sourceUrl: null,
          license: 'CC0 1.0 (original artwork)',
          licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        },
        null,
        2,
      ),
    );
  }
  console.log(`Rendered ${SIMPLE_SCENES.length} simple pictures`);
  const manifest = await buildManifest();
  const simple = manifest.photos.filter((p) => p.theme === 'simple').length;
  console.log(`photos.json: ${manifest.count} total, ${simple} simple pictures`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
