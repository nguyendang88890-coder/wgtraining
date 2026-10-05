// Attack-simulation tests for firebase/database.rules.json.
//   cd tools/rules-test && npm install && node run.js
// Runs ONLY against the staging project (refuses anything else). Needs `firebase login`
// once, because the baseline data is seeded as the project owner (bypasses rules).
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, get, set, update, remove, query, orderByChild, equalTo } = require('firebase/database');

const CONFIG = {
  apiKey: 'AIzaSyBeuY1Ammpo4_GxcAsomI2fXFklgOqmiOY',
  authDomain: 'wgtraining-staging.firebaseapp.com',
  databaseURL: 'https://wgtraining-staging-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'wgtraining-staging'
};
if (CONFIG.projectId !== 'wgtraining-staging') throw new Error('Refusing to run against anything but staging');
const PASSWORD = 'Test-12345-rt';
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ── actors ──────────────────────────────────────────────────────────────────
const ACTORS = {
  admin:  { email: 'rt-admin@wg-rules-test.example',  username: 'rtadmin',  role: 'admin' },
  mod:    { email: 'rt-mod@wg-rules-test.example',    username: 'rtmod',    role: 'mod' },
  leader: { email: 'rt-leader@wg-rules-test.example', username: 'rtleader', role: 'trainee', isLeader: true },
  a:      { email: 'rt-a@wg-rules-test.example',      username: 'rta',      role: 'trainee', leaderName: 'rtleader' },
  b:      { email: 'rt-b@wg-rules-test.example',      username: 'rtb',      role: 'trainee' },
  nomap:  { email: 'rt-nomap@wg-rules-test.example',  username: null }      // authenticated, never provisioned
};

async function connect(name) {
  const a = ACTORS[name];
  const app = initializeApp(CONFIG, 'rt-' + name);
  const auth = getAuth(app);
  let cred;
  try { cred = await signInWithEmailAndPassword(auth, a.email, PASSWORD); }
  catch (e) { cred = await createUserWithEmailAndPassword(auth, a.email, PASSWORD); }
  a.uid = cred.user.uid;
  a.db = getDatabase(app);
  a.app = app;
}

// ── result bookkeeping ──────────────────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];
async function check(label, expect, fn) {
  let allowed = true, err = null;
  try { await fn(); } catch (e) { allowed = false; err = e; if (!/PERMISSION_DENIED|Permission denied/i.test(String(e.message || e))) { allowed = null; } }
  if (allowed === null) { fail++; failures.push(label + '  (unexpected error: ' + err.message + ')'); console.log('  ?? ' + label + '  → ' + err.message); return; }
  const ok = (expect === 'allow') === allowed;
  if (ok) { pass++; console.log('  ✓  ' + (expect === 'allow' ? 'allowed' : 'denied ') + '  ' + label); }
  else { fail++; failures.push(label + `  (expected ${expect}, got ${allowed ? 'allow' : 'deny'})`); console.log('  ✗✗ ' + label + `  → expected ${expect}, got ${allowed ? 'ALLOW' : 'DENY'}`); }
}

const R   = (actor, p)    => p ? ref(ACTORS[actor].db, p) : ref(ACTORS[actor].db);
const rd  = (actor, p)    => () => get(R(actor, p));
const wr  = (actor, p, v) => () => set(R(actor, p), v);
const up  = (actor, p, v) => () => update(R(actor, p), v);
const rm  = (actor, p)    => () => remove(R(actor, p));
const qry = (actor, p, child, val) => () => get(query(R(actor, p), orderByChild(child), equalTo(val)));
// baseline reset as admin (admin has write access to everything it needs)
const reset = (p, v) => set(R('admin', p), v);

const NOW = Date.now();
const ISO = new Date().toISOString();
const DAY = 86400000;

