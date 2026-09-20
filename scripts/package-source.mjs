import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyRepository } from './check-repository.mjs';
import process from 'node:process';
import console from 'node:console';

try {
  verifyRepository();
  // Archive exactly the verified index, without requiring a commit or including ignored local files.
  const tree = execFileSync('git', ['write-tree'], { encoding: 'utf8' }).trim();
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error('Invalid package version.');
  mkdirSync('.release', { recursive: true });
  const output = resolve('.release', `punch-studio-${version}-source.zip`);
  execFileSync('git', [
    'archive',
    '--format=zip',
    '--prefix=punch-studio/',
    '--output',
    output,
    tree,
  ]);
  console.log(`Source archive ready: .release/punch-studio-${version}-source.zip`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
