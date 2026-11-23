// ===== localStorage QUOTA GUARD (loaded first on every page) =====
// Everything the app caches lives in localStorage under "wmt_*" keys (≈5M characters per origin).
// Admin/leader views cache every user × every month, which can outgrow that. This block:
//   1. transparently compresses large "wmt_*" values (lz-string, MIT) — callers keep using
//      localStorage.getItem/setItem with plain JSON strings, nothing else changes;
//   2. on QuotaExceededError evicts re-fetchable cache entries (never the signed-in user's own
//      data or local-only settings) and retries, instead of throwing in the middle of a save;
//   3. exposes window.lsStats() for diagnostics.
// Firebase is the source of truth; every evicted entry is restored by the next syncFromFirebase.
(function () {
  if (window.__wgStorageGuard) return;
  window.__wgStorageGuard = true;

  /*! lz-string 1.5.0 — Copyright (c) Pieroxy — MIT License — https://github.com/pieroxy/lz-string */
  const LZ = (function () { var LZString=function(){var r=String.fromCharCode,o="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",n="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",e={};function t(r,o){if(!e[r]){e[r]={};for(var n=0;n<r.length;n++)e[r][r.charAt(n)]=n}return e[r][o]}var i={compressToBase64:function(r){if(null==r)return"";var n=i._compress(r,6,function(r){return o.charAt(r)});switch(n.length%4){default:case 0:return n;case 1:return n+"===";case 2:return n+"==";case 3:return n+"="}},decompressFromBase64:function(r){return null==r?"":""==r?null:i._decompress(r.length,32,function(n){return t(o,r.charAt(n))})},compressToUTF16:function(o){return null==o?"":i._compress(o,15,function(o){return r(o+32)})+" "},decompressFromUTF16:function(r){return null==r?"":""==r?null:i._decompress(r.length,16384,function(o){return r.charCodeAt(o)-32})},compressToUint8Array:function(r){for(var o=i.compress(r),n=new Uint8Array(2*o.length),e=0,t=o.length;e<t;e++){var s=o.charCodeAt(e);n[2*e]=s>>>8,n[2*e+1]=s%256}return n},decompressFromUint8Array:function(o){if(null==o)return i.decompress(o);for(var n=new Array(o.length/2),e=0,t=n.length;e<t;e++)n[e]=256*o[2*e]+o[2*e+1];var s=[];return n.forEach(function(o){s.push(r(o))}),i.decompress(s.join(""))},compressToEncodedURIComponent:function(r){return null==r?"":i._compress(r,6,function(r){return n.charAt(r)})},decompressFromEncodedURIComponent:function(r){return null==r?"":""==r?null:(r=r.replace(/ /g,"+"),i._decompress(r.length,32,function(o){return t(n,r.charAt(o))}))},compress:function(o){return i._compress(o,16,function(o){return r(o)})},_compress:function(r,o,n){if(null==r)return"";var e,t,i,s={},u={},a="",p="",c="",l=2,f=3,h=2,d=[],m=0,v=0;for(i=0;i<r.length;i+=1)if(a=r.charAt(i),Object.prototype.hasOwnProperty.call(s,a)||(s[a]=f++,u[a]=!0),p=c+a,Object.prototype.hasOwnProperty.call(s,p))c=p;else{if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++),s[p]=f++,c=String(a)}if(""!==c){if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++)}for(t=2,e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;for(;;){if(m<<=1,v==o-1){d.push(n(m));break}v++}return d.join("")},decompress:function(r){return null==r?"":""==r?null:i._decompress(r.length,32768,function(o){return r.charCodeAt(o)})},_decompress:function(o,n,e){var t,i,s,u,a,p,c,l=[],f=4,h=4,d=3,m="",v=[],g={val:e(0),position:n,index:1};for(t=0;t<3;t+=1)l[t]=t;for(s=0,a=Math.pow(2,2),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 2:return""}for(l[3]=c,i=c,v.push(c);;){if(g.index>o)return"";for(s=0,a=Math.pow(2,d),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(c=s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 2:return v.join("")}if(0==f&&(f=Math.pow(2,d),d++),l[c])m=l[c];else{if(c!==h)return null;m=i+i.charAt(0)}v.push(m),l[h++]=i+m.charAt(0),i=m,0==--f&&(f=Math.pow(2,d),d++)}}};return i}();"function"==typeof define&&define.amd?define(function(){return LZString}):"undefined"!=typeof module&&null!=module?module.exports=LZString:"undefined"!=typeof angular&&null!=angular&&angular.module("LZString",[]).factory("LZString",function(){return LZString}); ; return LZString; })();

  const MARK = '\u0001z1:';               // value prefix meaning "compressed"
  const MIN_LEN = 1024;                    // smaller values are stored as-is
  const QUOTA_CHARS = 5 * 1024 * 1024;     // conservative per-origin budget (UTF-16 code units)
  const rawGet = Storage.prototype.getItem, rawSet = Storage.prototype.setItem;
  const rawRemove = Storage.prototype.removeItem, rawKey = Storage.prototype.key;
  const plainCache = new Map();            // key -> { raw, plain }  (avoids re-decompressing on every read)
  const stats = { evicted: 0, evictions: 0, compressedWrites: 0, savedChars: 0, failedWrites: 0 };

  const isLocal = s => { try { return s === window.localStorage; } catch (e) { return false; } };
  const isQuota = e => e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);

  Storage.prototype.getItem = function (k) {
    const v = rawGet.call(this, k);
    if (typeof v !== 'string' || v.charCodeAt(0) !== 1 || v.indexOf(MARK) !== 0 || !isLocal(this)) return v;
    const hit = plainCache.get(k);
    if (hit && hit.raw === v) return hit.plain;
    // stored form: MARK + <original length> + ':' + <compressed>; the length is an integrity check
    const body = v.slice(MARK.length), cut = body.indexOf(':'), want = parseInt(body.slice(0, cut), 10);
    let plain = null;
    try { plain = LZ.decompressFromUTF16(body.slice(cut + 1)); } catch (e) {}
    if (!plain || plain.length !== want) { rawRemove.call(this, k); plainCache.delete(k); return null; }   // corrupt: drop, next sync restores it
    if (plainCache.size > 150) plainCache.clear();
    plainCache.set(k, { raw: v, plain });
    return plain;
  };

  // Which keys may be dropped to make room (lower tier = dropped first). All are re-fetchable from Firebase.
  function tierOf(key, me) {
    if (/^wmt_sub_/.test(key))     return key.indexOf('wmt_sub_' + me + '_') === 0 ? 5 : 1;
    if (/^wmt_gentest_/.test(key)) return 2;
    if (/^wmt_(progress|exam|interview|feedback|monthly_reschedule)_/.test(key)) {
      if (key === 'wmt_exam_qbank_v2') return 0;
      const mine = ['progress', 'exam', 'interview', 'feedback', 'monthly_reschedule'].some(p => key === 'wmt_' + p + '_' + me);
      return mine ? 0 : 3;
    }
    if (/^wmt_quiz_/.test(key))    return key.indexOf('wmt_quiz_' + me + '_m') === 0 ? 0 : 3;
    if (/^wmt_qbank_/.test(key))   return 4;
    return 0;                                   // wmt_user, wmt_users_db, notif prefs, gemini key, config … never evicted
  }

  function makeRoom(store, writingKey, needChars) {
    const me = rawGet.call(store, 'wmt_user') || '';
    const cands = [];
    for (let i = 0; i < store.length; i++) {
      const key = rawKey.call(store, i);
      if (!key || key === writingKey || key.indexOf('wmt_') !== 0) continue;
      const tier = tierOf(key, me);
      if (tier) cands.push({ key, tier, len: key.length + (rawGet.call(store, key) || '').length });
    }
    const target = needChars * 1.5 + 1024;
    if (cands.reduce((s, c) => s + c.len, 0) < needChars) return false;       // not enough to free — don't wipe for nothing
    // lowest tier first; inside the monthly tiers the OLDEST month goes first, then the largest entry
    const monthOf = key => (key.match(/(\d{4}-\d{2})$/) || [])[1] || '9999-99';
    cands.sort((a, b) => a.tier - b.tier || ((a.tier <= 2) ? (monthOf(a.key) < monthOf(b.key) ? -1 : monthOf(a.key) > monthOf(b.key) ? 1 : 0) : 0) || b.len - a.len);
    let freed = 0;
    for (const c of cands) {
      rawRemove.call(store, c.key); plainCache.delete(c.key);
      freed += c.len; stats.evicted++;
      if (freed >= target) break;
    }
    stats.evictions++;
    console.warn('[cache] localStorage nearly full — dropped ' + stats.evicted + ' cached item(s) so far; they reload on the next sync.');
    return true;
  }

  Storage.prototype.setItem = function (k, v) {
    if (typeof k !== 'string' || k.indexOf('wmt_') !== 0 || !isLocal(this)) return rawSet.call(this, k, v);
    v = String(v);
    let out = v;
    if (v.length >= MIN_LEN) {
      try {
        const c = MARK + v.length + ':' + LZ.compressToUTF16(v);
        if (c.length < v.length * 0.85) { out = c; stats.compressedWrites++; stats.savedChars += v.length - c.length; }
      } catch (e) {}
    }
    plainCache.delete(k);
    try { return rawSet.call(this, k, out); }
    catch (e) {
      if (!isQuota(e)) throw e;
      if (makeRoom(this, k, k.length + out.length)) {
        try { return rawSet.call(this, k, out); } catch (e2) { if (!isQuota(e2)) throw e2; }
      }
      stats.failedWrites++;
      throw e;
    }
  };

  // Diagnostics: window.lsStats() in the browser console.
  window.lsStats = function () {
    const store = window.localStorage, byGroup = {};
    let used = 0, logical = 0, compressed = 0;
    for (let i = 0; i < store.length; i++) {
      const key = rawKey.call(store, i), raw = rawGet.call(store, key) || '';
      const size = key.length + raw.length; used += size;
      const isC = raw.indexOf(MARK) === 0; if (isC) compressed++;
      logical += key.length + (isC ? (store.getItem(key) || '').length : raw.length);
      const g = key.indexOf('wmt_') === 0 ? ((key.match(/^wmt_(sub|quiz|gentest|qbank|exam_qbank_v2|exam|progress|interview|feedback|monthly_reschedule|monthly_scores|monthly_config|notif_prefs|schedule_announcements|users_db|proposals|user|gemini_key)(?:_|$)/) || [])[1] || 'misc') : '(other)';
      byGroup[g] = (byGroup[g] || 0) + size;
    }
    return { usedChars: used, quotaChars: QUOTA_CHARS, percent: Math.round(used / QUOTA_CHARS * 1000) / 10,
      withoutCompression: logical, compressedKeys: compressed, ...stats, byGroup };
  };
})();

