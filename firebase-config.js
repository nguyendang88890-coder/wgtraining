// ===== FIREBASE CONFIG + AUTH + SYNC =====
// Real Firebase Auth (email + password). Identity → data mapping:
//   Firebase Auth uid  ──uidmap/<uid>──▶  username  ──users/<username>──▶  profile (role, isLeader…)
// Security Rules (database.rules.json) authorise everything through that mapping.
// The Firebase web API key is client-side config, not a secret.

const _FB_CONFIGS = {
  prod: {
    apiKey: "AIzaSyDb1g23S4_5qub_WO8zeeASF_Y8ySi352E",
    authDomain: "wgtraining-a669d.firebaseapp.com",
    databaseURL: "https://wgtraining-a669d-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "wgtraining-a669d",
    storageBucket: "wgtraining-a669d.firebasestorage.app",
    messagingSenderId: "724317598235",
    appId: "1:724317598235:web:0cac6311d964c9b0fdfebe",
    measurementId: "G-WJD9D652N0"
  },
  staging: {
    apiKey: "AIzaSyBeuY1Ammpo4_GxcAsomI2fXFklgOqmiOY",
    authDomain: "wgtraining-staging.firebaseapp.com",
    databaseURL: "https://wgtraining-staging-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "wgtraining-staging",
    storageBucket: "wgtraining-staging.firebasestorage.app",
    messagingSenderId: "555928960827",
    appId: "1:555928960827:web:9b0e0a03cd968403b1011e"
  }
};

// Anything served from a real domain uses production. Local dev (localhost)
// defaults to STAGING so testing can never touch live data; opt in to the live
// project from the console with: localStorage.setItem('wg_env','prod')
function _pickEnv() {
  const h = location.hostname;
  if (h !== 'localhost' && h !== '127.0.0.1') return 'prod';
  try {
    const o = localStorage.getItem('wg_env');
    if (o === 'prod' || o === 'staging') return o;
  } catch (e) {}
  return 'staging';
}
const WG_ENV = _pickEnv();
const firebaseConfig = _FB_CONFIGS[WG_ENV];
window.WG_ENV = WG_ENV;

if (WG_ENV === 'staging') {
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.textContent = 'STAGING DATA';
    b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;background:#ff7a00;color:#fff;font:700 11px/1 sans-serif;padding:5px 8px;border-radius:6px;opacity:.85;pointer-events:none;';
    document.body.appendChild(b);
  });
}

// ── Init ───────────────────────────────────────────────────────────────────
// _authReady resolves once Firebase has restored (or failed to restore) the
// signed-in user — i.e. after the FIRST onAuthStateChanged callback. Writes and
// syncs await it so they never race the session restore.
let _authReadyResolve;
let _authSettled = false;
const _authReady = new Promise(resolve => { _authReadyResolve = resolve; });
function _settleAuthReady() {
  if (_authSettled) return;
  _authSettled = true;
  _authReadyResolve();
}

try {
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  window.FDB = firebase.database();
  firebase.auth().onAuthStateChanged(() => _settleAuthReady());
  setTimeout(() => {
    if (_authSettled) return;
    console.warn('[Firebase] Auth restore timed out after 8s — continuing signed-out.');
    _settleAuthReady();
  }, 8000);
} catch (e) {
  console.warn('[Firebase] Init failed:', e.message);
  window.FDB = null;
  _settleAuthReady();
}

// ── Session ────────────────────────────────────────────────────────────────
// Local caches that belong to whoever is signed in. Cleared on logout/login so
// nothing leaks between users sharing a browser. Settings that are not user
// data are kept.
function _clearUserCaches() {
  const keep = k => k === 'wmt_gemini_key' || k.startsWith('wmt_notif_prefs_');
  Object.keys(localStorage).filter(k => k.startsWith('wmt_') && !keep(k))
    .forEach(k => localStorage.removeItem(k));
}
window.clearUserCaches = _clearUserCaches;

