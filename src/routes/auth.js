const router = require('express').Router();
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const pool = require('../db');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const validUsername = u => /^[A-Za-z0-9_.-]{3,32}$/.test(u || '');

// ----- Students -----
router.post('/login', limiter, async (req, res) => {
  const { studentId, code } = req.body;
  if (!studentId || !code) return res.status(400).json({ error: 'Enter your ID and code' });
  const { rows } = await pool.query(
    `SELECT v.* FROM voters v JOIN elections e ON e.id = v.election_id
    WHERE v.student_id = $1 AND e.status IN ('open', 'closed')`, [studentId]);
  for (const voter of rows) {
    if (await bcrypt.compare(code, voter.code_hash)) {
      return req.session.regenerate(err => {
        if (err) return res.status(500).json({ error: 'Could not start session' });
        req.session.voterId = voter.id;
        req.session.electionId = voter.election_id;
        res.json({ ok: true, studentId: voter.student_id });
      });
    }
  }
  res.status(401).json({ error: 'Invalid ID or code' });
});

router.post('/candidate-login', limiter, async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password)
    return res.status(400).json({ error: 'Enter your username and password' });
  const candidate = (await pool.query(
    `SELECT c.id, c.account_password_hash, p.election_id
     FROM candidates c
     JOIN positions p ON p.id = c.position_id
     WHERE LOWER(c.account_username) = LOWER($1) AND c.account_password_hash IS NOT NULL`,
    [username])).rows[0];
  if (!candidate || !(await bcrypt.compare(password, candidate.account_password_hash)))
    return res.status(401).json({ error: 'Wrong username or password' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start session' });
    req.session.candidateId = candidate.id;
    req.session.electionId = candidate.election_id;
    res.json({ ok: true });
  });
});

// ----- Admins -----
router.get('/setup-status', async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM admins LIMIT 1');
  res.json({ needsSetup: rows.length === 0 });
});

// Works only while no admin exists: creates the Main Admin
router.post('/setup', limiter, async (req, res) => {
  const { username, password } = req.body;
  if (!validUsername(username))
    return res.status(400).json({ error: 'Username: 3-32 letters, numbers, . _ -' });
  if (!password || password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const result = await pool.query(
      `INSERT INTO admins (username, password_hash, is_main)
       SELECT $1, $2, TRUE WHERE NOT EXISTS (SELECT 1 FROM admins)`,
      [username, await bcrypt.hash(password, 12)]);
    if (!result.rowCount) return res.status(403).json({ error: 'Setup is already complete' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(403).json({ error: 'Setup is already complete' });
    throw err;
  }
});

router.post('/admin-login', limiter, async (req, res) => {
  const { username, password } = req.body;
  const admin = (await pool.query('SELECT * FROM admins WHERE username=$1', [username || ''])).rows[0];
  if (!admin || !(await bcrypt.compare(password || '', admin.password_hash)))
    return res.status(401).json({ error: 'Wrong username or password' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start session' });
    req.session.adminId = admin.id;
    res.json({ ok: true, username: admin.username, isMain: admin.is_main });
  });
});

router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

module.exports = router;