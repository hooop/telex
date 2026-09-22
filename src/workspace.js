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

const DEFAULT_EXCLUDES = [
  '.git/', 'node_modules/', '.venv/', 'venv/', '__pycache__/', 'dist/', 'build/', '.next/',
  '.nuxt/', 'target/', '.turbo/', '.cache/', 'coverage/', '.DS_Store', '*.log',
  // Jamais de secrets dans les instantanés
  '.env', '.env.*', '!.env.example', '!.env.sample', '!.env.template',
  '*.pem', '*.key', '*.p12', '*.pfx', '*.crt', '*.cer', 'id_rsa*', 'id_ed25519*',
  '.npmrc', '.pypirc', '.netrc', 'credentials.json',
];

const MAX_FILE_BYTES = 1024 * 1024;

export class Workspace {
  constructor(sessionDir, cwd) {
    this.cwd = cwd;
    this.gitDir = path.join(sessionDir, 'shadow.git');
    this.available = true;
  }

  git(args, opts = {}) {
    return execFileSync('git', [`--git-dir=${this.gitDir}`, `--work-tree=${this.cwd}`, ...args], {
      cwd: this.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: opts.timeout ?? 8000,
      maxBuffer: 32 * 1024 * 1024,
    });
  }

  init() {
    try {
      if (!fs.existsSync(this.gitDir)) {
        execFileSync('git', ['init', '-q', '--bare', this.gitDir], { stdio: 'ignore' });
        const exclude = path.join(this.gitDir, 'info', 'exclude');
        fs.mkdirSync(path.dirname(exclude), { recursive: true });
        fs.writeFileSync(exclude, DEFAULT_EXCLUDES.join('\n') + '\n');
        this.git(['config', 'core.bare', 'false']);
        this.git(['config', 'core.autocrlf', 'false']);
        const userObjects = this.userObjectsDir();
        if (userObjects) fs.writeFileSync(path.join(this.gitDir, 'objects', 'info', 'alternates'), userObjects + '\n');
      }
    } catch {
      this.available = false;
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
      return null;
    }
  }

  // Retourne l'identifiant d'arbre git représentant l'état actuel du projet.
  snapshot() {
    if (!this.available) return null;
    try {
      this.git(['add', '-A', '--ignore-errors', '.'], { timeout: 15000 });
      this.dropLargeFiles();
      return this.git(['write-tree']).trim();
    } catch {
      return null;
    }
  }

  dropLargeFiles() {
    const out = this.git(['ls-files', '-s', '--debug']);
    const big = [];
    let current = null;
    for (const line of out.split('\n')) {
      const m = line.match(/^\d+ [0-9a-f]+ \d\t(.*)$/);
      if (m) { current = m[1]; continue; }
      const size = line.match(/^\s+size:\s+(\d+)/);
      if (size && current && Number(size[1]) > MAX_FILE_BYTES) big.push(current);
    }
    if (big.length) this.git(['rm', '-q', '--cached', '--', ...big]);
  }

  changes(fromTree, toTree) {
    if (!fromTree || !toTree || fromTree === toTree) return [];
    try {
      return this.git(['diff-tree', '-r', '--name-status', '--no-renames', fromTree, toTree])
        .split('\n').filter(Boolean)
        .map((l) => { const [status, ...p] = l.split('\t'); return { status, path: p.join('\t') }; });
    } catch {
      return [];
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
