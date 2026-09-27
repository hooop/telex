// Application fictive pour la capture VHS, copiée dans un dossier jetable.
// Les tests exécutent ces sources ; ce n’est pas une implémentation à déployer.
export const auth = `import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 32).toString('hex');
}
export function verifyPassword(password, digest) {
  const [salt, hash] = digest.split(':');
  return timingSafeEqual(scryptSync(password, salt, 32),
    Buffer.from(hash, 'hex'));
}
`;

export const tokenStore = `import fs from 'node:fs';
export function tokenStore(file) {
  const read = () => fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const write = (rows) => fs.writeFileSync(file,
    JSON.stringify(rows), { mode: 0o600 });
  return {
    put: (token) => write([...read(), token]),
    find: (digest) => read().find((row) => row.digest === digest),
    consume: (digest) => write(read().filter(
      (row) => row.digest !== digest)),
  };
}
`;

export const resetService = ({ expiry = false, delivery = false, fixed = false } = {}) => `import { randomBytes, createHash } from 'node:crypto';
import { hashPassword } from './auth.mjs';
import { tokenStore } from './token-store.mjs';

const digest = (token) => createHash('sha256')
  .update(token).digest('hex');
const TTL = ${expiry ? '15 * 60 * 1000' : '24 * 60 * 60 * 1000'};
const MESSAGE = 'Si un compte existe, un lien vous sera envoyé.';

export function createResetService({ accounts, file, sendMail,
  now = Date.now }) {
  const tokens = tokenStore(file);
  return {
    requestReset(email) {
      if (accounts.has(email)) {
        const token = randomBytes(32).toString('hex');
        tokens.put({ digest: digest(token), email,
          expiresAt: now() + TTL });
${delivery ? `        sendMail({ to: email,
          url: 'https://demo.invalid/reset?token=' + token });` : '        // Le transport e-mail sera raccordé à l’étape suivante.'}
      }
      return MESSAGE;
    },
    applyReset(token, password) {
      const record = tokens.find(digest(token));
      if (!record || record.expiresAt <= now()) return false;
      if (password.length < 12) return false;
      const account = accounts.get(record.email);
      account.passwordHash = hashPassword(password);
${fixed ? `      // Un lien ne peut servir qu’une fois.
      tokens.consume(digest(token));
` : ''}      return true;
    },
  };
}
`;

export const routes = `export function resetRoutes(service) {
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/forgot-password' && request.method === 'POST') {
      const form = await request.formData();
      return Response.json({
        message: service.requestReset(String(form.get('email') || '')),
      });
    }
    if (url.pathname === '/reset-password' && request.method === 'POST') {
      const form = await request.formData();
      const ok = service.applyReset(String(form.get('token') || ''),
        String(form.get('password') || ''));
      return ok
        ? Response.redirect(new URL('/login?reset=done', url), 303)
        : new Response('Lien invalide ou mot de passe trop court.',
          { status: 400 });
    }
    return new Response('Page introuvable', { status: 404 });
  };
}
`;

export const form = `<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<title>Nouveau mot de passe</title>
<h1>Choisir un nouveau mot de passe</h1>
<form method="post" action="/reset-password">
  <input type="hidden" name="token" id="token">
  <label>Nouveau mot de passe
    <input type="password" name="password" minlength="12"
      autocomplete="new-password" required>
  </label>
  <button>Enregistrer mon mot de passe</button>
</form>
<script>
  document.querySelector('#token').value =
    new URL(location.href).searchParams.get('token') || '';
</script>
</html>
`;

export const tests = `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createResetService } from './src/reset.mjs';
import { hashPassword, verifyPassword } from './src/auth.mjs';
import { resetRoutes } from './src/routes.mjs';

const email = 'elodie@example.test';
const oldPassword = 'ancien-mot-de-passe';
const newPassword = 'nouveau-mot-de-passe';
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'telex-reset-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'tokens.json');
  const accounts = new Map([[email,
    { passwordHash: hashPassword(oldPassword) }]]);
  const outbox = []; // Transport simulé : aucune requête réseau.
  let time = 0;
  const restart = () => createResetService({ accounts, file,
    sendMail: (mail) => outbox.push(mail), now: () => time });
  const service = restart();
  const request = () => {
    service.requestReset(email);
    return new URL(outbox.at(-1).url).searchParams.get('token');
  };
  return { service, request, restart, accounts, outbox, file,
    advance: (ms) => { time += ms; } };
}

test('stocke seulement le hash du jeton', (t) => {
  const f = fixture(t);
  const token = f.request();
  const stored = fs.readFileSync(f.file, 'utf8');
  assert.equal(stored.includes(token), false);
  assert.match(JSON.parse(stored)[0].digest, /^[a-f0-9]{64}$/);
});
test('conserve le lien après rechargement du service', (t) => {
  const f = fixture(t);
  const token = f.request();
  assert.equal(f.restart().applyReset(token, newPassword), true);
});
test('refuse un lien expiré après quinze minutes', (t) => {
  const f = fixture(t);
  const token = f.request();
  f.advance(15 * 60 * 1000);
  assert.equal(f.service.applyReset(token, newPassword), false);
});
test('répond avec le même message pour un compte inconnu', (t) => {
  const f = fixture(t);
  const known = f.service.requestReset(email);
  const unknown = f.service.requestReset('inconnu@example.test');
  assert.equal(unknown, known);
  assert.equal(f.outbox.length, 1);
});
test('le formulaire change le mot de passe puis redirige', async (t) => {
  const f = fixture(t);
  const token = f.request();
  const response = await resetRoutes(f.service)(new Request(
    'https://demo.invalid/reset-password', { method: 'POST',
      body: new URLSearchParams({ token, password: newPassword }) }));
  assert.equal(response.status, 303);
  assert.match(response.headers.get('location'), /login/);
  assert.equal(verifyPassword(newPassword,
    f.accounts.get(email).passwordHash), true);
});
test('l’ancien mot de passe ne fonctionne plus', (t) => {
  const f = fixture(t);
  f.service.applyReset(f.request(), newPassword);
  assert.equal(verifyPassword(oldPassword,
    f.accounts.get(email).passwordHash), false);
});
test('un jeton inconnu ne modifie pas le compte', (t) => {
  const f = fixture(t);
  const before = f.accounts.get(email).passwordHash;
  assert.equal(f.service.applyReset('invalide', newPassword), false);
  assert.equal(f.accounts.get(email).passwordHash, before);
});
test('un lien déjà utilisé est refusé', (t) => {
  const f = fixture(t);
  const token = f.request();
  assert.equal(f.service.applyReset(token, newPassword), true);
  assert.equal(f.service.applyReset(token, 'autre-mot-de-passe'), false);
});
`;
