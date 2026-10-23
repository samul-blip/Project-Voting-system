const router = require('express').Router();
const pool = require('../db');
const { sendImage } = require('../avatar');

async function getElection(req, res) {
  try {
    const id = req.params.id || req.session.electionId ||
      (await pool.query(
        `SELECT id FROM elections WHERE status IN ('open','closed')
         ORDER BY (status='open') DESC, id DESC LIMIT 1`)).rows[0]?.id;
    if (!id) return res.status(404).json({ error: 'No active election' });

    const election = (await pool.query(
      `SELECT id,title,description,
              CASE WHEN logo_data IS NOT NULL
                THEN jsonb_set(COALESCE(theme, '{}'::jsonb), '{logo}', to_jsonb('/api/election/' || id::text || '/logo'), TRUE)
                ELSE theme END AS theme,
              status,show_live_results FROM elections WHERE id=$1`, [id])).rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });

    const positions = (await pool.query(
      'SELECT * FROM positions WHERE election_id=$1 ORDER BY sort_order,id', [id])).rows;
    const candidates = (await pool.query(
      `SELECT c.id, c.position_id, c.name, c.grade_section, c.bio,
              COALESCE(CASE WHEN c.photo_data IS NOT NULL
                THEN '/api/election/' || p.election_id::text || '/candidate/' || c.id::text || '/photo'
              END, c.photo_url) AS photo_url,
              pa.id AS party_id, pa.name AS party_name,
              COALESCE(CASE WHEN pa.logo_data IS NOT NULL
                THEN '/api/election/' || p.election_id::text || '/party/' || pa.id::text || '/logo'
              END, pa.logo_url) AS party_logo_url,
              pa.color AS party_color, pa.platform AS party_platform, pa.slogan AS party_slogan
       FROM candidates c JOIN positions p ON p.id=c.position_id
       LEFT JOIN parties pa ON pa.id = c.party_id AND pa.election_id = p.election_id
       WHERE p.election_id=$1 ORDER BY c.id`, [id])).rows;

    res.json({
      ...election,
      positions: positions.map(p => ({ ...p, candidates: candidates.filter(c => c.position_id === p.id) }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

router.get('/', getElection);
router.get('/:id/logo', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT logo_data, logo_mime FROM elections WHERE id=$1',
    [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Election not found' });
  return sendImage(res, rows[0], 'logo_data', 'logo_mime');
});
router.get('/:id/candidate/:candidateId/photo', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.photo_data, c.photo_mime FROM candidates c
     JOIN positions p ON p.id=c.position_id
     WHERE c.id=$1 AND p.election_id=$2`,
    [req.params.candidateId, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Candidate image not found' });
  return sendImage(res, rows[0], 'photo_data', 'photo_mime');
});
router.get('/:id/party/:partyId/logo', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT logo_data, logo_mime FROM parties WHERE id=$1 AND election_id=$2',
    [req.params.partyId, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Party logo not found' });
  return sendImage(res, rows[0], 'logo_data', 'logo_mime');
});
router.get('/:id', getElection);

module.exports = router;