function seedData() {
  const uidmap = {};
  Object.values(ACTORS).forEach(a => { if (a.username) uidmap[a.uid] = a.username; });
  const profile = (a) => ({ role: a.role, fullName: a.username, email: a.email, department: 'QA', position: 'Tester',
    employeeType: 'new', leaderName: a.leaderName || '', isLeader: !!a.isLeader, testGroup: 'auto', createdAt: ISO, uid: a.uid });
  return {
    uidmap,
    users: { rtadmin: profile(ACTORS.admin), rtmod: profile(ACTORS.mod), rtleader: profile(ACTORS.leader), rta: profile(ACTORS.a), rtb: profile(ACTORS.b) },
    progress: { rta: { module1_done: true, module1_score: 90 }, rtb: { module1_done: true } },
    quiz: { rta: { m1: { score: 80, correct: 4, total: 5, submittedAt: ISO } } },
    exam: {
      rta: { status: 'graded', attempts: 1, gradedAttempts: 1, fail1Date: ISO, fail1AtMs: NOW - 4 * DAY, fail1Score: 30, score: 30, total: 100, scores: [3, 3] },
      rtb: { status: 'graded', attempts: 1, gradedAttempts: 1, fail1Date: ISO, fail1AtMs: NOW - 4 * DAY, fail1Score: 30 }
    },
    feedback: { rta: { contentRating: 4, trainerRating: 5, submittedAt: ISO }, rtb: { contentRating: 5, submittedAt: ISO } },
    monthly_config: { '2026-10': { title: 'October test', startDateOthers: ISO } },
    schedule_announcements: [{ month: '2026-10', title: 'October test', createdAt: ISO }],
    exam_qbank_v2: [{ q: 'What is X?', module: 1, maxPoints: 10, rubric: 'X is Y' }],
    qbank: { bdcs: { questions: [{ id: 1, text: 'secret', correct: 'A' }] } },
    gentest: { others: { '2026-10': { questions: [{ id: 1, text: 'q', correct: 'B' }] } } },
    notif_prefs: { rtb: { enabled: true } }
  };
}

const SUBMIT = (over = {}) => ({
  status: 'pending_grading', pendingAttemptNumber: 2, passThreshold: 80, submittedAt: ISO,
  questions: [{ q: 'Q1', module: 1, maxPoints: 10, rubric: 'R' }], answers: ['my answer'],
  score: null, total: null, scores: null, ...over
});

