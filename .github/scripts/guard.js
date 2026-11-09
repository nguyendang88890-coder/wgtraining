// Pre-deploy safety checks. Run by GitHub Actions before every deploy (and on every
// other branch / PR for early feedback). Exits 1 — blocking the deploy — if a change
// would reopen a known security hole. Usage: node .github/scripts/guard.js [rootDir]
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(process.argv[2] || process.cwd());
const failures = [];
const fail = (msg) => failures.push(msg);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Files that get published to the web root (everything at the top level that is not repo-internal).
const siteFiles = fs.readdirSync(ROOT).filter(f => /\.(html|js|css)$/.test(f));

// 1. Anonymous sign-in must never come back.
for (const f of siteFiles) {
  if (/signInAnonymously/.test(read(f))) fail(`${f}: uses signInAnonymously (Anonymous Auth is disabled on purpose — see CLAUDE.md)`);
}

// 2. Security Rules: no open read/write anywhere, and the file must match its generator.
try {
  const rules = JSON.parse(read('firebase/database.rules.json')).rules || {};
  (function walk(node, p) {
    for (const [k, v] of Object.entries(node)) {
      if (k === '.read' || k === '.write') {
        const open = v === true || (typeof v === 'string' && /^\s*(true|auth\s*!=\s*null)\s*$/.test(v));
        if (open) fail(`firebase/database.rules.json: ${p}/${k} is "${v}" (open access)`);
      } else if (v && typeof v === 'object') walk(v, `${p}/${k}`);
    }
  })(rules, '');
} catch (e) {
  fail('firebase/database.rules.json is missing or invalid JSON: ' + e.message);
}
// The committed rules file must be exactly what build-rules.js generates (nobody hand-edits it).
// Compare what is committed (HEAD blob, line endings normalised) with a fresh generator run.
try {
  const committed = execSync('git show HEAD:firebase/database.rules.json', { cwd: ROOT }).toString().replace(/\r\n/g, '\n');
  const raw = read('firebase/database.rules.json');
  const onDisk = raw.replace(/\r\n/g, '\n');
  execSync('node firebase/build-rules.js', { cwd: ROOT, stdio: 'pipe' });
  const generated = read('firebase/database.rules.json').replace(/\r\n/g, '\n');
  fs.writeFileSync(path.join(ROOT, 'firebase/database.rules.json'), raw); // leave the working tree exactly as we found it
  if (generated !== committed || generated !== onDisk) {
    fail('firebase/database.rules.json is out of sync with firebase/build-rules.js — edit build-rules.js, then run: node firebase/build-rules.js');
  }
} catch (e) {
  fail('could not verify rules against build-rules.js: ' + e.message.split('\n')[0]);
}

// 3. Production Firebase project must stay wgtraining-a669d.
try {
  const cfg = read('firebase-config.js');
  const prod = cfg.match(/prod:\s*\{[^}]*\}/);
  if (!prod || !/projectId:\s*"wgtraining-a669d"/.test(prod[0])) fail('firebase-config.js: the prod config must point at project wgtraining-a669d');
  if (/wmt-training-portal/.test(cfg)) fail('firebase-config.js: references the unrelated WMT project (wmt-training-portal)');
} catch (e) { fail('firebase-config.js unreadable: ' + e.message); }

// 4. No secrets / backups / stray private files tracked in git (the repo is public).
try {
  const tracked = execSync('git ls-files', { cwd: ROOT }).toString().split('\n').filter(Boolean);
  const bad = tracked.filter(f =>
    /(^|\/)\.env(\.|$)/.test(f) || /serviceAccount|service-account|firebase-adminsdk/i.test(f) ||
    /\.(pem|key|p12|pfx)$/i.test(f) || /backup|dump|export/i.test(path.basename(f)) && /\.(json|sql|csv|zip)$/i.test(f) ||
    /(^|\/)id_(rsa|ed25519)/.test(f));
  bad.forEach(f => fail(`${f}: looks like a secret/backup and must not be committed (repo is public)`));
} catch (e) { /* not a git checkout: skip */ }

if (failures.length) {
  console.error('\n✖ GUARD FAILED — deploy blocked:\n');
  failures.forEach(f => console.error('  - ' + f));
  console.error('\nSee CLAUDE.md for why these rules exist.\n');
  process.exit(1);
}
console.log('✔ guard passed: no anonymous auth, no open rules, prod project intact, no secrets tracked');
