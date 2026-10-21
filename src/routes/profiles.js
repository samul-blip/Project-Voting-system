const router = require('express').Router();
const pool = require('../db');
const { requireVoter, requireCandidate } = require('../middleware/auth');
const { sendAvatar } = require('../avatar');

async function requireParticipant(req, res, next) {
  if (req.session.voterId) return requireVoter(req, res, next);
  if (req.session.candidateId) return requireCandidate(req, res, next);
  return res.status(401).json({ error: 'Please log in to view election profiles' });
}

router.get('/', requireParticipant, async (req, res) => {
  const electionId = req.session.voterId
    ? (await pool.query('SELECT election_id FROM voters WHERE id=$1', [req.session.voterId])).rows[0]?.election_id
    : req.candidate.election_id;
  if (!electionId) return res.status(401).json({ error: 'Election account not found' });

  const { rows } = await pool.query(
    `SELECT 'candidate' AS type, c.id, c.name, c.grade_section, p.title AS position,
            COALESCE(c.profile_photo_url,
              CASE WHEN c.profile_photo_data IS NOT NULL THEN
                '/api/profiles/avatar/candidate/' || c.id::text
              END) AS profile_photo_url,
            c.profile_bio, c.social_links
     FROM candidates c
     JOIN positions p ON p.id = c.position_id
     WHERE p.election_id = $1
     UNION ALL
     SELECT 'voter' AS type, v.id, COALESCE(v.full_name, 'Voter') AS name,
            v.grade_section, NULL::text AS position,
            COALESCE(v.profile_photo_url,
              CASE WHEN v.profile_photo_data IS NOT NULL THEN
                '/api/profiles/avatar/voter/' || v.id::text
              END) AS profile_photo_url,
            v.profile_bio, '[]'::jsonb AS social_links
     FROM voters v
     WHERE v.election_id = $1
     UNION ALL
     SELECT 'admin' AS type, a.id,
            COALESCE(NULLIF(a.display_name, ''), a.username) AS name,
            NULL::text AS grade_section, 'Administrator'::text AS position,
            COALESCE(a.profile_photo_url,
              CASE WHEN a.profile_photo_data IS NOT NULL THEN
                '/api/profiles/avatar/admin/' || a.id::text
              END) AS profile_photo_url,
            a.profile_bio, a.social_links
     FROM admins a
     ORDER BY type, name`,
    [electionId]);
  res.json(rows);
});

router.get('/avatar/:type/:id', requireParticipant, async (req, res) => {
  if (!['admin', 'candidate', 'voter'].includes(req.params.type))
    return res.status(400).json({ error: 'Invalid profile type' });
  if (req.params.type === 'admin') {
    const { rows } = await pool.query(
      'SELECT profile_photo_data, profile_photo_mime FROM admins WHERE id = $1',
      [req.params.id]);
    return sendAvatar(res, rows[0]);
  }
  const electionId = req.session.voterId
    ? (await pool.query('SELECT election_id FROM voters WHERE id=$1', [req.session.voterId])).rows[0]?.election_id
    : req.candidate.election_id;
  if (!electionId) return res.status(401).json({ error: 'Election account not found' });

  const query = req.params.type === 'candidate'
    ? `SELECT c.profile_photo_data, c.profile_photo_mime
       FROM candidates c JOIN positions p ON p.id = c.position_id
       WHERE c.id = $1 AND p.election_id = $2`
    : `SELECT profile_photo_data, profile_photo_mime FROM voters
       WHERE id = $1 AND election_id = $2`;
  const { rows } = await pool.query(query, [req.params.id, electionId]);
  return sendAvatar(res, rows[0]);
});

module.exports = router;
