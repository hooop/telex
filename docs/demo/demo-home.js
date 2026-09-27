// Crée un TELEX_HOME fictif pour les GIFs de démonstration : quelques sessions
// réalistes, datées par rapport à maintenant (deux ont plus de 30 jours, pour
// « telex prune »). Les vraies sessions de ~/.telex ne sont jamais lues.
//
//   node docs/demo/demo-home.js <dossier>
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const home = process.argv[2];
if (!home) {
  console.error('usage : node docs/demo/demo-home.js <dossier>');
  process.exit(2);
}

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const now = Date.now();

// Chaque étape : [secondes depuis le début de la session, événement, step_id, titre, champs facultatifs].
const RESET = [
  [4, 'start', 'reset', 'Ajouter la réinitialisation du mot de passe'],
  [20, 'start', 'examine', 'Examiner l’authentification existante'],
  [48, 'complete', 'examine', 'Examiner l’authentification existante', { narrative: 'Les comptes et les sessions sont gérés dans src/auth ; les mots de passe sont hachés avec bcrypt.' }],
  [70, 'start', 'tokens', 'Créer la table des tokens'],
  [110, 'complete', 'tokens', 'Créer la table des tokens', { narrative: 'Une migration ajoute la table password_reset_tokens, avec une date d’expiration.', technical_detail: 'migrations/0007_password_reset_tokens.sql' }],
  [236, 'start', 'resend-config', 'Configurer l’accès à Resend'],
  [247, 'fail', 'resend-config', 'Configurer l’accès à Resend', { narrative: 'L’envoi est interrompu : la clé attendue n’est pas disponible dans la configuration du projet.', technical_detail: 'RESEND_API_KEY introuvable' }],
  [266, 'start', 'resend-fix', 'Corriger la configuration de Resend'],
  [285, 'complete', 'resend-fix', 'Corriger la configuration de Resend', { narrative: 'Le projet recherche maintenant la clé sous le bon nom : RESEND_API_KEY.' }],
  [539, 'start', 'mem', 'Conserver les tokens en mémoire'],
  [546, 'replace', 'mem', 'Conserver les tokens en mémoire', { narrative: 'Cette approche est remplacée : les demandes auraient été perdues à chaque redémarrage.' }],
  [552, 'start', 'db', 'Conserver les tokens dans la base de données'],
  [590, 'complete', 'db', 'Conserver les tokens dans la base de données', { narrative: 'Chaque demande est enregistrée dans password_reset_tokens et supprimée après usage.' }],
  [626, 'start', 'form', 'Relier le formulaire au serveur'],
  [668, 'complete', 'form', 'Relier le formulaire au serveur', { narrative: 'Une route reçoit l’adresse e-mail et vérifie qu’elle correspond à un compte.', technical_detail: 'POST /forgot-password' }],
  [690, 'validate', 'reset', 'Vérifier l’envoi simulé', { narrative: 'Le test passe avec un service d’e-mail simulé. Aucun véritable e-mail n’a encore été envoyé.', evidence: ['npm test'] }],
  [700, 'complete', 'reset', 'Ajouter la réinitialisation du mot de passe'],
];

