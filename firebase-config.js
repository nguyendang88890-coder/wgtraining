// ===== FIREBASE CONFIG =====
// Replace the values below with your actual Firebase project credentials.
// Get them from: Firebase Console → Project Settings → Your apps → Config
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDb1g23S4_5qub_WO8zeeASF_Y8ySi352E",
  authDomain: "wgtraining-a669d.firebaseapp.com",
  databaseURL: "https://wgtraining-a669d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "wgtraining-a669d",
  storageBucket: "wgtraining-a669d.firebasestorage.app",
  messagingSenderId: "724317598235",
  appId: "1:724317598235:web:0cac6311d964c9b0fdfebe",
  measurementId: "G-WJD9D652N0"
};

// ── Init ───────────────────────────────────────────────────────────────────
const _FB_READY = firebaseConfig.apiKey !== "your_API_key";

// Resolves once anonymous sign-in has settled (success or failure) — dbWrite/
// dbRemove/syncFromFirebase all await this first, since the DB rules require
// "auth != null" and reads/writes issued before sign-in completes would
// otherwise race and fail with permission_denied.
let _authReadyResolve;
let _authSettled = false;
const _authReady = new Promise(resolve => { _authReadyResolve = resolve; });
function _settleAuthReady() {
  if (_authSettled) return;
  _authSettled = true;
  _authReadyResolve();
}

if (_FB_READY) {
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    window.FDB = firebase.database();
    // Wait for onAuthStateChanged rather than just the signInAnonymously()
    // promise: the Database SDK picks up the new auth token for its own
    // (separate) socket connection on that event, slightly after the promise
    // resolves — reads issued in between still get permission_denied.
    const _unsubAuth = firebase.auth().onAuthStateChanged(user => {
      if (user) {
        _settleAuthReady();
        _unsubAuth();
      }
    });
    firebase.auth().signInAnonymously().catch(e => {
      console.warn("[Firebase] Anonymous auth failed:", e.message);
      _settleAuthReady(); // unblock the app even if sign-in itself failed
    });
    // Safety net: never let the app hang forever waiting on Firebase Auth
    // (blocked third-party storage, flaky network, etc.) — give up after 8s
    // and proceed unauthenticated; reads/writes will just fail per the rules
    // instead of freezing the login button indefinitely. Only fires (and
    // warns) if nothing above already settled it.
    setTimeout(() => {
      if (_authSettled) return;
      console.warn("[Firebase] Auth readiness timed out after 8s — continuing anyway.");
      _settleAuthReady();
    }, 8000);
  } catch (e) {
    console.warn("[Firebase] Init failed:", e.message);
    window.FDB = null;
    _settleAuthReady();
  }
} else {
  window.FDB = null;
  console.info("[Firebase] Config not set — running in localStorage-only mode.");
  _settleAuthReady();
}

// ── Password hashing (PBKDF2 via the browser's built-in Web Crypto API) ─────
// No external library needed. Each user gets a random salt; the hash is
// never reversible, so nobody — including admins — can read a real password.
async function _hashPassword(password, saltB64) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const saltBytes = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function _generateSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

// Call when setting/changing a password (register, change-password, admin
// reset...). Returns { passwordHash, passwordSalt } to merge into the user
// record — always set `password: null` alongside it to clear any legacy
// plaintext field on Firebase (update() only merges, never removes keys).
window.createPasswordRecord = async function(plaintext) {
  const passwordSalt = _generateSalt();
  const passwordHash = await _hashPassword(plaintext, passwordSalt);
  return { passwordHash, passwordSalt };
};

// Call at login / any "verify current password" check.
window.verifyPassword = async function(plaintext, user) {
  if (!user || !user.passwordHash || !user.passwordSalt) return false;
  const computed = await _hashPassword(plaintext, user.passwordSalt);
  return computed === user.passwordHash;
};

