import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoLib = path.resolve(__dirname, '..', '..', 'lib');
const extCore = path.resolve(__dirname, '..', 'core');

rmSync(extCore, { recursive: true, force: true });
mkdirSync(extCore, { recursive: true });
cpSync(repoLib, extCore, { recursive: true });

console.log(`Synced core engine from ${repoLib} -> ${extCore}`);
