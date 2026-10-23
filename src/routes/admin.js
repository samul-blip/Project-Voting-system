const router = require('express').Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { encrypt, decrypt } = require('../crypto');
const { parseProfile, validAccountUsername } = require('../profile');
const { uploadAvatarBody, validateAvatar, sendAvatar, sendImage } = require('../avatar');
const { getPartyTotals } = require('../party-results');

router.use(requireAdmin); // every route below is admin-only

// ---------- Elections ----------

// List all elections
router.get('/elections', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, title, status, show_live_results, theme, logo_data IS NOT NULL AS has_logo FROM elections ORDER BY id DESC');
  res.json(rows.map(election => ({
    ...election,
    theme: { ...election.theme, logo: election.has_logo ? `/api/election/${election.id}/logo` : election.theme?.logo || '' }
  })));
});

router.put('/elections/:id/logo', uploadAvatarBody, validateAvatar, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE elections
     SET logo_data=$1, logo_mime=$2,
         theme=jsonb_set(COALESCE(theme, '{}'::jsonb), '{logo}', '""'::jsonb, TRUE)
     WHERE id=$3 RETURNING id`,
    [req.body, req.avatarMime, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Election not found' });
  res.json({ ok: true, url: `/api/election/${rows[0].id}/logo` });
});

router.delete('/elections/:id/logo', async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE elections
     SET logo_data=NULL, logo_mime=NULL,
         theme=jsonb_set(COALESCE(theme, '{}'::jsonb), '{logo}', '""'::jsonb, TRUE)
     WHERE id=$1 RETURNING id`,
    [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Election not found' });
  res.json({ ok: true });
});

function parseElectionTheme(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value))
    throw new Error('Election theme must be an object');
  if (typeof value.logo === 'string' && value.logo.trim())
    throw new Error('Upload election logos from your device instead of entering a URL');
  return JSON.stringify({ ...value, logo: '' });
}

