#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dir, '..', 'dist');
const templatePath = join(__dir, '..', 'index.gateway.html');

const js = readdirSync(join(distDir, 'assets')).find((f) => f.startsWith('index-') && f.endsWith('.js'));
const css = readdirSync(join(distDir, 'assets')).find((f) => f.startsWith('index-') && f.endsWith('.css'));
if (!js || !css) {
  console.error('Missing Vite build assets');
  process.exit(1);
}

const html = readFileSync(templatePath, 'utf8')
  .replace('__ECOM_JS__', js)
  .replace('__ECOM_CSS__', css);

writeFileSync(join(distDir, 'index.html'), html);
console.log('Wrote dist/index.html with', js, css);
