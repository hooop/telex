// Masquage des secrets avant tout affichage ou écriture sur disque.
// Principe : on garde le NOM d'une variable, jamais sa valeur.

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|PRIVATE|AUTH|COOKIE|SESSION|DSN|DATABASE_URL|CONN)/i;

const VALUE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /-----BEGIN CERTIFICATE-----[\s\S]*?(-----END CERTIFICATE-----|$)/g,
  /\b(sk|pk|rk)-(ant-|proj-|live_|test_)?[A-Za-z0-9_-]{16,}/g, // OpenAI, Anthropic, Stripe…
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{10,}/g,
  /\bre_[A-Za-z0-9_]{16,}/g, // Resend
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/gi, // identifiants dans une URL
];

const MASK = '••••';

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
  // NOM_SECRET=valeur, NOM_SECRET: valeur, "nomSecret": "valeur"
  s = s.replace(
    /(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\1(\s*[:=]\s*)(["']?)([^\s"',;}]{4,})\4/g,
    (m, q, name, sep, vq, value) => {
      if (!SECRET_NAME.test(name) || value === MASK || /^(Bearer|Basic)$/i.test(value) || /^(process\.env|os\.environ|env\(|\$\{?)/.test(value)) return m;
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

// Fichiers dont le contenu n'est jamais lu, affiché ni conservé.
export function isSensitivePath(p) {
  const base = String(p).split('/').pop();
  return /^\.env(\..*)?$/.test(base) && !/\.(example|sample|template)$/.test(base)
    || /\.(pem|key|p12|pfx|crt|cer|keystore|jks)$/i.test(base)
    || /^(id_rsa|id_ed25519|id_ecdsa)(\.pub)?$/.test(base)
    || /^(\.npmrc|\.pypirc|\.netrc|credentials(\.json)?)$/.test(base);
}