(async () => {
  console.log('Connecting test accounts (creating them on first run)…');
  for (const n of Object.keys(ACTORS)) await connect(n);

  console.log('Seeding baseline data as project owner (firebase CLI)…');
  const seedFile = path.join(os.tmpdir(), 'wg-rules-seed.json');
  fs.writeFileSync(seedFile, JSON.stringify(seedData()));
  execSync(`npx --yes firebase-tools database:set / "${seedFile}" --project staging --force`, { cwd: REPO_ROOT, stdio: 'inherit' });

  const A = ACTORS;

  // ───────────────────────── anonymous (no credentials at all) ─────────────────────────
  console.log('\n[anonymous visitor — no sign-in]');
  const rest = async (method, p, body) => {
    const r = await fetch(`${CONFIG.databaseURL}${p}.json`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 401 || r.status === 403) throw new Error('PERMISSION_DENIED');
    if (!r.ok) throw new Error('HTTP ' + r.status);
  };
  await check('read whole database',          'deny',  () => rest('GET', '/'));
  await check('read users',                   'deny',  () => rest('GET', '/users'));
  await check('read monthly_config',          'deny',  () => rest('GET', '/monthly_config'));
  await check('write users/hacker',           'deny',  () => rest('PUT', '/users/hacker', { role: 'admin' }));

  // ───────────────────────── signed in but not provisioned ─────────────────────────
  console.log('\n[signed-in account with NO uidmap entry]');
  await check('read monthly_config',          'deny',  rd('nomap', 'monthly_config'));
  await check('read users/rta',               'deny',  rd('nomap', 'users/rta'));
  await check('read exam_qbank_v2',           'deny',  rd('nomap', 'exam_qbank_v2'));
  await check('write notif_prefs/rta',        'deny',  wr('nomap', 'notif_prefs/rta', { enabled: true }));
  await check('map itself: uidmap/<own uid>', 'deny',  wr('nomap', 'uidmap/' + A.nomap.uid, 'rtadmin'));

  // ───────────────────────── trainee A ─────────────────────────
  console.log('\n[trainee "rta"]');
  await check('read own profile',                         'allow', rd('a', 'users/rta'));
  await check('read another trainee profile',             'deny',  rd('a', 'users/rtb'));
  await check('read the whole users node',                'deny',  rd('a', 'users'));
  await check('promote self: users/rta/role = admin',     'deny',  wr('a', 'users/rta/role', 'admin'));
  await check('make self a leader: isLeader = true',      'deny',  wr('a', 'users/rta/isLeader', true));
  await check('change own leaderName',                    'deny',  wr('a', 'users/rta/leaderName', 'someoneelse'));
  await check('change own testGroup',                     'deny',  wr('a', 'users/rta/testGroup', 'bdcs'));
  await check('rewrite whole own profile',                'deny',  wr('a', 'users/rta', { role: 'admin' }));
  await check('edit own fullName',                        'allow', wr('a', 'users/rta/fullName', 'Renamed'));
  await check('employeeType new → old (self-upgrade)',    'allow', wr('a', 'users/rta/employeeType', 'old'));
  await check('employeeType old → new',                   'deny',  wr('a', 'users/rta/employeeType', 'new'));
  await check('claim another uid in uidmap',              'deny',  wr('a', 'uidmap/fake-uid-123', 'rta'));
  await check('re-map own uid to admin username',         'deny',  wr('a', 'uidmap/' + A.a.uid, 'rtadmin'));
  await check('query users by leaderName (not a leader)', 'deny',  qry('a', 'users', 'leaderName', 'rtleader'));

  await check('read monthly_config',                      'allow', rd('a', 'monthly_config'));
  await check('write monthly_config',                     'deny',  wr('a', 'monthly_config/2026-11', { title: 'x' }));
  await check('write schedule_announcements',             'deny',  wr('a', 'schedule_announcements', []));
  await check('read exam_qbank_v2 (content; see residual risks)', 'allow', rd('a', 'exam_qbank_v2'));
  await check('write exam_qbank_v2',                      'deny',  wr('a', 'exam_qbank_v2', []));
  await check('read qbank (answer keys)',                 'deny',  rd('a', 'qbank'));
  await check('read gentest',                             'allow', rd('a', 'gentest'));
  await check('write gentest',                            'deny',  wr('a', 'gentest/others/2026-10', {}));

  await check('read another trainee’s feedback',          'deny',  rd('a', 'feedback/rtb'));
  await check('overwrite another trainee’s feedback',     'deny',  wr('a', 'feedback/rtb', { contentRating: 1 }));
  await check('submit own feedback',                      'allow', wr('a', 'feedback/rta', { contentRating: 5, trainerRating: 4, contentComment: 'ok', trainerComment: '', submittedAt: ISO }));
  await check('feedback rating out of range (9)',         'deny',  wr('a', 'feedback/rta', { contentRating: 9, submittedAt: ISO }));

  await check('write own progress',                       'allow', wr('a', 'progress/rta', { module1_done: true, module2_done: true }));
  await check('write another trainee’s progress',         'deny',  wr('a', 'progress/rtb', { module5_done: true }));
  await check('read another trainee’s progress',          'deny',  rd('a', 'progress/rtb'));

  await check('record own quiz result (first time)',      'allow', wr('a', 'quiz/rta/m2', { score: 100, correct: 5, total: 5, submittedAt: ISO }));
  await check('overwrite own quiz result (retake)',       'deny',  wr('a', 'quiz/rta/m2', { score: 100, correct: 5, total: 5, submittedAt: ISO }));
  await check('record quiz result for another trainee',   'deny',  wr('a', 'quiz/rtb/m3', { score: 100 }));
  await check('delete own quiz result',                   'deny',  rm('a', 'quiz/rta/m1'));

  console.log('\n[trainee "rta" — Final Exam]');
  await check('read own exam',                            'allow', rd('a', 'exam/rta'));
  await check('read another trainee’s exam',              'deny',  rd('a', 'exam/rtb'));
  await check('set exam/rta/passed = true',               'deny',  wr('a', 'exam/rta/passed', true));
  await check('set exam/rta/score = 100',                 'deny',  wr('a', 'exam/rta/score', 100));
  await check('set exam/rta/gradedAttempts = 0 (reset)',  'deny',  wr('a', 'exam/rta/gradedAttempts', 0));
  await check('delete fail1AtMs (skip lockout)',          'deny',  rm('a', 'exam/rta/fail1AtMs'));
  await check('delete whole exam node (wipe fails)',      'deny',  rm('a', 'exam/rta'));
  await check('submit smuggling passed:true',             'deny',  up('a', 'exam/rta', SUBMIT({ passed: true })));
  await check('submit with wrong attempt number (1)',     'deny',  up('a', 'exam/rta', SUBMIT({ pendingAttemptNumber: 1, passThreshold: 60 })));
  await check('submit with lowered threshold (30)',       'deny',  up('a', 'exam/rta', SUBMIT({ passThreshold: 30 })));
  await check('submit with absurd maxPoints',             'deny',  up('a', 'exam/rta', SUBMIT({ questions: [{ q: 'Q', module: 1, maxPoints: 99999 }] })));
  await check('submit attempt 2 after lockout (valid)',   'allow', up('a', 'exam/rta', SUBMIT()));
  await check('re-submit while already pending',          'deny',  up('a', 'exam/rta', SUBMIT({ answers: ['changed after submitting'] })));
  await check('edit answers while pending',               'deny',  wr('a', 'exam/rta/answers', ['edited']));
  await reset('exam/rta', { status: 'graded', attempts: 1, gradedAttempts: 1, fail1Date: ISO, fail1AtMs: NOW - 1000, fail1Score: 30 });
  await check('submit inside the 3-day lockout',          'deny',  up('a', 'exam/rta', SUBMIT()));
  await reset('exam/rta', { status: 'graded', attempts: 1, passed: true, passScore: 90, score: 90, total: 100 });
  await check('re-submit after already passing',          'deny',  up('a', 'exam/rta', SUBMIT({ pendingAttemptNumber: 1, passThreshold: 60 })));
  await reset('exam/rta', { status: 'graded', attempts: 2, gradedAttempts: 2, disqualified: true, fail1Date: ISO, fail2Date: ISO });
  await check('re-submit after disqualification',         'deny',  up('a', 'exam/rta', SUBMIT({ pendingAttemptNumber: 3, passThreshold: 80 })));
  await reset('exam/rta', null);
  await check('first-ever submission (attempt 1)',        'allow', up('a', 'exam/rta', SUBMIT({ pendingAttemptNumber: 1, passThreshold: 60 })));

  console.log('\n[trainee "rta" — Interview]');
  await reset('exam/rta', { status: 'graded', attempts: 1, passed: true, passScore: 90, score: 90, total: 100 });
  await reset('interview/rta', null);
  await check('book interview as pending (exam passed)',  'allow', wr('a', 'interview/rta', { username: 'rta', status: 'pending', meetingLink: '', confirmedSlot: '', submittedAt: ISO }));
  await check('book interview already "confirmed"',       'deny',  wr('a', 'interview/rtb', { status: 'confirmed' }));
  await reset('interview/rta', { status: 'confirmed', confirmedSlot: 'Mon 10:00', meetingLink: 'https://meet.example/x' });
  await check('mark own interview completed',             'deny',  wr('a', 'interview/rta/status', 'completed'));
  await check('rewrite own confirmed interview',          'deny',  wr('a', 'interview/rta', { status: 'completed' }));
  await check('cancel own CONFIRMED interview',           'deny',  rm('a', 'interview/rta'));
  await reset('interview/rta', { status: 'pending' });
  await check('cancel own pending interview',             'allow', rm('a', 'interview/rta'));
  await reset('exam/rta', { status: 'graded', attempts: 1, gradedAttempts: 1, fail1AtMs: NOW - 4 * DAY });
  await check('book interview WITHOUT passing the exam',  'deny',  wr('a', 'interview/rta', { status: 'pending' }));
  await check('read another trainee’s interview',         'deny',  rd('a', 'interview/rtb'));

  console.log('\n[trainee "rta" — Monthly Test]');
  await check('file a reschedule request (pending)',      'allow', wr('a', 'reschedule/rta/2026-10', { status: 'pending', newDate: '2026-10-20', requestedAt: ISO }));
  await check('file another while one is pending',        'deny',  wr('a', 'reschedule/rta/2026-10', { status: 'pending', newDate: '2026-10-21', requestedAt: ISO }));
  await check('self-approve a reschedule',                'deny',  wr('a', 'reschedule/rta/2026-11', { status: 'approved', rsDeadline: ISO }));
  await check('smuggle rsDeadline into a request',        'deny',  wr('a', 'reschedule/rta/2026-12', { status: 'pending', rsDeadline: ISO }));
  await check('request on behalf of another trainee',     'deny',  wr('a', 'reschedule/rtb/2026-10', { status: 'pending' }));
  await check('whole-node write of reschedule/rta',       'deny',  wr('a', 'reschedule/rta', { '2026-10': { status: 'approved' } }));

  await check('submit monthly test (first time)',         'allow', wr('a', 'submissions/rta/2026-10', { month: '2026-10', mcqScore: 5, essayPending: true, submittedAt: ISO }));
  await check('overwrite submitted test (retake)',        'deny',  wr('a', 'submissions/rta/2026-10', { month: '2026-10', mcqScore: 99, submittedAt: ISO }));
  await check('submission carrying essayScores',          'deny',  wr('a', 'submissions/rta/2026-11', { month: '2026-11', essayScores: { 1: 10 }, essayTotal: 10 }));
  await check('submission marked essayPending=false',     'deny',  wr('a', 'submissions/rta/2026-12', { month: '2026-12', essayPending: false }));
  await check('back-fill missing questionSnapshot',       'allow', wr('a', 'submissions/rta/2026-10/questionSnapshot', { 1: { text: 'q' } }));
  await check('rewrite an existing questionSnapshot',     'deny',  wr('a', 'submissions/rta/2026-10/questionSnapshot', { 1: { text: 'changed' } }));
  await check('submission for another trainee',           'deny',  wr('a', 'submissions/rtb/2026-10', { month: '2026-10', mcqScore: 100 }));
  await check('read another trainee’s submissions',       'deny',  rd('a', 'submissions/rtb'));

  await check('record own auto-graded monthly score',     'allow', wr('a', 'monthly_scores/2026-10/rta', { score: 80, passed: true, gradedAt: ISO, autoGraded: true }));
  await check('record a score for another trainee',       'deny',  wr('a', 'monthly_scores/2026-10/rtb', { score: 100, passed: true, autoGraded: true }));
  await check('monthly score without autoGraded flag',    'deny',  wr('a', 'monthly_scores/2026-11/rta', { score: 100, passed: true }));
  await check('monthly score claiming essay (liet)',      'deny',  wr('a', 'monthly_scores/2026-12/rta', { score: 100, liet: 0, autoGraded: true }));
  await check('read the whole monthly_scores node',       'deny',  rd('a', 'monthly_scores'));
  await check('read another trainee’s monthly score',     'deny',  rd('a', 'monthly_scores/2026-10/rtb'));
  await reset('monthly_scores/2026-10/rta', { score: 250, liet: 3, passed: true, gradedAt: ISO });
  await check('overwrite an ADMIN-graded monthly score',  'deny',  wr('a', 'monthly_scores/2026-10/rta', { score: 300, passed: true, autoGraded: true }));

  await check('read proposals',                           'deny',  rd('a', 'proposals'));
  await check('write a proposal',                         'deny',  wr('a', 'proposals/p1', { proposedBy: 'rta', status: 'pending' }));
  await check('write own notif_prefs',                    'allow', wr('a', 'notif_prefs/rta', { enabled: true }));
  await check('write another trainee’s notif_prefs',      'deny',  wr('a', 'notif_prefs/rtb', { enabled: false }));
  await check('read legacy interviews_list',              'deny',  rd('a', 'interviews_list'));
  await check('write to an unknown path (misc/x)',        'deny',  wr('a', 'misc/x', 1));
  await check('wipe the whole database',                  'deny',  wr('a', '', null));

  // ───────────────────────── team leader ─────────────────────────
  console.log('\n[team leader "rtleader" — a trainee flagged isLeader]');
  await reset('users/rta/leaderName', 'rtleader');
  await check('query users by own leaderName',            'allow', qry('leader', 'users', 'leaderName', 'rtleader'));
  await check('query users by SOMEONE ELSE’s leaderName', 'deny',  qry('leader', 'users', 'leaderName', 'rtadmin'));
  await check('read a team member’s profile',             'allow', rd('leader', 'users/rta'));
  await check('read a non-member’s profile',              'deny',  rd('leader', 'users/rtb'));
  await check('read the whole users node',                'deny',  rd('leader', 'users'));
  await check('read team member progress',                'allow', rd('leader', 'progress/rta'));
  await check('read non-member progress',                 'deny',  rd('leader', 'progress/rtb'));
  await check('read team member exam',                    'allow', rd('leader', 'exam/rta'));
  await check('read team member submissions',             'allow', rd('leader', 'submissions/rta'));
  await check('read team member monthly score',           'allow', rd('leader', 'monthly_scores/2026-10/rta'));
  await check('read team member feedback',                'deny',  rd('leader', 'feedback/rta'));
  await check('read team member interview',               'deny',  rd('leader', 'interview/rta'));
  await check('write team member progress',              'deny',  wr('leader', 'progress/rta', { module5_done: true }));
  await check('change team member role',                  'deny',  wr('leader', 'users/rta/role', 'admin'));
  await reset('users/rta/leaderName', 'rtleader');

  // ───────────────────────── moderator ─────────────────────────
  console.log('\n[moderator "rtmod"]');
  await check('read all users',                           'allow', rd('mod', 'users'));
  await check('read any exam',                            'allow', rd('mod', 'exam/rta'));
  await check('read any interview',                       'allow', rd('mod', 'interview'));
  await check('read all monthly_scores',                  'allow', rd('mod', 'monthly_scores'));
  await check('read any feedback',                        'deny',  rd('mod', 'feedback/rta'));
  await check('read qbank (answer keys)',                 'deny',  rd('mod', 'qbank'));
  await check('change a user’s role',                     'deny',  wr('mod', 'users/rta/role', 'admin'));
  await check('map a uid to a username',                  'deny',  wr('mod', 'uidmap/fake', 'rta'));
  await check('grade an exam (set passed)',               'deny',  wr('mod', 'exam/rta/passed', true));
  await check('write monthly_config',                     'deny',  wr('mod', 'monthly_config/2026-11', { title: 'x' }));
  await check('file a proposal as itself',                'allow', wr('mod', 'proposals/p-mod-1', { id: 'p-mod-1', proposedBy: 'rtmod', status: 'pending', source: 'exam' }));
  await check('file a proposal in someone else’s name',   'deny',  wr('mod', 'proposals/p-mod-2', { id: 'p-mod-2', proposedBy: 'rta', status: 'pending' }));
  await check('file a proposal already "approved"',       'deny',  wr('mod', 'proposals/p-mod-3', { id: 'p-mod-3', proposedBy: 'rtmod', status: 'approved' }));
  await check('overwrite an existing proposal',           'deny',  wr('mod', 'proposals/p-mod-1', { id: 'p-mod-1', proposedBy: 'rtmod', status: 'pending', source: 'changed' }));
  await check('read the proposals list',                  'deny',  rd('mod', 'proposals'));

  // ───────────────────────── administrator ─────────────────────────
  console.log('\n[administrator "rtadmin"]');
  await check('read all users',                           'allow', rd('admin', 'users'));
  await check('read qbank',                               'allow', rd('admin', 'qbank'));
  await check('read any feedback',                        'allow', rd('admin', 'feedback'));
  await check('read proposals',                           'allow', rd('admin', 'proposals'));
  await check('change a user’s role',                     'allow', wr('admin', 'users/rtb/role', 'mod'));
  await check('invalid role value (superuser)',           'deny',  wr('admin', 'users/rtb/role', 'superuser'));
  await check('restore role',                             'allow', wr('admin', 'users/rtb/role', 'trainee'));
  await check('Add User: uidmap + profile in one write',  'allow', up('admin', '', { 'uidmap/new-uid-1': 'newuser', 'users/newuser': { role: 'trainee', fullName: 'New', email: 'n@x.example', uid: 'new-uid-1' } }));
  await check('delete that user (users + uidmap)',        'allow', up('admin', '', { 'uidmap/new-uid-1': null, 'users/newuser': null }));
  await check('grade an exam (set passed/score)',         'allow', up('admin', 'exam/rtb', { status: 'graded', passed: true, score: 80, total: 100, passScore: 80 }));
  await check('write monthly_config',                     'allow', wr('admin', 'monthly_config/2026-11', { title: 'Nov' }));
  await check('write qbank',                              'allow', wr('admin', 'qbank/others', { questions: [] }));
  await check('write whole monthly_scores',               'allow', wr('admin', 'monthly_scores/2026-10/rtb', { score: 70, passed: true }));
  await check('write exam_qbank_v2',                      'allow', wr('admin', 'exam_qbank_v2', [{ q: 'Q', module: 1, maxPoints: 10, rubric: 'R' }]));
  await check('approve a proposal',                       'allow', up('admin', 'proposals/p-mod-1', { status: 'approved' }));

  // ── tidy up ──
  for (const a of Object.values(ACTORS)) { try { await deleteApp(a.app); } catch (e) {} }

  console.log('\n══════════════════════════════════════════');
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  if (fail) { console.log('\n  FAILURES:'); failures.forEach(f => console.log('   - ' + f)); }
  console.log('══════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('\nTest run aborted:', e); process.exit(2); });
