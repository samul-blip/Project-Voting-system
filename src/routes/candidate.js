const router = require('express').Router();
const pool = require('../db');
const { requireCandidate } = require('../middleware/auth');
const { parseProfile } = require('../profile');
const { uploadAvatarBody, validateAvatar, sendAvatar } = require('../avatar');

router.use(requireCandidate);

router.get('/me', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.grade_section, c.bio, c.photo_url, c.profile_photo_url,
            (c.profile_photo_data IS NOT NULL) AS has_profile_photo,
            c.profile_bio, c.social_links, p.title AS position, e.id AS election_id,
            e.title AS election_title,
            (SELECT COUNT(*)::int
             FROM votes v
             WHERE v.candidate_id = c.id AND v.election_id = e.id) AS votes
     FROM candidates c
     JOIN positions p ON p.id = c.position_id
     JOIN elections e ON e.id = p.election_id
     WHERE c.id = $1`,
    [req.candidate.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Please log in again' });
  res.json(rows[0]);
});

router.put('/me/profile', async (req, res) => {
  let profile;
  try { profile = parseProfile(req.body); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  const { rows } = await pool.query(
    `UPDATE candidates
     SET profile_bio = $1, social_links = $2::jsonb
     WHERE id = $3
     RETURNING profile_photo_url, profile_bio, social_links`,
    [profile.profile_bio, JSON.stringify(profile.social_links), req.candidate.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Please log in again' });
  res.json(rows[0]);
});

router.put('/me/avatar', uploadAvatarBody, validateAvatar, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE candidates SET profile_photo_url = NULL, profile_photo_data = $1, profile_photo_mime = $2
     WHERE id = $3 RETURNING id`,
    [req.body, req.avatarMime, req.candidate.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Please log in again' });
  res.json({ ok: true });
});

router.get('/me/avatar', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT profile_photo_data, profile_photo_mime FROM candidates WHERE id = $1',
    [req.candidate.id]);
  return sendAvatar(res, rows[0]);
});

router.delete('/me/avatar', async (req, res) => {
  await pool.query(
    'UPDATE candidates SET profile_photo_url = NULL, profile_photo_data = NULL, profile_photo_mime = NULL WHERE id = $1',
    [req.candidate.id]);
  res.json({ ok: true });
});

module.exports = router;
