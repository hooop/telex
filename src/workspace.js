// Instantanés de l'espace de travail, pour relier chaque étape aux fichiers
// réellement modifiés et à son diff.
//
// On utilise un dépôt git « fantôme » propre à la session (sessions/<id>/shadow.git)
// avec le projet comme work-tree. Le dépôt de l'utilisateur n'est jamais modifié :
// s'il existe, ses objets sont seulement référencés en lecture (alternates) pour
// éviter de recopier le projet entier.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Jamais de secrets dans les instantanés (syntaxe .gitignore). Les .gitignore du
// projet s'appliquent en plus.
export const SENSITIVE_EXCLUDES = [
  '.env', '.env.*', '!.env.example', '!.env.sample', '!.env.template', '!.env.dist',
  '*.pem', '*.key', '*.p12', '*.pfx', '*.crt', '*.cer', '*.der', '*.keystore', '*.jks', '*.kdbx',
  'id_rsa*', 'id_dsa*', 'id_ecdsa*', 'id_ed25519*', '.ssh/', '.gnupg/', '.aws/', '.azure/',
  '.kube/config', '.docker/config.json', '.npmrc', '.pypirc', '.netrc', '.pgpass', '.htpasswd',
  'credentials', 'credentials.json', 'service-account*.json',
  'secrets.json', 'secrets.yml', 'secrets.yaml', 'secrets.toml', '*.tfvars', '*.tfstate', '*.tfstate.*',
];

const DEFAULT_EXCLUDES = [
  '.git/', 'node_modules/', '.venv/', 'venv/', '__pycache__/', 'dist/', 'build/', '.next/',
  '.nuxt/', 'target/', '.turbo/', '.cache/', 'coverage/', '.DS_Store', '*.log',
  ...SENSITIVE_EXCLUDES,
];

export const MAX_FILE_BYTES = 1024 * 1024;

export function gitAvailable() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function describeGitError(err) {
  if (err?.code === 'ENOENT') return new Error('git introuvable : les fichiers et le diff par étape sont indisponibles.');
  const detail = String(err?.stderr || err?.message || err).trim().split('\n')[0];
  return new Error(`git a échoué : ${detail}`);
}

export class Workspace {
  constructor(sessionDir, cwd) {
    this.cwd = cwd;
    this.gitDir = path.join(sessionDir, 'shadow.git');
    this.available = true;
    this.error = null; //     raison de l'indisponibilité (init)
    this.lastError = null; // dernier échec d'instantané
  }

  git(args, { timeout = 8000, input } = {}) {
    return execFileSync('git', [`--git-dir=${this.gitDir}`, `--work-tree=${this.cwd}`, ...args], {
      cwd: this.cwd,
      encoding: 'utf8',
      input,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      timeout,
      maxBuffer: 32 * 1024 * 1024,
    });
  }

  init() {
    try {
      if (!fs.existsSync(this.gitDir)) {
        // --shared=0600 : les fichiers du dépôt fantôme (copies du projet) restent privés.
        execFileSync('git', ['init', '-q', '--bare', '--shared=0600', this.gitDir], { stdio: ['ignore', 'ignore', 'pipe'] });
        const exclude = path.join(this.gitDir, 'info', 'exclude');
        fs.mkdirSync(path.dirname(exclude), { recursive: true, mode: 0o700 });
        fs.writeFileSync(exclude, DEFAULT_EXCLUDES.join('\n') + '\n', { mode: 0o600 });
        this.git(['config', 'core.bare', 'false']);
        this.git(['config', 'core.autocrlf', 'false']);
        const userObjects = this.userObjectsDir();
        if (userObjects) fs.writeFileSync(path.join(this.gitDir, 'objects', 'info', 'alternates'), userObjects + '\n', { mode: 0o600 });
      }
    } catch (err) {
      this.available = false;
      this.error = describeGitError(err);
    }
    return this;
  }

  userObjectsDir() {
    try {
      const dir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
        cwd: this.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const objects = path.join(dir, 'objects');
      return fs.existsSync(objects) ? objects : null;
    } catch {
      return null; // le projet n'est pas un dépôt git : tout sera copié dans le dépôt fantôme
    }
  }

  // Retourne l'identifiant d'arbre git représentant l'état actuel du projet.
  snapshot() {
    if (!this.available) return null;
    try {
      const { tracked, untracked } = this.largeFiles();
      if (tracked.length) this.git(['update-index', '-z', '--force-remove', '--stdin'], { input: tracked.join('\0') + '\0' });
      const pathspecs = ['.', ...[...tracked, ...untracked].map((p) => `:(exclude,literal)${p}`)];
      this.git(['add', '-A', '--ignore-errors', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: pathspecs.join('\0') + '\0', timeout: 15000 });
      this.lastError = null;
      return this.git(['write-tree']).trim();
    } catch (err) {
      this.lastError = describeGitError(err);
      return null;
    }
  }

  // Fichiers nouveaux ou modifiés de plus de MAX_FILE_BYTES. Ils sont repérés AVANT
  // git add : sinon git les copierait dans le dépôt fantôme avant qu'on les retire.
  largeFiles() {
    const out = this.git(['ls-files', '-z', '-t', '--others', '--modified', '--exclude-standard']);
    const tracked = new Set();
    const untracked = new Set();
    for (const item of out.split('\0')) {
      if (!item) continue;
      const tag = item[0];
      const file = item.slice(2);
      let size = 0;
      try { size = fs.lstatSync(path.join(this.cwd, file)).size; } catch { continue; } // supprimé entre-temps
      if (size > MAX_FILE_BYTES) (tag === '?' ? untracked : tracked).add(file);
    }
    return { tracked: [...tracked], untracked: [...untracked] };
  }

  changes(fromTree, toTree) {
    if (!fromTree || !toTree || fromTree === toTree) return [];
    try {
      return this.git(['diff-tree', '-r', '--name-status', '--no-renames', fromTree, toTree])
        .split('\n').filter(Boolean)
        .map((l) => { const [status, ...p] = l.split('\t'); return { status, path: p.join('\t') }; });
    } catch {
      return []; // instantanés illisibles (dépôt fantôme supprimé) : aucun fichier connu
    }
  }

  diff(fromTree, toTree) {
    if (!fromTree || !toTree || fromTree === toTree) return '';
    try {
      return this.git(['diff-tree', '-p', '-r', '--no-color', '--no-renames', fromTree, toTree]);
    } catch {
      return '';
    }
  }
}
