// Scénario fictif, affiché par la vraie TUI. Les instantanés, le diff et les
// tests portent sur un petit projet jetable. Aucun agent ni réseau n'est utilisé.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { Workspace } from '../../src/workspace.js';
import * as fixture from './password-reset.fixture.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'telex-timeline-'));
const home = path.join(temp, 'telex');
const project = path.join(temp, 'mon-projet');
const id = '20260927-143200-de00';
const dir = path.join(home, 'sessions', id);
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(project);
fs.mkdirSync(path.join(project, 'src'));
const started = Date.now() - 18_000;
const stamp = () => new Date().toISOString();
const meta = { id, project: 'mon-projet', cwd: project, agent: 'claude', started_at: new Date(started).toISOString(), ended_at: null };
const json = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2));
const append = (name, value) => fs.appendFileSync(path.join(dir, name), JSON.stringify(value) + '\n');
json('meta.json', meta);
fs.writeFileSync(path.join(dir, 'events.jsonl'), '');
fs.writeFileSync(path.join(dir, 'observed.jsonl'), '');
const write = (file, source) => fs.writeFileSync(path.join(project, file), source);
// Le projet possède déjà des comptes et une fonction de hachage.
write('src/auth.mjs', fixture.auth);
const workspace = new Workspace(dir, project).init();
function step(event, step_id, title, extra = {}) {
  const tree = workspace.snapshot();
  if (!tree) throw new Error(workspace.error?.message || workspace.lastError?.message || 'Instantané indisponible');
  append('events.jsonl', { type: 'step', ts: stamp(), source: 'claude', event, step_id, feature_id: 'reset', title, tree, ...extra });
}
function tests(expectedFailures = 0) {
  const command = 'node --test --test-reporter=tap reset.test.mjs';
  const result = spawnSync(process.execPath,
    ['--test', '--test-reporter=tap', 'reset.test.mjs'],
    { cwd: project, encoding: 'utf8' });
  if (result.error) throw result.error;
  append('observed.jsonl', { type: 'command', ts: stamp(), source: 'claude',
    command, ok: result.status === 0,
    output_tail: result.stdout.split('\n').slice(-40).join('\n') });
  const passed = Number(result.stdout.match(/^# pass (\d+)$/m)?.[1]);
  const failed = Number(result.stdout.match(/^# fail (\d+)$/m)?.[1]);
  if (passed !== 8 - expectedFailures || failed !== expectedFailures ||
      (expectedFailures === 0 && result.status !== 0) ||
      (expectedFailures === 1 && !result.stdout.includes(
        'not ok 8 - un lien déjà utilisé est refusé'))) {
    throw new Error('Résultat inattendu du scénario : ' + result.stdout + result.stderr);
  }
}

// La détection des sessions vérifie que ce script de lancement est vivant.
const launch = path.join(dir, 'launch.sh');
// Garder le shell vivant pour que son nom reste présent dans ps.
fs.writeFileSync(launch, '#!/bin/sh\nsleep 120 &\nchild=$!\ntrap "kill $child 2>/dev/null" EXIT\nwait "$child"\n');
const keeper = spawn('/bin/sh', [launch], { stdio: 'ignore' });
fs.writeFileSync(path.join(dir, 'agent.pid'), String(keeper.pid));

step('start', 'reset', 'Permettre de récupérer un mot de passe oublié', {
  narrative: 'Recevoir un lien temporaire, choisir un nouveau mot de passe et retrouver son compte.',
});
step('start', 'auth', 'Réutiliser les comptes et le hachage existants', {
  narrative: 'Le projet possède déjà ses comptes utilisateurs. Le nouveau parcours doit conserver le même hachage des mots de passe.',
});

const timers = [];
function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
later(1000, () => step('complete', 'auth', 'Réutiliser les comptes et le hachage existants', {
  narrative: 'Le nouveau mot de passe utilisera le hachage existant. Les comptes et la connexion restent compatibles.',
}));
later(1800, () => step('start', 'store', 'Conserver les liens après un redémarrage', {
  narrative: 'Enregistrer les jetons sur disque plutôt que de les perdre à la fermeture du service. Seul leur hash sera conservé.',
}));
later(3800, () => {
  write('src/token-store.mjs', fixture.tokenStore);
  write('src/reset.mjs', fixture.resetService());
  step('complete', 'store', 'Conserver les liens après un redémarrage', {
    narrative: 'Les jetons sont enregistrés sur disque sous forme de hash. Leur valeur en clair apparaît uniquement dans le lien envoyé au transport e-mail.',
  });
});
later(4800, () => step('start', 'expiry', 'Faire expirer chaque lien après 15 minutes', {
  narrative: 'Limiter la validité du lien. Une fois le délai dépassé, il faudra demander un nouvel e-mail.',
}));
later(6800, () => {
  write('src/reset.mjs', fixture.resetService({ expiry: true }));
  step('complete', 'expiry', 'Faire expirer chaque lien après 15 minutes', {
    narrative: 'Le serveur contrôle la date d’expiration avant tout changement de mot de passe. Un lien trop ancien est refusé.',
  });
});
later(7800, () => step('start', 'mail', 'Préparer le mail sans révéler les comptes existants', {
  narrative: 'Afficher la même réponse publique pour une adresse connue ou inconnue. Utiliser un transport e-mail simulé pour la démonstration.',
}));
later(9800, () => {
  write('src/reset.mjs', fixture.resetService({ expiry: true, delivery: true }));
  step('complete', 'mail', 'Préparer le mail sans révéler les comptes existants', {
    narrative: 'Le transport simulé reçoit le lien pour un compte connu. La réponse publique reste identique pour une adresse inconnue. Aucun véritable e-mail n’est envoyé.',
  });
});
later(10800, () => step('start', 'form', 'Relier le formulaire au nouveau mot de passe', {
  narrative: 'Recevoir le jeton et le nouveau mot de passe, modifier le compte, puis rediriger vers la connexion.',
}));
later(12800, () => {
  write('src/routes.mjs', fixture.routes);
  write('reset-password.html', fixture.form);
  write('reset.test.mjs', fixture.tests);
  step('complete', 'form', 'Relier le formulaire au nouveau mot de passe', {
    narrative: 'Le formulaire appelle POST /reset-password. Si le lien est valide, le mot de passe est remplacé et le navigateur revient à la connexion.',
  });
});
later(14500, () => {
  tests(1);
  step('fail', 'reuse', 'Un lien déjà utilisé permet un second changement', {
    narrative: 'Sept tests passent, mais le test de réutilisation échoue : le même lien permet encore de changer le mot de passe une deuxième fois.',
    technical_detail: 'Attendu : lien refusé après usage. Observé : second changement accepté.',
  });
});
later(16800, () => step('start', 'fix', 'Invalider le lien dès que le mot de passe change', {
  narrative: 'Supprimer le jeton après le premier changement réussi. Une seconde tentative avec le même lien doit être refusée.',
}));
later(18800, () => {
  write('src/reset.mjs', fixture.resetService({ expiry: true, delivery: true, fixed: true }));
  tests();
  step('complete', 'fix', 'Invalider le lien dès que le mot de passe change', {
    narrative: 'Le jeton est supprimé après le changement du mot de passe. Réutiliser le lien est désormais refusé. Les huit tests passent, dont le cas qui échouait.',
    technical_detail: 'Le lien reste valable 15 minutes, mais ne peut servir qu’une fois.',
  });
});
// Garder la correction sélectionnée pendant Détails (21–28 s) et Diff (28–33 s).
// La vérification suivante commence deux secondes après le retour à la timeline.
later(35000, () => step('start', 'tests', 'Valider le parcours avec un e-mail simulé', {
  narrative: 'Vérifier le stockage, l’expiration, le formulaire, l’ancien mot de passe et le refus d’un lien réutilisé.',
}));
later(36500, () => {
  tests();
  step('validate', 'tests', 'Valider le parcours avec un e-mail simulé', {
    narrative: 'Huit tests passent avec le transport e-mail simulé. Le formulaire change le mot de passe et le lien ne fonctionne plus après usage. La livraison d’un véritable e-mail reste à vérifier.',
    evidence: ['node --test --test-reporter=tap reset.test.mjs'],
  });
});
later(38000, () => {
  step('complete', 'reset', 'Permettre de récupérer un mot de passe oublié');
  meta.ended_at = stamp();
  json('meta.json', meta);
  append('events.jsonl', { type: 'session_end', ts: meta.ended_at, exit_code: 0 });
});

const tui = spawn(process.execPath, [path.join(root, 'bin/telex.js'), 'replay', id], {
  stdio: 'inherit', env: { ...process.env, TELEX_HOME: home, COLORTERM: 'truecolor' },
});
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const timer of timers) clearTimeout(timer);
  tui.kill();
  keeper.kill();
  fs.rmSync(temp, { recursive: true, force: true });
}
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));
tui.on('error', (err) => { console.error(err.message); process.exit(1); });
tui.on('exit', (code) => { cleanup(); process.exitCode = code ?? 1; });
