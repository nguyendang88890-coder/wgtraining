// Generates firebase/database.rules.json — run:  node firebase/build-rules.js
//
// Identity model: Firebase Auth uid ──uidmap/<uid>──▶ username ──users/<username>──▶ role / isLeader.
// Realtime Database rules have no functions, so shared expressions are built here
// and expanded into the JSON. Default is DENY; every grant below is explicit.
const fs = require('fs');
const path = require('path');

// ── expression building blocks ──────────────────────────────────────────────
const ME        = "root.child('uidmap').child(auth.uid).val()";            // my username (null if unprovisioned)
const roleOf    = u => `root.child('users').child(${u}).child('role').val()`;
const MAPPED    = "auth != null && root.child('uidmap').child(auth.uid).exists()";
const ADMIN     = `auth != null && ${roleOf(ME)} === 'admin'`;
const MOD       = `auth != null && ${roleOf(ME)} === 'mod'`;
const STAFF     = `(${ADMIN}) || (${MOD})`;
const IS_ME     = u => `auth != null && ${ME} === ${u}`;
const IS_LEADER = `root.child('users').child(${ME}).child('isLeader').val() === true`;
const LEADER_OF = u => `auth != null && ${IS_LEADER} && root.child('users').child(${u}).child('leaderName').val() === ${ME}`;
const LEADER_QUERY = `auth != null && ${IS_LEADER} && query.orderByChild === 'leaderName' && query.equalTo === ${ME}`;

// who may read another user's learning data: the user, staff, or their team leader
const READ_USER_DATA = u => `(${IS_ME(u)}) || (${STAFF}) || (${LEADER_OF(u)})`;

// ── Final Exam: trainee may only perform the "submit" transition ─────────────
// (status → pending_grading, from a non-pending state). Grading outcomes — passed,
// passScore/Date, score/total/scores, attempts, gradedAttempts, fail*, disqualified —
// are admin-only because the trainee has no write rule on them.
const SUBMITTING   = "newData.parent().child('status').val() === 'pending_grading' && data.parent().child('status').val() !== 'pending_grading'";
const NOT_FINISHED = "data.parent().child('passed').val() !== true && data.parent().child('disqualified').val() !== true";
const LOCKOUT_OVER = "(!data.parent().child('fail1AtMs').exists() || now >= data.parent().child('fail1AtMs').val() + 259200000)"; // 3 days
const NEXT_ATTEMPT = "(data.parent().child('gradedAttempts').exists() ? data.parent().child('gradedAttempts').val() + 1 : 1)";

