const router = require('express').Router();
const pool = require('../db');
const { addClient } = require('../sse');
const { getPartyTotals } = require('../party-results');

async function getResults(electionId) {
  const { rows } = await pool.query(
    `SELECT p.id AS position_id, p.title AS position, c.id AS candidate_id,
            c.name, COUNT(v.id)::int AS votes,
            c.party_id, pa.name AS party_name, pa.color AS party_color
     FROM positions p
     JOIN candidates c ON c.position_id = p.id
     LEFT JOIN parties pa ON pa.id = c.party_id AND pa.election_id = p.election_id
     LEFT JOIN votes v ON v.candidate_id = c.id AND v.election_id = p.election_id
     WHERE p.election_id = $1
     GROUP BY p.id, c.id, pa.name, pa.color ORDER BY p.sort_order, p.id, c.id`, [electionId]);
  const turnout = (await pool.query(
    `SELECT COUNT(*) FILTER (WHERE has_voted)::int AS voted, COUNT(*)::int AS total
     FROM voters WHERE election_id=$1`, [electionId])).rows[0];
  return { rows, turnout, partyTotals: await getPartyTotals(electionId) };
}

router.get('/:id', async (req, res) => {
  const e = (await pool.query('SELECT show_live_results, status FROM elections WHERE id=$1', [req.params.id])).rows[0];
  if (!e) return res.status(404).end();
  if (!e.show_live_results && e.status !== 'closed')
    return res.status(403).json({ error: 'Results hidden until election closes' });
  res.json(await getResults(req.params.id));
});

// Server-Sent Events: pushes a "refresh" signal whenever a vote is cast
router.get('/stream/live', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  addClient(res);
});

module.exports = router;