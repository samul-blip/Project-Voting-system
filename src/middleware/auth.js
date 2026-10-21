const pool = require('../db');

exports.requireVoter = (req, res, next) =>
  req.session.voterId ? next() : res.status(401).json({ error: 'Please log in' });

exports.requireCandidate = async (req, res, next) => {
  try {
    if (!req.session.candidateId) return res.status(401).json({ error: 'Candidates only' });
    const { rows } = await pool.query(
      `SELECT c.id, c.position_id, c.name, c.grade_section, p.election_id, e.title AS election_title
       FROM candidates c
       JOIN positions p ON p.id = c.position_id
       JOIN elections e ON e.id = p.election_id
       WHERE c.id = $1 AND c.account_password_hash IS NOT NULL`,
      [req.session.candidateId]);
    if (!rows[0]) return req.session.destroy(() => res.status(401).json({ error: 'Candidates only' }));
    req.candidate = rows[0];
    req.session.electionId = rows[0].election_id;
    next();
  } catch (err) { next(err); }
};

// Checks the database every time, so a deleted admin is locked out immediately
exports.requireAdmin = async (req, res, next) => {
  try {
    if (!req.session.adminId) return res.status(401).json({ error: 'Admins only' });
    const { rows } = await pool.query(
      `SELECT id, username, display_name, is_main, profile_photo_url, (profile_photo_data IS NOT NULL) AS has_profile_photo,
              profile_bio, social_links
       FROM admins WHERE id=$1`,
      [req.session.adminId]);
    if (!rows[0]) return req.session.destroy(() => res.status(401).json({ error: 'Admins only' }));
    req.admin = rows[0];
    next();
  } catch (err) { next(err); }
};

exports.requireMain = (req, res, next) =>
  req.admin && req.admin.is_main ? next() : res.status(403).json({ error: 'Only the Main Admin can do this' });