const fs = require('fs');
for (const [file, value] of [
  ['src/messages/toast/en.json', 'Cover photo updated.'],
  ['src/messages/toast/ar.json', 'تم تحديث صورة الغلاف.'],
]) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const next = {};
  for (const [key, text] of Object.entries(data.success)) {
    next[key] = text;
    if (key === 'avatarUpdated') next.bannerUpdated = value;
  }
  data.success = next;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
console.log('updated toast catalogs');
