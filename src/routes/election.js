const router = require('express').Router();
const pool = require('../db');

async function getElection(req, res) {
  try {
    const id = req.params.id || req.session.electionId ||
      (await pool.query(
        `SELECT id FROM elections WHERE status IN ('open','closed')
         ORDER BY (status='open') DESC, id DESC LIMIT 1`)).rows[0]?.id;
    if (!id) return res.status(404).json({ error: 'No active election' });

    const election = (await pool.query(
      'SELECT id,title,description,theme,status,show_live_results FROM elections WHERE id=$1', [id])).rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });

    const positions = (await pool.query(
      'SELECT * FROM positions WHERE election_id=$1 ORDER BY sort_order,id', [id])).rows;
    const candidates = (await pool.query(
      `SELECT c.id, c.position_id, c.name, c.grade_section, c.bio, c.photo_url
       FROM candidates c JOIN positions p ON p.id=c.position_id
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
router.get('/:id', getElection);

module.exports = router;