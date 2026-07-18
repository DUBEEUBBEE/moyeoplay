import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('dist');
const textAssetPattern = /\.(?:css|html|js|json|txt|xml)$/;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(target) : [target];
    }),
  );
  return nested.flat();
}

const files = await listFiles(outputDirectory);
const sourceMaps = files.filter((file) => file.endsWith('.map'));
const developmentReferences = [];
for (const file of files.filter((target) => textAssetPattern.test(target))) {
  if ((await readFile(file, 'utf8')).includes('/src/main.ts')) {
    developmentReferences.push(path.relative(outputDirectory, file));
  }
}

if (sourceMaps.length > 0 || developmentReferences.length > 0) {
  if (sourceMaps.length > 0) {
    console.error(
      `Unexpected source maps: ${sourceMaps
        .map((file) => path.relative(outputDirectory, file))
        .join(', ')}`,
    );
  }
  if (developmentReferences.length > 0) {
    console.error(`Development entry references remain in: ${developmentReferences.join(', ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${String(files.length)} production files: no source maps or /src/main.ts references.`,
  );
}
