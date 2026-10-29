import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, 'tsconfig.base.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const errors = [];

if (config.error) errors.push(config.error);
else {
  const parsed = ts.convertCompilerOptionsFromJson(config.config.compilerOptions ?? {}, root);
  errors.push(...parsed.errors);
}

for (const relative of [
  'apps/mobile',
  'apps/web',
  'packages/api-contracts',
  'packages/protocol',
  'docs',
]) {
  if (!existsSync(resolve(root, relative)))
    throw new Error(`Missing workspace directory: ${relative}`);
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (!pkg.private || !pkg.packageManager?.startsWith('pnpm@')) {
  throw new Error('Root package must be private and pin pnpm.');
}
if (errors.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(errors, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (file) => file,
      getNewLine: () => '\n',
    }),
  );
  process.exit(1);
}
console.log('Workspace directories and TypeScript base configuration are valid.');
