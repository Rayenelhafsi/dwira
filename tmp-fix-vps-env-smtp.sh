cd /var/www/dwiraimmobilier.com/public
cp .env ".env.bak-quote-smtp-$(date +%Y%m%d%H%M%S)"
node - <<'NODE'
const fs = require('fs');
const path = '.env';
let text = fs.readFileSync(path, 'utf8');
text = text.replace(/^SMTP_PASS=(.*)$/m, (_, value) => {
  const raw = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  return `SMTP_PASS=${JSON.stringify(raw)}`;
});
fs.writeFileSync(path, text);
console.log('SMTP_PASS_QUOTED');
NODE
nl -ba .env | sed -n '100,106p' | sed 's/SMTP_PASS=.*/SMTP_PASS=***MASKED***/'