let _sessionCache = null;

// Resolves to { uid, email, username, profile, role, isLeader } or null when
// nobody is signed in / the account has not been provisioned by an admin.
window.getSession = async function() {
  await _authReady;
  if (!window.FDB) return null;
  const u = firebase.auth().currentUser;
  if (!u) { _sessionCache = null; return null; }
  if (_sessionCache && _sessionCache.uid === u.uid) return _sessionCache;
  try {
    const mapSnap = await window.FDB.ref('uidmap/' + u.uid).once('value');
    const username = mapSnap.val();
    if (!username) return null;
    const profSnap = await window.FDB.ref('users/' + username).once('value');
    const profile = profSnap.val();
    if (!profile) return null;
    _sessionCache = {
      uid: u.uid, email: u.email, username, profile,
      role: profile.role || 'trainee', isLeader: profile.isLeader === true
    };
    localStorage.setItem('wmt_user', username);
    return _sessionCache;
  } catch (e) {
    console.warn('[Firebase] session lookup failed:', e.message);
    return null;
  }
};

// Page guard: send visitors without a valid, provisioned session to the login page.
window.requireSession = async function() {
  const sess = await window.getSession();
  if (!sess) {
    _clearUserCaches();
    if (!/(^|\/)index\.html$|\/$/.test(location.pathname)) location.href = 'index.html';
    return null;
  }
  return sess;
};

window.loginWithEmail = async function(email, password) {
  await _authReady;
  if (!window.FDB) throw new Error('Cannot reach the server.');
  _clearUserCaches();
  _sessionCache = null;
  await firebase.auth().signInWithEmailAndPassword(email.trim(), password);
  const sess = await window.getSession();
  if (!sess) {
    await firebase.auth().signOut();
    const err = new Error('This account has not been activated yet. Please contact your administrator.');
    err.code = 'wg/not-provisioned';
    throw err;
  }
  return sess;
};

window.logoutUser = async function() {
  try { await firebase.auth().signOut(); } catch (e) {}
  _sessionCache = null;
  _clearUserCaches();
};

// Password reset e-mail (Firebase-hosted flow). Works for forgot-password and
// for an admin resetting someone else's password.
window.sendResetEmail = function(email) {
  return firebase.auth().sendPasswordResetEmail(email.trim());
};

window.changeOwnPassword = async function(current, next) {
  const u = firebase.auth().currentUser;
  if (!u || !u.email) throw new Error('Not signed in.');
  const cred = firebase.auth.EmailAuthProvider.credential(u.email, current);
  await u.reauthenticateWithCredential(cred);
  await u.updatePassword(next);
};