const SESSIONS = [
  {
    project: 'site', agent: 'claude', ago: 41 * DAY + 3 * 60 * MIN, suffix: '0be1', end: 'interrupted',
    steps: [
      [3, 'start', 'home', 'Refaire la page d’accueil'],
      [15, 'start', 'styles', 'Examiner les styles existants'],
      [40, 'complete', 'styles', 'Examiner les styles existants'],
      [60, 'start', 'hero', 'Créer le composant Hero'],
      [180, 'complete', 'hero', 'Créer le composant Hero'],
      [200, 'start', 'grid', 'Adapter la grille aux mobiles'],
      [320, 'complete', 'grid', 'Adapter la grille aux mobiles'],
      [340, 'start', 'images', 'Optimiser les images'],
    ],
  },
  {
    project: 'api', agent: 'codex', ago: 36 * DAY + 5 * 60 * MIN, suffix: 'a81c', end: 'ended',
    steps: [
      [5, 'start', 'pagination', 'Paginer la liste des articles'],
      [30, 'start', 'params', 'Ajouter les paramètres page et limit'],
      [95, 'complete', 'params', 'Ajouter les paramètres page et limit'],
      [110, 'start', 'tests', 'Couvrir la pagination par des tests'],
      [160, 'validate', 'tests', 'Couvrir la pagination par des tests'],
      [170, 'complete', 'pagination', 'Paginer la liste des articles'],
    ],
  },
  {
    project: 'api', agent: 'codex', ago: 2 * DAY + 4 * 60 * MIN, suffix: '77d2', end: 'ended',
    steps: [
      [4, 'start', 'rate', 'Limiter le débit de l’API'],
      [18, 'start', 'store', 'Choisir le stockage des compteurs'],
      [50, 'complete', 'store', 'Choisir le stockage des compteurs'],
      [70, 'start', 'middleware', 'Ajouter le middleware de limitation'],
      [150, 'complete', 'middleware', 'Ajouter le middleware de limitation'],
      [165, 'start', 'retry', 'Renvoyer l’en-tête Retry-After'],
      [190, 'complete', 'retry', 'Renvoyer l’en-tête Retry-After'],
      [205, 'start', 'tests', 'Couvrir les limites par des tests'],
      [260, 'validate', 'tests', 'Couvrir les limites par des tests'],
      [275, 'start', 'docs', 'Documenter les limites'],
      [300, 'complete', 'docs', 'Documenter les limites'],
      [310, 'complete', 'rate', 'Limiter le débit de l’API'],
    ],
  },
  {
    project: 'site', agent: 'codex', ago: 95 * MIN, suffix: 'c93e', end: 'live',
    steps: [
      [6, 'start', 'i18n', 'Traduire le site en anglais'],
      [25, 'start', 'extract', 'Extraire les textes de la page d’accueil'],
    ],
  },
  // La plus récente : c'est elle que montre « telex replay last ».
  { project: 'mon-projet', agent: 'claude', ago: 62 * MIN, suffix: '3f4f', end: 'ended', steps: RESET },
];

function sessionId(date, suffix) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}-${suffix}`;
}

const iso = (ms) => new Date(ms).toISOString();

for (const s of SESSIONS) {
  const start = now - s.ago;
  const id = sessionId(new Date(start), s.suffix);
  const dir = path.join(home, 'sessions', id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const events = s.steps.map(([sec, event, step_id, title, extra = {}]) => ({
    type: 'step', ts: iso(start + sec * 1000), source: s.agent, event, step_id,
    ...(event === 'start' ? { feature_id: s.steps[0][2] } : {}), title, ...extra,
  }));
  const last = start + s.steps.at(-1)[0] * 1000;
  const meta = { id, project: s.project, cwd: path.join(home, s.project), agent: s.agent, started_at: iso(start), ended_at: null };
  if (s.end === 'ended') {
    meta.ended_at = iso(last + 90 * 1000);
    events.push({ type: 'session_end', ts: meta.ended_at, exit_code: 0 });
  } else if (s.end === 'interrupted') {
    meta.ended_at = iso(last + 60 * 1000);
    meta.interrupted = true;
    events.push({ type: 'session_end', ts: meta.ended_at, exit_code: null, interrupted: true });
  }

  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'events.jsonl'), events.map((e) => JSON.stringify(e) + '\n').join(''), { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'observed.jsonl'), '', { mode: 0o600 });

  if (s.end === 'live') {
    // Une session « en cours » : telex vérifie que son script de lancement tourne.
    // Celui-ci ne fait qu'attendre, le temps de l'enregistrement. Il est lancé dans son
    // propre groupe de processus, que env.sh arrête d'un coup à la fin du scénario.
    const script = path.join(dir, 'launch.sh');
    fs.writeFileSync(script, '#!/bin/sh\nsleep 120\n', { mode: 0o700 });
    const child = spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' });
    child.unref();
    fs.writeFileSync(path.join(dir, 'agent.pid'), String(child.pid), { mode: 0o600 });
  }
}
