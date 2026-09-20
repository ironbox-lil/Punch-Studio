import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';

const forbidden =
  /(^|\/)(?:\.env(?!\.example$)[^/]*|\.local|\.release|node_modules|dist|dist-server|base photos|reference|artifacts|test-results|playwright-report|coverage|__pycache__|\.DS_Store)(?:\/|$)|(?:\.pem|\.key|\.log)$|^docs\/deepseek-vision-check\.json$/;
const tokenPatterns = [
  /\bsk-[a-zA-Z0-9_-]{20,}\b/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{30,}\b/,
  /\bgithub_pat_[a-zA-Z0-9_]{30,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

function localSecrets() {
  const values = [];
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?[A-Z_]*(?:KEY|TOKEN|PASSWORD)\s*=\s*(.*?)\s*$/);
      if (match) values.push(match[1].replace(/^['"]|['"]$/g, ''));
    }
  }
  if (existsSync('.local/llm.json')) {
    try {
      values.push(JSON.parse(readFileSync('.local/llm.json', 'utf8')).apiKey);
    } catch {
      throw new Error('Cannot inspect the local settings file. Fix it before preparing a release.');
    }
  }
  return values.filter((value) => typeof value === 'string' && value.length >= 8);
}

export function verifyRepository() {
  const files = execFileSync('git', ['ls-files', '--cached', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  if (!files.length)
    throw new Error('No staged source files. Stage the intended release first with git add .');
  const secrets = localSecrets();
  const failures = [];
  for (const file of files) {
    if (forbidden.test(file)) {
      failures.push(`${file}: private or generated file`);
      continue;
    }
    const bytes = execFileSync('git', ['show', `:${file}`], { maxBuffer: 10 * 1024 * 1024 });
    const text = bytes.toString('utf8');
    if (
      tokenPatterns.some((pattern) => pattern.test(text)) ||
      secrets.some((secret) => text.includes(secret))
    )
      failures.push(`${file}: possible credential (value withheld)`);
    if (/\/Users\/[^/\s]+\/|C:\\Users\\/i.test(text))
      failures.push(`${file}: personal absolute path`);
  }
  for (const file of [
    'package.json',
    'package-lock.json',
    '.env.example',
    '.gitignore',
    '.nvmrc',
    'README.md',
    'server/index.ts',
    'src/main.tsx',
  ])
    if (!files.includes(file)) failures.push(`${file}: required source file missing`);
  if (failures.length) throw new Error(`Repository check failed:\n${failures.join('\n')}`);
  console.log(
    `Repository check passed: ${files.length} source files, no detected credentials or private artifacts.`,
  );
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    verifyRepository();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