// Create an election
router.post('/elections', async (req, res) => {
  const { title, description, theme, show_live_results } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  let themeJson;
  try { themeJson = parseElectionTheme(theme); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  const { rows } = await pool.query(
    `INSERT INTO elections (title, description, theme, show_live_results)
     VALUES ($1, $2, COALESCE($3::jsonb, '{"primary":"#1e66f5","accent":"#f5a623","logo":""}'::jsonb), COALESCE($4, TRUE))
     RETURNING *`,
    [title, description || null, themeJson, show_live_results]);
  res.status(201).json(rows[0]);
});

// Edit an election or change its status (draft -> open -> closed)
router.patch('/elections/:id', async (req, res) => {
  const { title, description, theme, status, show_live_results } = req.body;
  if (status && !['draft', 'open', 'closed'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  let themeJson;
  try { themeJson = parseElectionTheme(theme); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  const { rows } = await pool.query(
    `UPDATE elections SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       theme = COALESCE($3::jsonb, theme),
       status = COALESCE($4, status),
       show_live_results = COALESCE($5, show_live_results)
     WHERE id = $6 RETURNING *`,
    [title, description, themeJson, status, show_live_results, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Election not found' });
  if (rows[0].status === 'closed')   // stored codes are no longer needed
    await pool.query('UPDATE voters SET code_enc = NULL WHERE election_id = $1', [req.params.id]);
  res.json(rows[0]);
});

function parseParty(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('Provide valid party details');
  const text = (value, label) => {
    if (value == null) return '';
    if (typeof value !== 'string') throw new Error(`${label} must be text`);
    return value.trim();
  };
  const name = text(body.name, 'Party name');
  const platform = text(body.platform, 'Party platform');
  const slogan = text(body.slogan, 'Party slogan');
  const color = body.color == null ? '#1e66f5' : text(body.color, 'Party color');
  if (text(body.logo_url, 'Party logo URL'))
    throw new Error('Upload party logos from your device instead of entering a URL');
  if (!name || name.length > 80) throw new Error('Party name is required and must be 80 characters or fewer');
  if (platform.length > 2000) throw new Error('Party platform must be 2000 characters or fewer');
  if (slogan.length > 160) throw new Error('Party slogan must be 160 characters or fewer');
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Party color must be a 6-digit hex color');
  return { name, platform: platform || null, slogan: slogan || null, color };
}

router.get('/elections/:id/parties', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.election_id, p.name,
            COALESCE(CASE WHEN p.logo_data IS NOT NULL THEN '/api/election/' || p.election_id::text || '/party/' || p.id::text || '/logo' END, p.logo_url) AS logo_url,
            p.color, p.platform, p.slogan,
            COUNT(c.id)::int AS candidate_count
     FROM parties p LEFT JOIN candidates c ON c.party_id = p.id
     WHERE p.election_id = $1
     GROUP BY p.id ORDER BY p.name`,
    [req.params.id]);
  res.json(rows);
});

router.post('/elections/:id/parties', async (req, res) => {
  let party;
  try { party = parseParty(req.body); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  try {
    const { rows } = await pool.query(
      `INSERT INTO parties (election_id, name, color, platform, slogan)
       SELECT id, $2, $3, $4, $5 FROM elections WHERE id = $1
       RETURNING id, election_id, name, logo_url, color, platform, slogan`,
      [req.params.id, party.name, party.color, party.platform, party.slogan]);
    if (!rows[0]) return res.status(404).json({ error: 'Election not found' });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A party with that name already exists in this election' });
    throw err;
  }
});

router.put('/parties/:id', async (req, res) => {
  let party;
  try { party = parseParty(req.body); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  try {
    const { rows } = await pool.query(
      `UPDATE parties SET name=$1, color=$2, platform=$3, slogan=$4
       WHERE id=$5
       RETURNING id, election_id, name, logo_url, color, platform, slogan`,
      [party.name, party.color, party.platform, party.slogan, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Party not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A party with that name already exists in this election' });
    throw err;
  }
});

router.delete('/parties/:id', async (req, res) => {
  const hasVotes = await pool.query('SELECT 1 FROM votes WHERE party_id=$1 LIMIT 1', [req.params.id]);
  if (hasVotes.rowCount)
    return res.status(400).json({ error: 'This party has recorded votes and cannot be deleted' });
  const result = await pool.query('DELETE FROM parties WHERE id=$1', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Party not found' });
  res.json({ ok: true });
});

router.put('/parties/:id/logo', uploadAvatarBody, validateAvatar, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE parties SET logo_url=NULL, logo_data=$1, logo_mime=$2
     WHERE id=$3 RETURNING id, election_id`,
    [req.body, req.avatarMime, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Party not found' });
  res.json({ ok: true, url: `/api/election/${rows[0].election_id}/party/${rows[0].id}/logo` });
});

router.delete('/parties/:id/logo', async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE parties SET logo_url=NULL, logo_data=NULL, logo_mime=NULL
     WHERE id=$1 RETURNING id`,
    [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Party not found' });
  res.json({ ok: true });
});

// ---------- Positions ----------

// Add a position
router.post('/elections/:id/positions', async (req, res) => {
  const { title, sort_order } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const { rows } = await pool.query(
    'INSERT INTO positions (election_id, title, sort_order) VALUES ($1, $2, $3) RETURNING *',
    [req.params.id, title, sort_order || 0]);
  res.status(201).json(rows[0]);
});

// Remove a position (and its candidates), only while no votes exist
router.delete('/positions/:id', async (req, res) => {
  const p = (await pool.query('SELECT election_id FROM positions WHERE id=$1', [req.params.id])).rows[0];
  if (!p) return res.status(404).json({ error: 'Position not found' });
  const hasVotes = await pool.query('SELECT 1 FROM votes WHERE election_id=$1 LIMIT 1', [p.election_id]);
  if (hasVotes.rowCount)
    return res.status(400).json({ error: 'Votes have already been cast in this election, so this can no longer be removed' });
  await pool.query('DELETE FROM positions WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---------- Candidates ----------

// Add a candidate
router.post('/positions/:id/candidates', async (req, res) => {
  const { name, grade_section, bio, account_username, account_password, party_id } = req.body || {};
  if (req.body?.photo_url)
    return res.status(400).json({ error: 'Upload candidate photos from your device instead of entering a URL' });
  let partyId;
  try { partyId = parsePartyId(party_id); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (partyId !== null && (!Number.isInteger(partyId) || partyId < 1))
    return res.status(400).json({ error: 'Choose a valid party or Independent' });
  if (account_username != null && typeof account_username !== 'string')
    return res.status(400).json({ error: 'Candidate username must be text' });
  if (account_password != null && typeof account_password !== 'string')
    return res.status(400).json({ error: 'Candidate password must be text' });
  if (Boolean(account_username) !== Boolean(account_password))
    return res.status(400).json({ error: 'Provide both candidate account username and password' });
  if (account_username && !validAccountUsername(account_username))
    return res.status(400).json({ error: 'Candidate username: 3-32 letters, numbers, . _ -' });
  if (account_password && account_password.length < 8)
    return res.status(400).json({ error: 'Candidate password must be at least 8 characters' });
  if (partyId != null) {
    const { rows } = await pool.query(
      `SELECT pa.id FROM positions pos
       JOIN parties pa ON pa.id = $1 AND pa.election_id = pos.election_id
       WHERE pos.id = $2`,
      [partyId, req.params.id]);
    if (!rows[0]) return res.status(400).json({ error: "Select a party from the candidate's election" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO candidates (position_id, name, grade_section, bio, account_username, account_password_hash, party_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, position_id, name, grade_section, bio, photo_url, party_id`,
      [req.params.id, name, grade_section || null, bio || null,
        account_username || null, account_password ? await bcrypt.hash(account_password, 12) : null, partyId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'That candidate username is already taken' });
    throw err;
  }
});

router.put('/candidates/:id/photo', uploadAvatarBody, validateAvatar, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE candidates c SET photo_url=NULL, photo_data=$1, photo_mime=$2
     FROM positions p
     WHERE c.id=$3 AND p.id=c.position_id
     RETURNING c.id, p.election_id`,
    [req.body, req.avatarMime, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Candidate not found' });
  res.json({ ok: true, url: `/api/election/${rows[0].election_id}/candidate/${rows[0].id}/photo` });
});

router.delete('/candidates/:id/photo', async (req, res) => {
  const result = await pool.query(
    'UPDATE candidates SET photo_url=NULL, photo_data=NULL, photo_mime=NULL WHERE id=$1',
    [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Candidate not found' });
  res.json({ ok: true });
});

router.put('/candidates/:id/party', async (req, res) => {
  let partyId;
  try { partyId = parsePartyId(req.body?.party_id); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  const candidate = (await pool.query(
    `SELECT c.id, p.election_id FROM candidates c
     JOIN positions p ON p.id = c.position_id WHERE c.id=$1`,
    [req.params.id])).rows[0];
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  if (partyId !== null) {
    const belongsToElection = await pool.query(
      'SELECT 1 FROM parties WHERE id=$1 AND election_id=$2',
      [partyId, candidate.election_id]);
    if (!belongsToElection.rowCount)
      return res.status(400).json({ error: "Select a party from the candidate's election" });
  }
  const { rows } = await pool.query(
    'UPDATE candidates SET party_id=$1 WHERE id=$2 RETURNING party_id',
    [partyId, candidate.id]);
  res.json({ ok: true, party_id: rows[0].party_id });
});

function parsePartyId(value) {
  if (value == null || value === '') return null;
  if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value)))
    throw new Error('Choose a valid party or Independent');
  const partyId = Number(value);
  if (!Number.isSafeInteger(partyId) || partyId < 1)
    throw new Error('Choose a valid party or Independent');
  return partyId;
}

router.put('/candidates/:id/account', async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || !validAccountUsername(username))
    return res.status(400).json({ error: 'Candidate username: 3-32 letters, numbers, . _ -' });
  if (typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ error: 'Candidate password must be at least 8 characters' });
  try {
    const result = await pool.query(
      `UPDATE candidates SET account_username = $1, account_password_hash = $2
       WHERE id = $3`,
      [username, await bcrypt.hash(password, 12), req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Candidate not found' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'That candidate username is already taken' });
    throw err;
  }
});

router.get('/profiles/:electionId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT 'candidate' AS type, c.id, c.name,
            COALESCE(c.profile_photo_url,
              CASE WHEN c.profile_photo_data IS NOT NULL THEN
                '/api/admin/profiles/candidate/' || c.id::text || '/avatar'
              END) AS profile_photo_url,
            c.profile_bio, c.social_links
     FROM candidates c JOIN positions p ON p.id = c.position_id
     WHERE p.election_id = $1
     UNION ALL
     SELECT 'voter' AS type, v.id, COALESCE(v.full_name, 'Voter') AS name,
            COALESCE(v.profile_photo_url,
              CASE WHEN v.profile_photo_data IS NOT NULL THEN
                '/api/admin/profiles/voter/' || v.id::text || '/avatar'
              END) AS profile_photo_url,
            v.profile_bio, v.social_links
     FROM voters v WHERE v.election_id = $1
     ORDER BY type, name`,
    [req.params.electionId]);
  res.json(rows);
});

router.put('/profiles/:type/:id', async (req, res) => {
  if (!['candidate', 'voter'].includes(req.params.type))
    return res.status(400).json({ error: 'Invalid profile type' });
  let profile;
  try { profile = parseProfile(req.body); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  const table = req.params.type === 'candidate' ? 'candidates' : 'voters';
  const result = await pool.query(
    `UPDATE ${table}
     SET profile_bio = $1, social_links = $2::jsonb
     WHERE id = $3`,
    [profile.profile_bio, JSON.stringify(profile.social_links), req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Profile not found' });
  res.json({ ok: true });
});

router.put('/profiles/:type/:id/avatar', uploadAvatarBody, validateAvatar, async (req, res) => {
  if (!['candidate', 'voter'].includes(req.params.type))
    return res.status(400).json({ error: 'Invalid profile type' });
  const table = req.params.type === 'candidate' ? 'candidates' : 'voters';
  const result = await pool.query(
    `UPDATE ${table}
     SET profile_photo_url = NULL, profile_photo_data = $1, profile_photo_mime = $2
     WHERE id = $3`,
    [req.body, req.avatarMime, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Profile not found' });
  res.json({ ok: true });
});

router.get('/profiles/:type/:id/avatar', async (req, res) => {
  if (!['candidate', 'voter'].includes(req.params.type))
    return res.status(400).json({ error: 'Invalid profile type' });
  const table = req.params.type === 'candidate' ? 'candidates' : 'voters';
  const { rows } = await pool.query(
    `SELECT profile_photo_data, profile_photo_mime FROM ${table} WHERE id = $1`,
    [req.params.id]);
  return sendAvatar(res, rows[0]);
});

router.delete('/profiles/:type/:id/avatar', async (req, res) => {
  if (!['candidate', 'voter'].includes(req.params.type))
    return res.status(400).json({ error: 'Invalid profile type' });
  const table = req.params.type === 'candidate' ? 'candidates' : 'voters';
  const result = await pool.query(
    `UPDATE ${table}
     SET profile_photo_url = NULL, profile_photo_data = NULL, profile_photo_mime = NULL
     WHERE id = $1`,
    [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Profile not found' });
  res.json({ ok: true });
});

// Remove a candidate, only while no votes exist
router.delete('/candidates/:id', async (req, res) => {
  const c = (await pool.query(
    `SELECT p.election_id FROM candidates c JOIN positions p ON p.id = c.position_id WHERE c.id=$1`,
    [req.params.id])).rows[0];
  if (!c) return res.status(404).json({ error: 'Candidate not found' });
  const hasVotes = await pool.query('SELECT 1 FROM votes WHERE election_id=$1 LIMIT 1', [c.election_id]);
  if (hasVotes.rowCount)
    return res.status(400).json({ error: 'Votes have already been cast in this election, so this can no longer be removed' });
  await pool.query('DELETE FROM candidates WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---------- Voters ----------

// Bulk add students and generate codes
router.post('/elections/:id/voters', async (req, res) => {
  const students = req.body.students; // [{ studentId, fullName, gradeSection }, ...]
  if (!Array.isArray(students) || !students.length)
    return res.status(400).json({ error: 'Provide a list of students' });

  const issued = [];
  for (const s of students) {
    if (!s.studentId) continue;
    const code = crypto.randomBytes(4).toString('hex');
    const result = await pool.query(
      `INSERT INTO voters (election_id, student_id, full_name, grade_section, code_hash, code_enc)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (election_id, student_id) DO NOTHING`,
      [req.params.id, s.studentId, s.fullName || null, s.gradeSection || null, await bcrypt.hash(code, 10), encrypt(code)]);
    if (result.rowCount) issued.push({ studentId: s.studentId, fullName: s.fullName, gradeSection: s.gradeSection, code });
  }
  res.json(issued);
});

// Voter list (shows who voted, never what they voted for)
router.get('/elections/:id/voters', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, student_id, full_name, grade_section, has_voted, (code_enc IS NOT NULL) AS has_code
     FROM voters WHERE election_id = $1 ORDER BY student_id`, [req.params.id]);
  res.json(rows);
});

router.put('/voters/:id', async (req, res) => {
  const gradeSection = req.body?.gradeSection == null ? '' : String(req.body.gradeSection).trim();
  if (gradeSection.length > 120)
    return res.status(400).json({ error: 'Section must be 120 characters or fewer' });
  const result = await pool.query(
    'UPDATE voters SET grade_section=$1 WHERE id=$2',
    [gradeSection || null, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Voter not found' });
  res.json({ ok: true });
});

// Show a student's stored code
router.get('/voters/:id/code', async (req, res) => {
  const v = (await pool.query('SELECT code_enc, has_voted FROM voters WHERE id=$1', [req.params.id])).rows[0];
  if (!v) return res.status(404).json({ error: 'Voter not found' });
  if (v.has_voted) return res.status(400).json({ error: 'This student has already voted' });
  if (!v.code_enc) return res.status(404).json({ error: 'No stored code. Use Reset code.' });
  res.json({ code: decrypt(v.code_enc) });
});

// Issue a new code (lost code, or voters created before encryption was added)
router.post('/voters/:id/reset-code', async (req, res) => {
  const code = crypto.randomBytes(4).toString('hex');
  const result = await pool.query(
    `UPDATE voters SET code_hash=$1, code_enc=$2 WHERE id=$3 AND has_voted=FALSE`,
    [await bcrypt.hash(code, 10), encrypt(code), req.params.id]);
  if (!result.rowCount) return res.status(400).json({ error: 'Voter not found or already voted' });
  res.json({ code });
});

// Remove selected voters who haven't voted yet.
router.delete('/elections/:id/voters', async (req, res) => {
  const electionId = Number(req.params.id);
  if (!Number.isSafeInteger(electionId) || electionId < 1)
    return res.status(400).json({ error: 'Invalid election' });

  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ error: 'Select at least one voter to delete' });
  const voterIds = ids.map(id => typeof id === 'number' ? id :
    typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : NaN);
  if (voterIds.some(id => !Number.isSafeInteger(id) || id < 1))
    return res.status(400).json({ error: 'Voter IDs must be positive integers' });
  if (new Set(voterIds).size !== voterIds.length)
    return res.status(400).json({ error: 'A voter may only be selected once' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, has_voted FROM voters
       WHERE election_id=$1 AND id=ANY($2::int[])
       FOR UPDATE`,
      [electionId, voterIds]);
    if (rows.length !== voterIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'One or more selected voters do not belong to this election' });
    }
    if (rows.some(voter => voter.has_voted)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Voters who have already voted cannot be deleted' });
    }

    const result = await client.query(
      'DELETE FROM voters WHERE election_id=$1 AND id=ANY($2::int[]) AND has_voted=FALSE',
      [electionId, voterIds]);
    if (result.rowCount !== voterIds.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Voter records changed; nothing was deleted. Refresh the list and try again.' });
    }
    await client.query('COMMIT');
    res.json({ ok: true, deleted: result.rowCount });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Remove one voter who hasn't voted yet.
router.delete('/voters/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM voters WHERE id=$1 AND has_voted=FALSE', [req.params.id]);
  if (!result.rowCount) return res.status(400).json({ error: 'Voter not found or already voted' });
  res.json({ ok: true });
});

// Delete an entire election (positions, candidates, voters and votes go with it)
router.delete('/elections/:id', async (req, res) => {
  const e = (await pool.query('SELECT title, status FROM elections WHERE id=$1', [req.params.id])).rows[0];
  if (!e) return res.status(404).json({ error: 'Election not found' });
  if (e.status === 'open')
    return res.status(400).json({ error: 'Close the election (or set it to draft) before deleting it' });
  if ((req.body?.confirmTitle || '').trim() !== e.title.trim())
    return res.status(400).json({ error: 'The title you typed does not match, so nothing was deleted' });
  await pool.query('DELETE FROM elections WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;