// ===== FIREBASE CONFIG + AUTH + SYNC =====
// Real Firebase Auth (email + password). Identity → data mapping:
//   Firebase Auth uid  ──uidmap/<uid>──▶  username  ──users/<username>──▶  profile (role, isLeader…)
// Security Rules (database.rules.json) authorise everything through that mapping.
// The Firebase web API key is client-side config, not a secret.

// Number of training modules (module1.html … moduleN.html). Change here when adding a module.
var MODULE_COUNT = 6;

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
  // The local copy is only a cache: if it cannot be stored (quota), still save to Firebase.
  try { localStorage.setItem(key, value); }
  catch (e) { console.warn(`[cache] could not store ${key} locally (${e.name}) — saving to Firebase anyway`); }
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
// Remove cached per-user entries for users who are no longer in this account's scope
// (deleted users, a previous sign-in). Only called after a sync in which every read succeeded.
function _pruneOrphanCaches(usernames) {
  const inScope = new Set(usernames);
  let removed = 0;
  Object.keys(localStorage).forEach(k => {
    let u = null, m;
    if (k === 'wmt_exam_qbank_v2' || k.indexOf('wmt_interview_booked_') === 0) return;   // not per-user
    if ((m = k.match(/^wmt_(?:progress|exam|interview|feedback|monthly_reschedule)_(.+)$/))) u = m[1];
    else if ((m = k.match(/^wmt_quiz_(.+)_m\d+$/)))        u = m[1];
    else if ((m = k.match(/^wmt_sub_(.+)_\d{4}-\d{2}$/)))   u = m[1];
    if (u !== null && !inScope.has(u)) { localStorage.removeItem(k); removed++; }
  });
  if (removed) console.info(`[cache] removed ${removed} cached item(s) of users no longer in scope`);
}

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
  let readFailed = false;   // any denied/failed read → skip pruning (absence of data proves nothing)
  const read = async path => {
    try { return await window.FDB.ref(path).once('value'); }
    catch (e) { readFailed = true; console.warn(`[Firebase] sync failed (${path}):`, e.message); return null; }
  };
  // The cache is disposable: a value that cannot be stored (quota) must not abort the sync.
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { console.warn(`[cache] could not cache ${k} (${e.name})`); } };
  const put = (ls, snap, clearable) => {
    if (!snap) return;
    if (snap.exists()) lsSet(ls, JSON.stringify(snap.val()));
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
      } catch (e) { readFailed = true; console.warn('[Firebase] team sync failed:', e.message); }
    }
  }
  lsSet('wmt_users_db', JSON.stringify(usersObj));
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
        lsSet('wmt_proposals', JSON.stringify(list));
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

  // Quiz results: quiz/{user}/m{1-N} — clear every module slot then repopulate so admin resets propagate.
  await Promise.all(usernames.map(async u => {
    const snap = await read(`quiz/${u}`);
    if (!snap) return;
    for (let m = 1; m <= MODULE_COUNT; m++) localStorage.removeItem(`wmt_quiz_${u}_m${m}`);
    if (snap.exists()) {
      const quizData = snap.val();
      Object.keys(quizData).forEach(mKey => {
        lsSet(`wmt_quiz_${u}_m${mKey.replace('m', '')}`, JSON.stringify(quizData[mKey]));
      });
    }
  }));

  // Submissions: submissions/{user}/{month}
  await Promise.all(usernames.map(async u => {
    const snap = await read(`submissions/${u}`);
    if (snap && snap.exists()) {
      const subs = snap.val();
      Object.keys(subs).forEach(month => {
        lsSet(`wmt_sub_${u}_${month}`, JSON.stringify(subs[month]));
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
    lsSet('wmt_monthly_scores', JSON.stringify(scores));
  }

  // ── Generated tests: gentest/{group}/{month} ──
  await Promise.all(['bdcs', 'others'].map(async g => {
    const snap = await read(`gentest/${g}`);
    if (snap && snap.exists()) {
      const months = snap.val();
      Object.keys(months).forEach(month => {
        lsSet(`wmt_gentest_${g}_${month}`, JSON.stringify(months[month]));
      });
    }
  }));

  // ── Housekeeping ──
  if (!readFailed) _pruneOrphanCaches(usernames);
  if (window.lsStats) {
    const st = window.lsStats();
    if (st.percent >= 70) console.warn(`[cache] localStorage is ${st.percent}% full (${st.usedChars} chars) — largest groups:`, st.byGroup);
  }
}
