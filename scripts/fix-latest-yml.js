#!/usr/bin/env node
const fs = require('fs');

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return null;
  }
  return process.argv[index + 1];
}

const filePath = getArg('--file');
const arch = getArg('--arch');

if (!filePath || !arch) {
  console.error('Usage: node scripts/fix-latest-yml.js --file <path> --arch <x64|arm64>');
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const entryRegex = /- url:\s*(.+)\r?\n\s*sha512:\s*(.+)/g;
const entries = [];
let match;

while ((match = entryRegex.exec(content)) !== null) {
  entries.push({ url: match[1].trim(), sha512: match[2].trim() });
}

const target = entries.find((entry) => entry.url.includes(`-${arch}.exe`));
if (!target) {
  console.error(`No matching entry for arch "${arch}" in ${filePath}`);
  process.exit(1);
}

const filesBlockRegex = /files:\r?\n(?:[ \t].*\r?\n)*/;
if (!filesBlockRegex.test(content)) {
  console.error(`Unable to locate files block in ${filePath}`);
  process.exit(1);
}

let next = content.replace(
  filesBlockRegex,
  `files:\n  - url: ${target.url}\n    sha512: ${target.sha512}\n`
);
next = next.replace(/^path:.*$/m, `path: ${target.url}`);
next = next.replace(/^sha512:.*$/m, `sha512: ${target.sha512}`);

if (!next.endsWith('\n')) {
  next += '\n';
}

fs.writeFileSync(filePath, next, 'utf8');