// Admin only: create the Firebase Auth account for a new user WITHOUT signing the
// admin out (uses a throw-away secondary app instance). The caller then writes
// uidmap/<uid> + users/<username> and calls commit(); on failure call rollback().
window.createAuthAccount = async function(email, password) {
  const app2 = firebase.initializeApp(firebaseConfig, 'secondary-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));
  let cred;
  try {
    cred = await app2.auth().createUserWithEmailAndPassword(email.trim(), password);
  } catch (e) {
    await app2.delete().catch(() => {});
    throw e;
  }
  return {
    uid: cred.user.uid,
    commit:   async () => { await app2.auth().signOut().catch(() => {}); await app2.delete().catch(() => {}); },
    rollback: async () => { await cred.user.delete().catch(() => {}); await app2.delete().catch(() => {}); }
  };
};

// ── Path mapper ────────────────────────────────────────────────────────────
// Maps a localStorage key to a Firebase Realtime Database path.
function _fbPath(key) {
  // Global collections
  if (key === 'wmt_users_db')            return 'users';
  if (key === 'wmt_exam_qbank_v2')       return 'exam_qbank_v2';
  if (key === 'wmt_monthly_config')      return 'monthly_config';
  if (key === 'wmt_monthly_scores')      return 'monthly_scores';
  if (key === 'wmt_proposals')           return 'proposals';
  if (key === 'wmt_qbank_bdcs')          return 'qbank/bdcs';
  if (key === 'wmt_qbank_others')        return 'qbank/others';
  if (key === 'wmt_schedule_announcements') return 'schedule_announcements';

  // Per-user: wmt_progress_{user}
  const progressMatch = key.match(/^wmt_progress_(.+)$/);
  if (progressMatch) return `progress/${progressMatch[1]}`;

  // Per-user: wmt_exam_{user}
  const examMatch = key.match(/^wmt_exam_(.+)$/);
  if (examMatch) return `exam/${examMatch[1]}`;

  // Per-user quiz: wmt_quiz_{user}_m{n}
  const quizMatch = key.match(/^wmt_quiz_(.+)_m(\d+)$/);
  if (quizMatch) return `quiz/${quizMatch[1]}/m${quizMatch[2]}`;

  // Per-user interview: wmt_interview_{user}
  const ivMatch = key.match(/^wmt_interview_(.+)$/);
  if (ivMatch) return `interview/${ivMatch[1]}`;

  // Per-user feedback: wmt_feedback_{user}
  const fbMatch = key.match(/^wmt_feedback_(.+)$/);
  if (fbMatch) return `feedback/${fbMatch[1]}`;

  // Per-user submission: wmt_sub_{user}_{month}
  const subMatch = key.match(/^wmt_sub_(.+)_(\d{4}-\d{2})$/);
  if (subMatch) return `submissions/${subMatch[1]}/${subMatch[2]}`;

  // Generated test: wmt_gentest_{group}_{month}
  const genMatch = key.match(/^wmt_gentest_(.+)_(\d{4}-\d{2})$/);
  if (genMatch) return `gentest/${genMatch[1]}/${genMatch[2]}`;

  // Monthly reschedule: wmt_monthly_reschedule_{user}
  const rsMatch = key.match(/^wmt_monthly_reschedule_(.+)$/);
  if (rsMatch) return `reschedule/${rsMatch[1]}`;

  // Per-user notification prefs: wmt_notif_prefs_{user}
  const npMatch = key.match(/^wmt_notif_prefs_(.+)$/);
  if (npMatch) return `notif_prefs/${npMatch[1]}`;

  // Fallback: store under misc/ (no rule grants access — such writes are denied)
  return `misc/${key.replace(/^wmt_/, '')}`;
}

// ── Write ──────────────────────────────────────────────────────────────────
// Writes to localStorage synchronously and fires to Firebase in the background.
// value must be a JSON string (same as what you'd pass to localStorage.setItem).
window.dbWrite = async function(key, value) {
  localStorage.setItem(key, value);
  await _authReady;
  if (window.FDB) {
    try {
      let parsed = JSON.parse(value);
      // Proposals are stored keyed by id (one child per proposal) so a mod can
      // add its own without rewriting everyone else's. Admin saves the whole list.
      if (key === 'wmt_proposals' && Array.isArray(parsed)) {
        const byId = {};
        parsed.forEach(p => { byId[p.id] = p; });
        parsed = byId;
      }
      window.FDB.ref(_fbPath(key)).set(parsed)
        .catch(err => console.warn(`[Firebase] write failed (${key}):`, err.message));
    } catch (e) {
      console.warn(`[Firebase] dbWrite parse error (${key}):`, e.message);
    }
  }
};

// ── Remove ─────────────────────────────────────────────────────────────────
window.dbRemove = async function(key) {
  localStorage.removeItem(key);
  await _authReady;
  if (window.FDB) {
    window.FDB.ref(_fbPath(key)).remove()
      .catch(err => console.warn(`[Firebase] remove failed (${key}):`, err.message));
  }
};

// Direct, promise-returning helpers for child-level writes (callers handle
// errors). Use these where Security Rules authorise a specific child path
// rather than the whole parent node.
window.fbSet = async function(path, value) {
  await _authReady;
  if (!window.FDB) throw new Error('Firebase unavailable');
  return window.FDB.ref(path).set(value);
};
window.fbUpdate = async function(path, values) {
  await _authReady;
  if (!window.FDB) throw new Error('Firebase unavailable');
  return window.FDB.ref(path).update(values);
};
window.fbRemove = async function(path) {
  await _authReady;
  if (!window.FDB) throw new Error('Firebase unavailable');
  return window.FDB.ref(path).remove();
};

// A mod submits a proposal as ONE child (proposals/<id>) — it can create its own
// but never rewrite anyone else's. Returns a promise; local list is kept in sync.
window.submitProposal = async function(entry) {
  const list = JSON.parse(localStorage.getItem('wmt_proposals') || '[]');
  list.push(entry);
  localStorage.setItem('wmt_proposals', JSON.stringify(list));
  return window.fbSet('proposals/' + entry.id, entry);
};

// ── Monthly test schedule announcements ──────────────────────────────────
// A lightweight global feed (separate from the per-user "remind me before
// deadline" prefs) that records every time an admin schedules a brand-new
// month's test, so trainee/mod dashboards can surface "new test scheduled"
// instead of only reminding as the deadline approaches.
window.getScheduleAnnouncements = function() {
  return JSON.parse(localStorage.getItem('wmt_schedule_announcements') || '[]');
};

window.addScheduleAnnouncement = function(month, title) {
  const list = window.getScheduleAnnouncements();
  list.push({ month, title, createdAt: new Date().toISOString() });
  // Keep only the most recent 20 so the feed never grows unbounded.
  window.dbWrite('wmt_schedule_announcements', JSON.stringify(list.slice(-20)));
};

// ── Sync from Firebase → localStorage ─────────────────────────────────────
// `await syncFromFirebase()` on page load refreshes the local cache. What is
// pulled depends on the signed-in role, mirroring what the Security Rules allow:
//   trainee : own data + shared content
//   leader  : + their team members' progress/exam/quiz/submissions
//   mod     : everything except feedback
//   admin   : everything
// After it resolves, all reads can use localStorage as normal (fast + sync).
let _syncInFlight = null;
window.syncFromFirebase = function() {
  if (_syncInFlight) return _syncInFlight;
  _syncInFlight = _doSync().catch(e => console.warn('[Firebase] syncFromFirebase error:', e.message))
    .finally(() => { _syncInFlight = null; });
  return _syncInFlight;
};

async function _doSync() {
  await _authReady;
  if (!window.FDB) return;
  const sess = await window.getSession();
  if (!sess) return;

  const me      = sess.username;
  const isAdmin = sess.role === 'admin';
  const isStaff = isAdmin || sess.role === 'mod';

  // Read a path; a denied/failed read returns null (never clear local data on failure).
  const read = async path => {
    try { return await window.FDB.ref(path).once('value'); }
    catch (e) { console.warn(`[Firebase] sync failed (${path}):`, e.message); return null; }
  };
  const put = (ls, snap, clearable) => {
    if (!snap) return;
    if (snap.exists()) localStorage.setItem(ls, JSON.stringify(snap.val()));
    else if (clearable) localStorage.removeItem(ls);
  };

  // ── Users in scope ──
  let usersObj = {};
  if (isStaff) {
    const s = await read('users');
    usersObj = (s && s.val()) || {};
  } else {
    const mine = await read('users/' + me);
    usersObj[me] = (mine && mine.val()) || sess.profile;
    if (sess.isLeader) {
      try {
        const team = await window.FDB.ref('users').orderByChild('leaderName').equalTo(me).once('value');
        Object.assign(usersObj, team.val() || {});
      } catch (e) { console.warn('[Firebase] team sync failed:', e.message); }
    }
  }
  localStorage.setItem('wmt_users_db', JSON.stringify(usersObj));
  const usernames = Object.keys(usersObj);

  // ── Shared content (every role) ──
  await Promise.all([
    read('monthly_config').then(s => put('wmt_monthly_config', s, false)),
    read('schedule_announcements').then(s => put('wmt_schedule_announcements', s, false)),
    read('exam_qbank_v2').then(s => put('wmt_exam_qbank_v2', s, false)),
  ]);
  if (isAdmin) {
    await Promise.all([
      read('qbank/bdcs').then(s => put('wmt_qbank_bdcs', s, false)),
      read('qbank/others').then(s => put('wmt_qbank_others', s, false)),
      read('proposals').then(s => {
        if (!s) return;
        const v = s.val();
        const list = v ? Object.values(v).sort((a, b) => String(a.proposedAt || '').localeCompare(String(b.proposedAt || ''))) : [];
        localStorage.setItem('wmt_proposals', JSON.stringify(list));
      }),
    ]);
  }

  // ── Per-user data ──
  // Which paths each role may read for a given user (matches the rules).
  const pathsFor = u => {
    const own = u === me;
    const list = [
      { fb: `progress/${u}`, ls: `wmt_progress_${u}`, clearable: false },
      { fb: `exam/${u}`,     ls: `wmt_exam_${u}`,     clearable: true  },
    ];
    if (own || isStaff) {
      list.push({ fb: `interview/${u}`,  ls: `wmt_interview_${u}`,         clearable: true });
      list.push({ fb: `reschedule/${u}`, ls: `wmt_monthly_reschedule_${u}`, clearable: true });
    }
    if (own || isAdmin) list.push({ fb: `feedback/${u}`, ls: `wmt_feedback_${u}`, clearable: true });
    return list;
  };

  await Promise.all(usernames.flatMap(u => pathsFor(u).map(async ({ fb, ls, clearable }) => {
    put(ls, await read(fb), clearable);
  })));

  // Quiz results: quiz/{user}/m{1-5} — clear the 5 slots then repopulate so admin resets propagate.
  await Promise.all(usernames.map(async u => {
    const snap = await read(`quiz/${u}`);
    if (!snap) return;
    for (let m = 1; m <= 5; m++) localStorage.removeItem(`wmt_quiz_${u}_m${m}`);
    if (snap.exists()) {
      const quizData = snap.val();
      Object.keys(quizData).forEach(mKey => {
        localStorage.setItem(`wmt_quiz_${u}_m${mKey.replace('m', '')}`, JSON.stringify(quizData[mKey]));
      });
    }
  }));

  // Submissions: submissions/{user}/{month}
  await Promise.all(usernames.map(async u => {
    const snap = await read(`submissions/${u}`);
    if (snap && snap.exists()) {
      const subs = snap.val();
      Object.keys(subs).forEach(month => {
        localStorage.setItem(`wmt_sub_${u}_${month}`, JSON.stringify(subs[month]));
      });
    }
  }));

  // ── Monthly scores ──
  if (isStaff) {
    put('wmt_monthly_scores', await read('monthly_scores'), false);
  } else {
    // Non-staff read only their own (and their team's) entry per month.
    const months = Object.keys(JSON.parse(localStorage.getItem('wmt_monthly_config') || '{}'));
    const scores = {};
    await Promise.all(months.flatMap(m => usernames.map(async u => {
      const s = await read(`monthly_scores/${m}/${u}`);
      if (s && s.exists()) { (scores[m] = scores[m] || {})[u] = s.val(); }
    })));
    localStorage.setItem('wmt_monthly_scores', JSON.stringify(scores));
  }

  // ── Generated tests: gentest/{group}/{month} ──
  await Promise.all(['bdcs', 'others'].map(async g => {
    const snap = await read(`gentest/${g}`);
    if (snap && snap.exists()) {
      const months = snap.val();
      Object.keys(months).forEach(month => {
        localStorage.setItem(`wmt_gentest_${g}_${month}`, JSON.stringify(months[month]));
      });
    }
  }));
}
