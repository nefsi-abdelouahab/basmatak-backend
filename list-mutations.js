const fs = require('fs');
const path = require('path');
const root = 'src/hooks';
const files = fs.readdirSync(root).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
const silent = [];
const active = [];
for (const file of files) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  let fn = '';
  lines.forEach((line, i) => {
    const m = line.match(/export function (\w+)/);
    if (m) fn = m[1];
    if (line.includes('useMutation({')) {
      const block = lines.slice(i, i + 8).join('\n');
      (block.includes('silent: true') ? silent : active).push({ fn, file, line: i + 1 });
    }
  });
}
console.log('SILENT', JSON.stringify(silent, null, 2));
console.log('ACTIVE', JSON.stringify(active, null, 2));
