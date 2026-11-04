const fs = require('fs');
const path = require('path');
const root = 'src/hooks';
const files = fs.readdirSync(root).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'useAiChat.ts');
let mutations = 0;
const missing = [];
const keys = new Set();
for (const file of files) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes('useMutation({')) {
      mutations += 1;
      if (!lines[i + 1]?.trim().startsWith('meta:')) missing.push(`${file}:${i + 1}`);
    }
    for (const match of line.matchAll(/'(success\.[A-Za-z0-9]+)'/g)) keys.add(match[1]);
  });
}
const en = JSON.parse(fs.readFileSync('src/messages/toast/en.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('src/messages/toast/ar.json', 'utf8'));
const known = new Set([...Object.keys(en.success).map((k) => `success.${k}`), ...Object.keys(en.error).map((k) => `error.${k}`)]);
const unknown = [...keys].filter((k) => !known.has(k));
const unused = [...known].filter((k) => k.startsWith('success.') && !keys.has(k));
console.log(JSON.stringify({ mutations, missing, staticKeys: keys.size, unknown, unused }, null, 2));
