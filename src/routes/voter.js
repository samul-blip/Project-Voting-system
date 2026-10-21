const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool = require('../db');
const { requireVoter } = require('../middleware/auth');
const { decrypt, encrypt } = require('../crypto');
const { uploadAvatarBody, validateAvatar, sendAvatar } = require('../avatar');

router.get('/me', requireVoter, async (req, res) => {
  const v = (await pool.query(
    `SELECT v.student_id, v.full_name, v.grade_section, v.has_voted, v.profile_photo_url,
            (v.profile_photo_data IS NOT NULL) AS has_profile_photo,
            v.profile_bio, v.social_links, e.title, e.status
     FROM voters v JOIN elections e ON e.id = v.election_id WHERE v.id=$1`,
    [req.session.voterId])).rows[0];
  if (!v) return res.status(401).json({ error: 'Please log in' });
  res.json({
    studentId: v.student_id, fullName: v.full_name, gradeSection: v.grade_section, hasVoted: v.has_voted,
    electionTitle: v.title, electionStatus: v.status,
    profile_photo_url: v.profile_photo_url, has_profile_photo: v.has_profile_photo,
    profile_bio: v.profile_bio, social_links: v.social_links
  });
});

router.put('/me/profile', requireVoter, async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return res.status(400).json({ error: 'Provide valid profile details' });
  const profileBio = body.profile_bio == null ? '' : String(body.profile_bio).trim();
  if (profileBio.length > 500) return res.status(400).json({ error: 'Bio must be 500 characters or fewer' });
  const { rows } = await pool.query(
    `UPDATE voters
     SET profile_bio = $1, social_links = '[]'::jsonb
     WHERE id = $2
     RETURNING profile_photo_url, profile_bio, social_links`,
    [profileBio || null, req.session.voterId]);
  if (!rows[0]) return res.status(401).json({ error: 'Please log in again' });
  res.json(rows[0]);
});

router.post('/me/code', requireVoter, async (req, res) => {
  const { current, next } = req.body || {};
  if (typeof current !== 'string' || typeof next !== 'string')
    return res.status(400).json({ error: 'Enter your current and new voter codes' });
  if (next.length < 8 || next.length > 128)
    return res.status(400).json({ error: 'New voter code must be 8 to 128 characters' });
  const voter = (await pool.query(
    'SELECT code_hash FROM voters WHERE id=$1', [req.session.voterId])).rows[0];
  if (!voter) return res.status(401).json({ error: 'Please log in again' });
  if (!(await bcrypt.compare(current, voter.code_hash)))
    return res.status(400).json({ error: 'Current voter code is incorrect' });
  await pool.query(
    'UPDATE voters SET code_hash=$1, code_enc=$2 WHERE id=$3',
    [await bcrypt.hash(next, 10), encrypt(next), req.session.voterId]);
  res.json({ ok: true });
});

router.put('/me/avatar', requireVoter, uploadAvatarBody, validateAvatar, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE voters SET profile_photo_url = NULL, profile_photo_data = $1, profile_photo_mime = $2
     WHERE id = $3 RETURNING id`,
    [req.body, req.avatarMime, req.session.voterId]);
  if (!rows[0]) return res.status(401).json({ error: 'Please log in again' });
  res.json({ ok: true });
});

router.get('/me/avatar', requireVoter, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT profile_photo_data, profile_photo_mime FROM voters WHERE id = $1',
    [req.session.voterId]);
  return sendAvatar(res, rows[0]);
});

router.delete('/me/avatar', requireVoter, async (req, res) => {
  await pool.query(
    'UPDATE voters SET profile_photo_url = NULL, profile_photo_data = NULL, profile_photo_mime = NULL WHERE id = $1',
    [req.session.voterId]);
  res.json({ ok: true });
});

// The logged-in voter's own record (only ever their own: it uses the session)
router.get('/receipt', requireVoter, async (req, res) => {
  const row = (await pool.query(
    'SELECT receipt_enc FROM voter_receipts WHERE voter_id=$1', [req.session.voterId])).rows[0];
  if (!row) return res.status(404).json({ error: 'No record' });
  try { res.json(JSON.parse(decrypt(row.receipt_enc))); }
  catch { res.status(500).json({ error: 'Record could not be read' }); }
});

module.exports = router;