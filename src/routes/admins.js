const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool = require('../db');
const { requireAdmin, requireMain } = require('../middleware/auth');
const { parseProfile } = require('../profile');
const { uploadAvatarBody, validateAvatar, sendAvatar } = require('../avatar');
const { getPartyTotals } = require('../party-results');

router.use(requireAdmin);

const validUsername = u => /^[A-Za-z0-9_.-]{3,32}$/.test(u || '');

// Who am I?
router.get('/me', (req, res) => res.json({ username: req.admin.username, isMain: req.admin.is_main }));

router.get('/me/profile', (req, res) => res.json({
  username: req.admin.username,
  display_name: req.admin.display_name,
  profile_photo_url: req.admin.profile_photo_url,
  has_profile_photo: req.admin.has_profile_photo,
  profile_bio: req.admin.profile_bio,
  social_links: req.admin.social_links
}));

router.put('/me/profile', async (req, res) => {
  const body = req.body || {};
  let profile;
  try { profile = parseProfile(body); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  const displayName = body.display_name == null ? '' : String(body.display_name).trim();
  if (displayName.length > 80)
    return res.status(400).json({ error: 'Display name must be 80 characters or fewer' });
  const { rows } = await pool.query(
    `UPDATE admins
     SET display_name = $1, profile_bio = $2, social_links = $3::jsonb
     WHERE id = $4
     RETURNING display_name, profile_photo_url, (profile_photo_data IS NOT NULL) AS has_profile_photo,
               profile_bio, social_links`,
    [displayName || null, profile.profile_bio, JSON.stringify(profile.social_links), req.admin.id]);
  res.json(rows[0]);
});

router.put('/me/avatar', uploadAvatarBody, validateAvatar, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE admins SET profile_photo_url = NULL, profile_photo_data = $1, profile_photo_mime = $2
     WHERE id = $3 RETURNING id`,
    [req.body, req.avatarMime, req.admin.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Please log in again' });
  res.json({ ok: true });
});

router.get('/me/avatar', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT profile_photo_data, profile_photo_mime FROM admins WHERE id = $1',
    [req.admin.id]);
  return sendAvatar(res, rows[0]);
});

router.delete('/me/avatar', async (req, res) => {
  await pool.query(
    'UPDATE admins SET profile_photo_url = NULL, profile_photo_data = NULL, profile_photo_mime = NULL WHERE id = $1',
    [req.admin.id]);
  res.json({ ok: true });
});

// Change my own password
router.post('/me/password', async (req, res) => {
  const { current, next } = req.body;
  if (!next || next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const row = (await pool.query('SELECT password_hash FROM admins WHERE id=$1', [req.admin.id])).rows[0];
  if (!(await bcrypt.compare(current || '', row.password_hash)))
    return res.status(400).json({ error: 'Current password is incorrect' });
  await pool.query('UPDATE admins SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(next, 12), req.admin.id]);
  res.json({ ok: true });
});

// Live results for admins (ignores the "hide until closed" setting)
router.get('/live/:electionId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id AS position_id, p.title AS position, c.id AS candidate_id,
            c.name, pa.name AS party_name, COUNT(v.id)::int AS votes
     FROM positions p
     JOIN candidates c ON c.position_id = p.id
     LEFT JOIN parties pa ON pa.id = c.party_id AND pa.election_id = p.election_id
     LEFT JOIN votes v ON v.candidate_id = c.id AND v.election_id = p.election_id
     WHERE p.election_id = $1
     GROUP BY p.id, c.id, pa.name ORDER BY p.sort_order, p.id, c.id`, [req.params.electionId]);
  const turnout = (await pool.query(
    `SELECT COUNT(*) FILTER (WHERE has_voted)::int AS voted, COUNT(*)::int AS total
     FROM voters WHERE election_id=$1`, [req.params.electionId])).rows[0];
  res.json({ rows, turnout, partyTotals: await getPartyTotals(req.params.electionId) });
});

// ----- Main Admin only -----
router.get('/', requireMain, async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, is_main, created_at FROM admins ORDER BY id');
  res.json(rows);
});

router.post('/', requireMain, async (req, res) => {
  const { username, password } = req.body;
  if (!validUsername(username)) return res.status(400).json({ error: 'Username: 3-32 letters, numbers, . _ -' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO admins (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, await bcrypt.hash(password, 12)]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'That username is already taken' });
    throw err;
  }
});

router.delete('/:id', requireMain, async (req, res) => {
  const target = (await pool.query('SELECT id, is_main FROM admins WHERE id=$1', [req.params.id])).rows[0];
  if (!target) return res.status(404).json({ error: 'Admin not found' });
  if (target.is_main) return res.status(400).json({ error: 'The Main Admin cannot be deleted' });
  await pool.query('DELETE FROM admins WHERE id=$1', [target.id]);
  res.json({ ok: true });
});

module.exports = router;