import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, redactDeep } from '../src/redact.js';

// Les faux secrets sont construits à l'exécution : écrits en clair dans le code, ils
// seraient pris pour de vrais secrets par les scanners (GitGuardian, gitleaks, GitHub).
const fake = (prefix = '', length = 24) => prefix + 'x'.repeat(length);
const VALUE = fake('', 12);

test('garde le nom, masque la valeur', () => {
  assert.equal(redact('RESEND_API_KEY=' + fake('re_')), 'RESEND_API_KEY=••••');
  assert.equal(redact('export DB_PASSWORD="' + VALUE + '"'), 'export DB_PASSWORD="••••"');
  assert.equal(redact('{"apiKey": "' + VALUE + '"}'), '{"apiKey": "••••"}');
  assert.equal(redact('PASSWORD="' + ['une', 'phrase', 'avec', 'espaces'].join(' ') + '"'), 'PASSWORD="••••"');
  assert.equal(redact('DB_PWD=' + VALUE), 'DB_PWD=••••');
});

test('masque les formats de clés connus', () => {
  assert.equal(redact('clé ' + fake('sk-ant-api03-') + ' utilisée'), 'clé •••• utilisée');
  assert.equal(redact('Authorization: Bearer ' + fake()), 'Authorization: Bearer ••••');
  assert.equal(redact('postgres://admin:' + VALUE + '@localhost/db'), 'postgres://admin:••••@localhost/db');
  for (const prefix of ['ghp_', 'github_pat_', 'glpat-', 'npm_', 'hf_', 'xoxb-']) {
    assert.equal(redact(fake(prefix, 36)), '••••', prefix);
  }
  assert.equal(redact('AKIA' + 'X'.repeat(16)), '••••');
});

test('masque les secrets passés en option de ligne de commande', () => {
  assert.equal(redact('mysql -u root -p' + VALUE + ' db'), 'mysql -u root -p•••• db');
  const user = (password) => ['admin', password].join(':');
  assert.equal(redact('curl -u ' + user(VALUE) + ' https://api.example.com'), 'curl -u ' + user('••••') + ' https://api.example.com');
  assert.equal(redact('psql --password ' + VALUE), 'psql --password ••••');
  assert.equal(redact('deploy --api-key=' + VALUE + ' --verbose'), 'deploy --api-key=•••• --verbose');
});

test('laisse intacts le texte normal, les chemins et les références à l’environnement', () => {
  assert.equal(redact('La clé RESEND_API_KEY est maintenant détectée.'), 'La clé RESEND_API_KEY est maintenant détectée.');
  assert.equal(redact('const key = process.env.RESEND_API_KEY'), 'const key = process.env.RESEND_API_KEY');
  assert.equal(redact('POST /forgot-password'), 'POST /forgot-password');
  assert.equal(redact('TELEX_SESSION_DIR=/home/x/.telex/sessions/a node'), 'TELEX_SESSION_DIR=/home/x/.telex/sessions/a node');
  assert.equal(redact('PWD=/home/x'), 'PWD=/home/x');
  assert.equal(redact('{"author": "Jean Dupont"}'), '{"author": "Jean Dupont"}');
  assert.equal(redact('mkdir -p src/lib && ssh -p 2222 hote'), 'mkdir -p src/lib && ssh -p 2222 hote');
});

test('redactDeep masque récursivement', () => {
  assert.deepEqual(redactDeep({ a: ['TOKEN=' + VALUE], b: { c: 3 } }), { a: ['TOKEN=••••'], b: { c: 3 } });
});
