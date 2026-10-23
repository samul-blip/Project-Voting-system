const pool = require('./db');

async function getPartyTotals(electionId) {
  const { rows } = await pool.query(
    `SELECT p.id AS party_id, p.name, p.color,
            pos.id AS position_id, pos.title AS position,
            COUNT(v.id)::int AS votes
     FROM parties p
     LEFT JOIN positions pos ON pos.election_id = p.election_id
     LEFT JOIN votes v ON v.position_id = pos.id
       AND v.party_id = p.id AND v.election_id = p.election_id
     WHERE p.election_id = $1
     GROUP BY p.id, pos.id
     ORDER BY p.name, pos.sort_order, pos.id`,
    [electionId]);

  const totals = new Map();
  rows.forEach(row => {
    if (!totals.has(row.party_id)) {
      totals.set(row.party_id, {
        party_id: row.party_id,
        name: row.name,
        color: row.color,
        total_votes: 0,
        positions: []
      });
    }
    if (row.position_id !== null) {
      const party = totals.get(row.party_id);
      party.total_votes += row.votes;
      party.positions.push({
        position_id: row.position_id,
        position: row.position,
        votes: row.votes
      });
    }
  });
  return [...totals.values()];
}

module.exports = { getPartyTotals };
