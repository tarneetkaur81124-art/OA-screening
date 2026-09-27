const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

/**
 * Verifies the Supabase-issued JWT sent by the frontend (from supabase.auth.getSession()).
 * Verifying locally with the project's JWT secret avoids an extra network round-trip
 * to Supabase on every request — important when health workers are on patchy connections
 * and the app server itself is closer to them (e.g. hosted regionally / at a district office).
 *
 * A signed-in Supabase user can now be either of two kinds of account:
 *   - a health worker (row in `health_workers`), or
 *   - a patient logging in on their own (row in `patients`, linked via `patients.auth_user_id`).
 *
 * This attaches `req.authUser` (raw Supabase auth claims) plus whichever of
 * `req.healthWorker` / `req.patient` matches. Neither being set just means this is a
 * brand-new account with no profile row yet — that's expected on a patient's very first
 * login, before they've called `POST /api/patients/me` to create their profile, so this
 * middleware does NOT reject that case; routes that need an existing profile enforce it
 * themselves (see `requireHealthWorker` below).
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'Server misconfigured: SUPABASE_JWT_SECRET not set' });
    }

    const claims = jwt.verify(token, secret, { algorithms: ['HS256'] });
    req.authUser = claims; // contains claims.sub = supabase auth user id

    const hw = await pool.query(
      'select id, name, role, village, block, district, language_pref from health_workers where auth_user_id = $1',
      [claims.sub]
    );

    if (hw.rows.length > 0) {
      req.healthWorker = hw.rows[0];
      return next();
    }

    const pt = await pool.query(
      'select id, auth_user_id, name, age, gender, phone, village, block, district from patients where auth_user_id = $1',
      [claims.sub]
    );

    if (pt.rows.length > 0) {
      req.patient = pt.rows[0];
      return next();
    }

    // No health_workers or patients row linked yet — allow the request through.
    // In practice only `POST /api/patients/me` (patient self-registration) makes
    // sense at this point; every other route guards itself with requireHealthWorker
    // or an explicit req.patient check.
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next(err);
  }
}

/** Restricts a route to signed-in health workers (any role) — i.e. not a patient account. */
function requireHealthWorker(req, res, next) {
  if (!req.healthWorker) {
    return res.status(403).json({ error: 'Health worker account required' });
  }
  next();
}

/** Restricts a route to officer/admin roles (for dashboard + referral management endpoints). */
function requireOfficer(req, res, next) {
  if (!req.healthWorker || !['officer', 'admin'].includes(req.healthWorker.role)) {
    return res.status(403).json({ error: 'Officer or admin role required' });
  }
  next();
}

module.exports = { requireAuth, requireOfficer, requireHealthWorker };
