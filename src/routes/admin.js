const router = require('express').Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { encrypt, decrypt } = require('../crypto');
const { parseProfile, validAccountUsername } = require('../profile');
const { uploadAvatarBody, validateAvatar, sendAvatar } = require('../avatar');

router.use(requireAdmin); // every route below is admin-only

// ---------- Elections ----------

// List all elections
router.get('/elections', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, title, status, show_live_results, theme FROM elections ORDER BY id DESC');
  res.json(rows);
});

// Create an election
router.post('/elections', async (req, res) => {
  const { title, description, theme, show_live_results } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const { rows } = await pool.query(
    `INSERT INTO elections (title, description, theme, show_live_results)
     VALUES ($1, $2, COALESCE($3::jsonb, '{"primary":"#1e66f5","accent":"#f5a623","logo":""}'::jsonb), COALESCE($4, TRUE))
     RETURNING *`,
    [title, description || null, theme ? JSON.stringify(theme) : null, show_live_results]);
  res.status(201).json(rows[0]);
});

// Edit an election or change its status (draft -> open -> closed)
router.patch('/elections/:id', async (req, res) => {
  const { title, description, theme, status, show_live_results } = req.body;
  if (status && !['draft', 'open', 'closed'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  const { rows } = await pool.query(
    `UPDATE elections SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       theme = COALESCE($3::jsonb, theme),
       status = COALESCE($4, status),
       show_live_results = COALESCE($5, show_live_results)
     WHERE id = $6 RETURNING *`,
    [title, description, theme ? JSON.stringify(theme) : null, status, show_live_results, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Election not found' });
  if (rows[0].status === 'closed')   // stored codes are no longer needed
    await pool.query('UPDATE voters SET code_enc = NULL WHERE election_id = $1', [req.params.id]);
  res.json(rows[0]);
});

// ---------- Positions ----------

// Add a position
router.post('/elections/:id/positions', async (req, res) => {
  const { title, sort_order } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const { rows } = await pool.query(
    'INSERT INTO positions (election_id, title, sort_order) VALUES ($1, $2, $3) RETURNING *',
    [req.params.id, title, sort_order || 0]);
  res.status(201).json(rows[0]);
});

// Remove a position (and its candidates), only while no votes exist
router.delete('/positions/:id', async (req, res) => {
  const p = (await pool.query('SELECT election_id FROM positions WHERE id=$1', [req.params.id])).rows[0];
  if (!p) return res.status(404).json({ error: 'Position not found' });
  const hasVotes = await pool.query('SELECT 1 FROM votes WHERE election_id=$1 LIMIT 1', [p.election_id]);
  if (hasVotes.rowCount)
    return res.status(400).json({ error: 'Votes have already been cast in this election, so this can no longer be removed' });
  await pool.query('DELETE FROM positions WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---------- Candidates ----------

// Add a candidate
router.post('/positions/:id/candidates', async (req, res) => {
  const { name, grade_section, bio, photo_url, account_username, account_password } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (account_username != null && typeof account_username !== 'string')
    return res.status(400).json({ error: 'Candidate username must be text' });
  if (account_password != null && typeof account_password !== 'string')
    return res.status(400).json({ error: 'Candidate password must be text' });
  if (Boolean(account_username) !== Boolean(account_password))
    return res.status(400).json({ error: 'Provide both candidate account username and password' });
  if (account_username && !validAccountUsername(account_username))
    return res.status(400).json({ error: 'Candidate username: 3-32 letters, numbers, . _ -' });
  if (account_password && account_password.length < 8)
    return res.status(400).json({ error: 'Candidate password must be at least 8 characters' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO candidates (position_id, name, grade_section, bio, photo_url, account_username, account_password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, position_id, name, grade_section, bio, photo_url`,
      [req.params.id, name, grade_section || null, bio || null, photo_url || null,
        account_username || null, account_password ? await bcrypt.hash(account_password, 12) : null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'That candidate username is already taken' });
    throw err;
  }
});

router.put('/candidates/:id/account', async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || !validAccountUsername(username))
    return res.status(400).json({ error: 'Candidate username: 3-32 letters, numbers, . _ -' });
  if (typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ error: 'Candidate password must be at least 8 characters' });
  try {
    const result = await pool.query(
      `UPDATE candidates SET account_username = $1, account_password_hash = $2
       WHERE id = $3`,
      [username, await bcrypt.hash(password, 12), req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Candidate not found' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'That candidate username is already taken' });
    throw err;
  }
});

router.get('/profiles/:electionId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT 'candidate' AS type, c.id, c.name,
            COALESCE(c.profile_photo_url,
              CASE WHEN c.profile_photo_data IS NOT NULL THEN
                '/api/admin/profiles/candidate/' || c.id::text || '/avatar'
              END) AS profile_photo_url,
            c.profile_bio, c.social_links
     FROM candidates c JOIN positions p ON p.id = c.position_id
     WHERE p.election_id = $1
     UNION ALL
     SELECT 'voter' AS type, v.id, COALESCE(v.full_name, 'Voter') AS name,
            COALESCE(v.profile_photo_url,
              CASE WHEN v.profile_photo_data IS NOT NULL THEN
                '/api/admin/profiles/voter/' || v.id::text || '/avatar'
              END) AS profile_photo_url,
            v.profile_bio, v.social_links
     FROM voters v WHERE v.election_id = $1
     ORDER BY type, name`,
    [req.params.electionId]);
  res.json(rows);
});

router.put('/profiles/:type/:id', async (req, res) => {
  if (!['candidate', 'voter'].includes(req.params.type))
    return res.status(400).json({ error: 'Invalid profile type' });
  let profile;
  try { profile = parseProfile(req.body); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  const table = req.params.type === 'candidate' ? 'candidates' : 'voters';
  const result = await pool.query(
    `UPDATE ${table}
     SET profile_bio = $1, social_links = $2::jsonb
     WHERE id = $3`,
    [profile.profile_bio, JSON.stringify(profile.social_links), req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Profile not found' });
  res.json({ ok: true });
});

router.put('/profiles/:type/:id/avatar', uploadAvatarBody, validateAvatar, async (req, res) => {
  if (!['candidate', 'voter'].includes(req.params.type))
    return res.status(400).json({ error: 'Invalid profile type' });
  const table = req.params.type === 'candidate' ? 'candidates' : 'voters';
  const result = await pool.query(
    `UPDATE ${table}
     SET profile_photo_url = NULL, profile_photo_data = $1, profile_photo_mime = $2
     WHERE id = $3`,
    [req.body, req.avatarMime, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Profile not found' });
  res.json({ ok: true });
});

router.get('/profiles/:type/:id/avatar', async (req, res) => {
  if (!['candidate', 'voter'].includes(req.params.type))
    return res.status(400).json({ error: 'Invalid profile type' });
  const table = req.params.type === 'candidate' ? 'candidates' : 'voters';
  const { rows } = await pool.query(
    `SELECT profile_photo_data, profile_photo_mime FROM ${table} WHERE id = $1`,
    [req.params.id]);
  return sendAvatar(res, rows[0]);
});

router.delete('/profiles/:type/:id/avatar', async (req, res) => {
  if (!['candidate', 'voter'].includes(req.params.type))
    return res.status(400).json({ error: 'Invalid profile type' });
  const table = req.params.type === 'candidate' ? 'candidates' : 'voters';
  const result = await pool.query(
    `UPDATE ${table}
     SET profile_photo_url = NULL, profile_photo_data = NULL, profile_photo_mime = NULL
     WHERE id = $1`,
    [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Profile not found' });
  res.json({ ok: true });
});

// Remove a candidate, only while no votes exist
router.delete('/candidates/:id', async (req, res) => {
  const c = (await pool.query(
    `SELECT p.election_id FROM candidates c JOIN positions p ON p.id = c.position_id WHERE c.id=$1`,
    [req.params.id])).rows[0];
  if (!c) return res.status(404).json({ error: 'Candidate not found' });
  const hasVotes = await pool.query('SELECT 1 FROM votes WHERE election_id=$1 LIMIT 1', [c.election_id]);
  if (hasVotes.rowCount)
    return res.status(400).json({ error: 'Votes have already been cast in this election, so this can no longer be removed' });
  await pool.query('DELETE FROM candidates WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---------- Voters ----------

// Bulk add students and generate codes
router.post('/elections/:id/voters', async (req, res) => {
  const students = req.body.students; // [{ studentId, fullName, gradeSection }, ...]
  if (!Array.isArray(students) || !students.length)
    return res.status(400).json({ error: 'Provide a list of students' });

  const issued = [];
  for (const s of students) {
    if (!s.studentId) continue;
    const code = crypto.randomBytes(4).toString('hex');
    const result = await pool.query(
      `INSERT INTO voters (election_id, student_id, full_name, grade_section, code_hash, code_enc)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (election_id, student_id) DO NOTHING`,
      [req.params.id, s.studentId, s.fullName || null, s.gradeSection || null, await bcrypt.hash(code, 10), encrypt(code)]);
    if (result.rowCount) issued.push({ studentId: s.studentId, fullName: s.fullName, gradeSection: s.gradeSection, code });
  }
  res.json(issued);
});

// Voter list (shows who voted, never what they voted for)
router.get('/elections/:id/voters', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, student_id, full_name, grade_section, has_voted, (code_enc IS NOT NULL) AS has_code
     FROM voters WHERE election_id = $1 ORDER BY student_id`, [req.params.id]);
  res.json(rows);
});

router.put('/voters/:id', async (req, res) => {
  const gradeSection = req.body?.gradeSection == null ? '' : String(req.body.gradeSection).trim();
  if (gradeSection.length > 120)
    return res.status(400).json({ error: 'Section must be 120 characters or fewer' });
  const result = await pool.query(
    'UPDATE voters SET grade_section=$1 WHERE id=$2',
    [gradeSection || null, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Voter not found' });
  res.json({ ok: true });
});

// Show a student's stored code
router.get('/voters/:id/code', async (req, res) => {
  const v = (await pool.query('SELECT code_enc, has_voted FROM voters WHERE id=$1', [req.params.id])).rows[0];
  if (!v) return res.status(404).json({ error: 'Voter not found' });
  if (v.has_voted) return res.status(400).json({ error: 'This student has already voted' });
  if (!v.code_enc) return res.status(404).json({ error: 'No stored code. Use Reset code.' });
  res.json({ code: decrypt(v.code_enc) });
});

// Issue a new code (lost code, or voters created before encryption was added)
router.post('/voters/:id/reset-code', async (req, res) => {
  const code = crypto.randomBytes(4).toString('hex');
  const result = await pool.query(
    `UPDATE voters SET code_hash=$1, code_enc=$2 WHERE id=$3 AND has_voted=FALSE`,
    [await bcrypt.hash(code, 10), encrypt(code), req.params.id]);
  if (!result.rowCount) return res.status(400).json({ error: 'Voter not found or already voted' });
  res.json({ code });
});

// Remove a voter who hasn't voted yet
router.delete('/voters/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM voters WHERE id=$1 AND has_voted=FALSE', [req.params.id]);
  if (!result.rowCount) return res.status(400).json({ error: 'Voter not found or already voted' });
  res.json({ ok: true });
});

// Delete an entire election (positions, candidates, voters and votes go with it)
router.delete('/elections/:id', async (req, res) => {
  const e = (await pool.query('SELECT title, status FROM elections WHERE id=$1', [req.params.id])).rows[0];
  if (!e) return res.status(404).json({ error: 'Election not found' });
  if (e.status === 'open')
    return res.status(400).json({ error: 'Close the election (or set it to draft) before deleting it' });
  if ((req.body?.confirmTitle || '').trim() !== e.title.trim())
    return res.status(400).json({ error: 'The title you typed does not match, so nothing was deleted' });
  await pool.query('DELETE FROM elections WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;