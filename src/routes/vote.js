const router = require('express').Router();
const pool = require('../db');
const { requireVoter } = require('../middleware/auth');
const { broadcast } = require('../sse');
const { encrypt } = require('../crypto');

router.post('/', requireVoter, async (req, res) => {
  const choices = req.body.choices;
  if (!choices || typeof choices !== 'object')
    return res.status(400).json({ error: 'No choices submitted' });

  const electionId = req.session.electionId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const election = (await client.query('SELECT title, status FROM elections WHERE id=$1', [electionId])).rows[0];
    if (!election || election.status !== 'open') throw new Error('Election is not open');

    const { rows: positions } = await client.query(
      'SELECT id, title FROM positions WHERE election_id=$1 ORDER BY sort_order, id', [electionId]);
    if (positions.some(p => !choices[p.id])) throw new Error('Please vote for every position');

    // Atomic "mark as voted": fails if already voted (prevents double voting)
    const upd = await client.query(
      'UPDATE voters SET has_voted = TRUE WHERE id = $1 AND has_voted = FALSE', [req.session.voterId]);
    if (upd.rowCount === 0) throw new Error('You have already voted');

    const picks = [];
    for (const p of positions) {
      const candidateId = choices[p.id];
      const valid = await client.query(
        `SELECT c.name FROM candidates c JOIN positions p ON p.id = c.position_id
         WHERE c.id=$1 AND p.id=$2 AND p.election_id=$3`,
        [candidateId, p.id, electionId]);
      if (!valid.rowCount) throw new Error('Invalid selection');
      await client.query(
        'INSERT INTO votes (election_id, position_id, candidate_id) VALUES ($1,$2,$3)',
        [electionId, p.id, candidateId]);
      picks.push({ position: p.title, candidate: valid.rows[0].name });
    }

    // Permanent, encrypted record for the voter's own account
    const receipt = JSON.stringify({ election: election.title, castAt: new Date().toISOString(), choices: picks });
    await client.query(
      'INSERT INTO voter_receipts (voter_id, receipt_enc) VALUES ($1, $2)',
      [req.session.voterId, encrypt(receipt)]);

    await client.query('COMMIT');
    broadcast({ type: 'update' });
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;