const rules = {
  rules: {
    '.read': false,
    '.write': false,

    // ── identity ──
    uidmap: {
      $uid: {
        '.read': 'auth != null && auth.uid === $uid',
        '.write': ADMIN,
        '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 40'
      }
    },

    users: {
      '.read': `(${STAFF}) || (${LEADER_QUERY})`,
      '.indexOn': ['leaderName'],
      $u: {
        '.read': `(${IS_ME('$u')}) || (${STAFF}) || (${LEADER_OF('$u')})`,
        '.write': ADMIN,
        // a user may edit only their own display name, and flip employeeType new → old
        fullName:     { '.write': `(${IS_ME('$u')}) && newData.isString() && newData.val().length <= 100` },
        employeeType: { '.write': `(${IS_ME('$u')}) && newData.val() === 'old' && data.val() !== 'old'` },
        role:         { '.validate': "newData.val() === 'trainee' || newData.val() === 'mod' || newData.val() === 'admin'" }
      }
    },

    // ── learning data (per user) ──
    progress: {
      $u: {
        '.read':  READ_USER_DATA('$u'),
        '.write': `(${IS_ME('$u')}) || (${ADMIN})`
      }
    },

    quiz: {
      $u: {
        '.read':  READ_USER_DATA('$u'),
        '.write': ADMIN,
        // a trainee records a quiz result once; only admin can reset it
        $m: { '.write': `(${IS_ME('$u')}) && !data.exists() && newData.exists()` }
      }
    },

    exam: {
      $u: {
        '.read':  READ_USER_DATA('$u'),
        '.write': ADMIN,
        status: {
          '.write': `(${IS_ME('$u')}) && newData.val() === 'pending_grading' && data.val() !== 'pending_grading' && ${NOT_FINISHED} && ${LOCKOUT_OVER}`,
          '.validate': "newData.val() === 'pending_grading' || newData.val() === 'graded'"
        },
        pendingAttemptNumber: { '.write': `(${IS_ME('$u')}) && ${SUBMITTING} && newData.val() === ${NEXT_ATTEMPT}` },
        passThreshold:        { '.write': `(${IS_ME('$u')}) && ${SUBMITTING} && newData.val() === (newData.parent().child('pendingAttemptNumber').val() === 1 ? 60 : 80)` },
        submittedAt:          { '.write': `(${IS_ME('$u')}) && ${SUBMITTING} && newData.isString()` },
        questions: {
          '.write': `(${IS_ME('$u')}) && ${SUBMITTING} && newData.hasChildren()`,
          $i: { maxPoints: { '.validate': 'newData.isNumber() && newData.val() > 0 && newData.val() <= 100' } }
        },
        answers: {
          '.write': `(${IS_ME('$u')}) && ${SUBMITTING} && newData.hasChildren()`,
          $i: { '.validate': 'newData.isString() && newData.val().length <= 8000' }
        },
        // clearing the previous attempt's score is part of submitting; setting one is admin-only
        score:  { '.write': `(${IS_ME('$u')}) && !newData.exists()` },
        total:  { '.write': `(${IS_ME('$u')}) && !newData.exists()` },
        scores: { '.write': `(${IS_ME('$u')}) && !newData.exists()` }
      }
    },

    interview: {
      $u: {
        '.read': `(${IS_ME('$u')}) || (${STAFF})`,
        // book once (pending, only after passing the exam) / cancel while still pending; every other change is admin-only
        '.write': `(${ADMIN}) || ((${IS_ME('$u')}) && (` +
          `(!data.exists() && newData.child('status').val() === 'pending' && root.child('exam').child($u).child('passed').val() === true ` +
            `&& (!newData.child('meetingLink').exists() || newData.child('meetingLink').val() === '') ` +
            `&& (!newData.child('confirmedSlot').exists() || newData.child('confirmedSlot').val() === '')) ` +
          `|| (data.child('status').val() === 'pending' && !newData.exists())))`
      }
    },

    feedback: {
      $u: {
        '.read': `(${ADMIN}) || (${IS_ME('$u')})`,
        '.write': `(${ADMIN}) || ((${IS_ME('$u')}) && newData.exists())`,
        contentRating: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 5' },
        trainerRating: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 5' },
        contentComment: { '.validate': 'newData.isString() && newData.val().length <= 3000' },
        trainerComment: { '.validate': 'newData.isString() && newData.val().length <= 3000' }
      }
    },

    reschedule: {
      $u: {
        '.read': `(${IS_ME('$u')}) || (${STAFF})`,
        '.write': ADMIN,
        // a trainee may FILE a pending request; approve/reject (status, rsDeadline…) stays admin-only
        $month: {
          '.write': `(${IS_ME('$u')}) && newData.child('status').val() === 'pending' && !newData.child('rsDeadline').exists() ` +
            `&& !newData.child('rejectReason').exists() && !newData.child('processedAt').exists() ` +
            `&& (!data.exists() || data.child('status').val() !== 'pending')`
        }
      }
    },

    submissions: {
      $u: {
        '.read':  READ_USER_DATA('$u'),
        '.write': ADMIN,
        $month: {
          // submit once; grading fields (essayScores/essayTotal/essayPending=false) are admin-only
          '.write': `(${IS_ME('$u')}) && !data.exists() && newData.exists() && !newData.child('essayScores').exists() ` +
            `&& !newData.child('essayTotal').exists() && newData.child('essayPending').val() !== false`,
          // a missing answer snapshot may be back-filled by the owner
          questionSnapshot: { '.write': `(${IS_ME('$u')}) && data.parent().exists() && !data.exists()` }
        }
      }
    },

    monthly_scores: {
      '.read':  STAFF,
      '.write': ADMIN,
      $month: {
        $u: {
          '.read': READ_USER_DATA('$u'),
          // a trainee records their own auto-graded score, and cannot replace an admin-graded one
          '.write': `(${IS_ME('$u')}) && newData.child('autoGraded').val() === true && !newData.child('liet').exists() ` +
            `&& (!data.exists() || data.child('autoGraded').val() === true)`
        }
      }
    },

    notif_prefs: {
      $u: {
        '.read':  IS_ME('$u'),
        '.write': IS_ME('$u')
      }
    },

    // ── shared content ──
    monthly_config:         { '.read': MAPPED, '.write': ADMIN },
    schedule_announcements: { '.read': MAPPED, '.write': ADMIN },
    exam_qbank_v2:          { '.read': MAPPED, '.write': ADMIN },
    gentest:                { '.read': MAPPED, '.write': ADMIN },
    qbank:                  { '.read': ADMIN,  '.write': ADMIN },

    proposals: {
      '.read':  ADMIN,
      '.write': ADMIN,
      // a mod files its own proposal as one child; it cannot touch anyone else's
      $id: {
        '.write': `(${MOD}) && !data.exists() && newData.child('proposedBy').val() === ${ME} && newData.child('status').val() === 'pending'`
      }
    }
  }
};

const out = path.join(__dirname, 'database.rules.json');
fs.writeFileSync(out, JSON.stringify(rules, null, 2) + '\n');
console.log('wrote', out);
