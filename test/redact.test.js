import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, isSensitivePath } from '../src/redact.js';

test('garde le nom, masque la valeur', () => {
  assert.equal(redact('RESEND_API_KEY=re_123456789abcdefghijk'), 'RESEND_API_KEY=••••');
  assert.equal(redact('export DB_PASSWORD="hunter2hunter"'), 'export DB_PASSWORD="••••"');
  assert.equal(redact('{"apiKey": "abcd1234efgh"}'), '{"apiKey": "••••"}');
});

test('masque les formats de clés connus', () => {
  assert.equal(redact('clé sk-ant-api03-abcdefghijklmnopqrstuvwx utilisée'), 'clé •••• utilisée');
  assert.equal(redact('Authorization: Bearer abcdefghijklmnop123'), 'Authorization: Bearer ••••');
  assert.equal(redact('postgres://admin:s3cret@localhost/db'), 'postgres://admin:••••@localhost/db');
  assert.equal(redact('ghp_abcdefghijklmnopqrstuvwxyz0123'), '••••');
});

test('laisse intacts le texte normal et les références à l’environnement', () => {
  assert.equal(redact('La clé RESEND_API_KEY est maintenant détectée.'), 'La clé RESEND_API_KEY est maintenant détectée.');
  assert.equal(redact('const key = process.env.RESEND_API_KEY'), 'const key = process.env.RESEND_API_KEY');
  assert.equal(redact('POST /forgot-password'), 'POST /forgot-password');
});

test('fichiers sensibles', () => {
  assert.ok(isSensitivePath('.env'));
  assert.ok(isSensitivePath('app/.env.local'));
  assert.ok(!isSensitivePath('.env.example'));
  assert.ok(isSensitivePath('certs/server.pem'));
  assert.ok(!isSensitivePath('src/env.js'));
});
