// Masquage des secrets avant tout affichage ou écriture sur disque.
// Principe : on garde le NOM d'une variable, jamais sa valeur.
// C'est un filet de sécurité heuristique (formats connus, noms évocateurs) : il ne
// garantit pas qu'aucun secret ne passe.

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|PRIVATE|AUTH(?!OR)|COOKIE|SESSION|DSN|DATABASE_URL|CONN)/i;
// Noms qui contiennent un mot évocateur sans désigner un secret (chemins, variables du shell).
const SAFE_NAME = /(_DIR|_PATH|_FILE|_HOME|_SOCK|_URL_PATH)$|^(OLD)?PWD$/i;

const MASK = '••••';

const VALUE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /-----BEGIN CERTIFICATE-----[\s\S]*?(-----END CERTIFICATE-----|$)/g,
  /\b(sk|pk|rk)-(ant-|proj-|live_|test_)?[A-Za-z0-9_-]{16,}/g, // OpenAI, Anthropic, Stripe…
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{10,}/g,
  /\bre_[A-Za-z0-9_]{16,}/g, // Resend
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bglpat-[A-Za-z0-9_-]{20,}/g, // GitLab
  /\bnpm_[A-Za-z0-9]{30,}/g, // npm
  /\bhf_[A-Za-z0-9]{30,}/g, // Hugging Face
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/gi, // identifiants dans une URL
];

// Secrets passés en option de ligne de commande : on garde l'option, on masque la valeur.
const FLAG_PATTERNS = [
  // --password <valeur>, --token=<valeur>, --api-key <valeur>, --client-secret <valeur>…
  [/(\s--?[A-Za-z0-9-]*(?:password|passwd|token|secret|api-?key)[A-Za-z0-9-]*)(=|\s+)(?!-)("[^"\n]*"|'[^'\n]*'|\S+)/gi, (m, flag, sep) => `${flag}${sep}${MASK}`],
  // mysql -p<valeur> (valeur collée à l'option)
  [/(\b(?:mysql\w*|mariadb\w*)\b[^\n]*?\s-p)(?!\s)(\S+)/g, (m, before) => `${before}${MASK}`],
  // curl -u <utilisateur>:<valeur>, --user <utilisateur>:<valeur>
  [/(\s(?:-u|--user)(?:=|\s+)["']?[^\s:"']+:)([^\s"']+)/g, (m, before) => `${before}${MASK}`],
];

export function redact(text) {
  if (text == null) return text;
  let s = String(text);
  for (const re of VALUE_PATTERNS) {
    s = s.replace(re, (m) => {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(m)) return m.replace(/:\/\/([^:]+):[^@]+@/, `://$1:${MASK}@`);
      if (/^(Bearer|Basic)\s/i.test(m)) return m.split(/\s+/)[0] + ' ' + MASK;
      return MASK;
    });
  }
  for (const [re, replace] of FLAG_PATTERNS) s = s.replace(re, replace);
  // NOM_SECRET=valeur, NOM_SECRET: valeur, "nomSecret": "valeur avec espaces"
  s = s.replace(
    /(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\1(\s*[:=]\s*)(?:"([^"\n]{4,})"|'([^'\n]{4,})'|([^\s"',;}]{4,}))/g,
    (m, q, name, sep, dq, sq, bare) => {
      const value = dq ?? sq ?? bare;
      if (!SECRET_NAME.test(name) || SAFE_NAME.test(name)) return m;
      if (value === MASK || /^(Bearer|Basic)$/i.test(value) || /^(process\.env|os\.environ|env\(|\$\{?)/.test(value)) return m;
      const vq = dq !== undefined ? '"' : sq !== undefined ? "'" : '';
      return `${q}${name}${q}${sep}${vq}${MASK}${vq}`;
    },
  );
  return s;
}

export function redactDeep(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out;
  }
  return value;
}