// ── Path mapper ────────────────────────────────────────────────────────────
// Maps a localStorage key to a Firebase Realtime Database path.
function _fbPath(key) {
  // Global collections
  if (key === 'wmt_users_db')            return 'users';
  if (key === 'wmt_exam_qbank')          return 'exam_qbank';
  if (key === 'wmt_monthly_config')      return 'monthly_config';
  if (key === 'wmt_monthly_scores')      return 'monthly_scores';
  if (key === 'wmt_proposals')           return 'proposals';
  if (key === 'wmt_interviews_list')     return 'interviews_list';
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

  // Fallback: store under misc/
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
      const parsed = JSON.parse(value);
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
// Call `await syncFromFirebase()` on page load so every device gets fresh data.
// After this resolves, all reads can use localStorage as normal (fast + sync).
window.syncFromFirebase = async function() {
  await _authReady;
  if (!window.FDB) return; // no-op in localStorage-only mode

  try {
    // ── Global data ──
    const globalKeys = [
      { fb: 'users',            ls: 'wmt_users_db' },
      { fb: 'exam_qbank',       ls: 'wmt_exam_qbank' },
      { fb: 'monthly_config',   ls: 'wmt_monthly_config' },
      { fb: 'monthly_scores',   ls: 'wmt_monthly_scores' },
      { fb: 'proposals',        ls: 'wmt_proposals' },
      { fb: 'interviews_list',  ls: 'wmt_interviews_list' },
      { fb: 'qbank/bdcs',       ls: 'wmt_qbank_bdcs' },
      { fb: 'qbank/others',     ls: 'wmt_qbank_others' },
      { fb: 'schedule_announcements', ls: 'wmt_schedule_announcements' },
    ];

    await Promise.all(globalKeys.map(async ({ fb, ls }) => {
      try {
        const snap = await window.FDB.ref(fb).once('value');
        if (snap.exists()) {
          localStorage.setItem(ls, JSON.stringify(snap.val()));
        }
      } catch (e) {
        console.warn(`[Firebase] sync failed (${fb}):`, e.message);
      }
    }));

    // ── Per-user data — discover all users first ──
    try {
      const usersSnap = await window.FDB.ref('users').once('value');
      if (!usersSnap.exists()) return;

      const allUsers = Object.keys(usersSnap.val());
      const perUserPaths = [];

      // Paths that are SAFE to clear from localStorage when Firebase doesn't have them
      // (admin may have explicitly deleted these — e.g. exam reset, interview reset).
      const clearableKeys = new Set();

      allUsers.forEach(u => {
        // progress: only update, never clear — user might have offline data not yet synced
        perUserPaths.push({ fb: `progress/${u}`,  ls: `wmt_progress_${u}`,  clearable: false });
        // exam/interview/reschedule: admin can delete these, so clear when missing
        perUserPaths.push({ fb: `exam/${u}`,       ls: `wmt_exam_${u}`,       clearable: true  });
        perUserPaths.push({ fb: `interview/${u}`,  ls: `wmt_interview_${u}`,  clearable: true  });
        perUserPaths.push({ fb: `reschedule/${u}`, ls: `wmt_monthly_reschedule_${u}`, clearable: true });
        perUserPaths.push({ fb: `feedback/${u}`,   ls: `wmt_feedback_${u}`,   clearable: true  });
      });

      await Promise.all(perUserPaths.map(async ({ fb, ls, clearable }) => {
        try {
          const snap = await window.FDB.ref(fb).once('value');
          if (snap.exists()) {
            localStorage.setItem(ls, JSON.stringify(snap.val()));
          } else if (clearable) {
            // Firebase is the source of truth for this key type —
            // if it was deleted (e.g. admin reset exam), clear the stale localStorage copy.
            localStorage.removeItem(ls);
          }
        } catch (e) {
          console.warn(`[Firebase] sync failed (${fb}):`, e.message);
        }
      }));

      // Quiz results: quiz/{user}/m{1-5}
      // Clear existing quiz localStorage entries FIRST so that admin resets propagate correctly.
      await Promise.all(allUsers.map(async u => {
        try {
          const snap = await window.FDB.ref(`quiz/${u}`).once('value');
          // Always clear all 5 slots for this user first, then repopulate from Firebase.
          // This ensures that if admin deleted a quiz entry it is also removed from localStorage.
          for (let m = 1; m <= 5; m++) {
            localStorage.removeItem(`wmt_quiz_${u}_m${m}`);
          }
          if (snap.exists()) {
            const quizData = snap.val();
            Object.keys(quizData).forEach(mKey => {
              // mKey = "m1", "m2", …
              const num = mKey.replace('m', '');
              localStorage.setItem(`wmt_quiz_${u}_m${num}`, JSON.stringify(quizData[mKey]));
            });
          }
        } catch (e) {
          console.warn(`[Firebase] quiz sync failed (${u}):`, e.message);
        }
      }));

      // Submissions: submissions/{user}/{month}
      await Promise.all(allUsers.map(async u => {
        try {
          const snap = await window.FDB.ref(`submissions/${u}`).once('value');
          if (snap.exists()) {
            const subs = snap.val();
            Object.keys(subs).forEach(month => {
              localStorage.setItem(`wmt_sub_${u}_${month}`, JSON.stringify(subs[month]));
            });
          }
        } catch (e) {
          console.warn(`[Firebase] submissions sync failed (${u}):`, e.message);
        }
      }));

    } catch (e) {
      console.warn('[Firebase] per-user sync failed:', e.message);
    }

    // ── Generated tests: gentest/{group}/{month} ──
    try {
      const groups = ['bdcs', 'others'];
      await Promise.all(groups.map(async g => {
        const snap = await window.FDB.ref(`gentest/${g}`).once('value');
        if (snap.exists()) {
          const months = snap.val();
          Object.keys(months).forEach(month => {
            localStorage.setItem(`wmt_gentest_${g}_${month}`, JSON.stringify(months[month]));
          });
        }
      }));
    } catch (e) {
      console.warn('[Firebase] gentest sync failed:', e.message);
    }

  } catch (e) {
    console.warn('[Firebase] syncFromFirebase error:', e.message);
  }
};
