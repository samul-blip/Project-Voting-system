const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
let currentId = null;
let me = null;
let charts = {};
let liveStarted = false;
let adminAvatarRemove = null;
const managedAvatarRemovers = new WeakMap();

function msg(text, isError) {
  const m = $('msg');
  m.textContent = text;
  m.className = isError ? 'err' : 'ok';
  m.scrollIntoView({ block: 'nearest' });
  setTimeout(() => { m.className = 'hidden'; }, 6000);
}

function show(which) {   // 'login' | 'setup' | 'app'
  ['loginBox', 'setupBox', 'app'].forEach(id => $(id).classList.add('hidden'));
  $(which === 'app' ? 'app' : which + 'Box').classList.remove('hidden');
}

async function call(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { show('login'); throw new Error(data.error || 'Please log in'); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status} ${res.statusText})`);
  return data;
}
const api  = (p, m, b) => call('/api/admin' + p, m, b);
const acct = (p, m, b) => call('/api/admins' + p, m, b);

async function run(fn) {
  try { await fn(); } catch (err) { msg(err.message, true); }
}

// ---------- Setup, login, logout ----------
$('setupBtn').addEventListener('click', () => run(async () => {
  const username = $('su').value.trim(), p1 = $('sp1').value, p2 = $('sp2').value;
  if (p1 !== p2) throw new Error('Passwords do not match');
  await call('/api/auth/setup', 'POST', { username, password: p1 });
  await call('/api/auth/admin-login', 'POST', { username, password: p1 });
  ['su', 'sp1', 'sp2'].forEach(id => $(id).value = '');
  await init();
}));

$('loginBtn').addEventListener('click', () => run(async () => {
  await call('/api/auth/admin-login', 'POST', { username: $('lu').value.trim(), password: $('pw').value });
  $('pw').value = '';
  await init();
}));
$('pw').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn').click(); });

$('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  me = null;
  resetCharts();
  show('login');
});

// ---------- My account and admin accounts ----------
$('changePw').addEventListener('click', () => run(async () => {
  const next = $('npw').value;
  if (next !== $('npw2').value) throw new Error('New passwords do not match');
  await acct('/me/password', 'POST', { current: $('cpw').value, next });
  ['cpw', 'npw', 'npw2'].forEach(id => $(id).value = '');
  msg('Password changed');
}));

function readSocialLinks(value) {
  return value.split(/\r?\n/).filter(Boolean).map(line => {
    const [label, ...url] = line.split('|');
    return { label: label.trim(), url: url.join('|').trim() };
  });
}

function renderAdminProfile(profile) {
  $('adminProfileCardName').textContent = profile.display_name || profile.username || me.username;
  $('adminProfileCardRole').textContent = me.isMain ? 'Main Administrator' : 'Administrator';
  $('adminProfileCardBio').textContent = profile.profile_bio || 'No bio added yet.';
  const links = $('adminProfileCardLinks');
  links.replaceChildren();
  (profile.social_links || []).forEach(link => {
    let url;
    try { url = new URL(link.url); }
    catch { return; }
    if (url.protocol !== 'https:') return;
    const anchor = document.createElement('a');
    anchor.href = url.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = link.label;
    links.append(anchor);
  });
  $('adminProfileCardNoLinks').hidden = links.childElementCount > 0;
  const image = $('adminProfileCardPhoto');
  image.onerror = () => {
    image.onerror = null;
    image.src = DEFAULT_PROFILE_PHOTO;
  };
  image.src = profile.profile_photo_url ||
    (profile.has_profile_photo ? `/api/admins/me/avatar?v=${Date.now()}` : DEFAULT_PROFILE_PHOTO);
}

$('saveAdminProfile').addEventListener('click', () => run(async () => {
  const profile = {
    display_name: $('adminProfileDisplayName').value.trim(),
    profile_bio: $('adminProfileBio').value.trim(),
    social_links: readSocialLinks($('adminProfileLinks').value)
  };
  const saved = await acct('/me/profile', 'PUT', profile);
  renderAdminProfile({ ...profile, ...saved, username: me.username });
  $('adminProfileMessage').textContent = 'Profile saved.';
}));

$('loadElectionProfiles').addEventListener('click', () => run(async () => {
  if (!currentId) throw new Error('Select an election first');
  const profiles = await api('/profiles/' + currentId);
  $('managedProfiles').innerHTML = profiles.length
    ? profiles.map(p => `
      <section class="managed-profile" data-profile="${esc(p.type)}" data-id="${p.id}">
        <span class="pill">${esc(p.type)}</span>
        <h3>${esc(p.name)}</h3>
        <img class="profile-editor-avatar" data-field="avatar-preview" alt="Profile picture preview">
        <label>Upload profile picture (JPEG, PNG, or WebP; max 1 MB)</label>
        <input data-field="avatar" type="file" accept="image/jpeg,image/png,image/webp">
        <button class="secondary" type="button" data-avatar-remove>Use default picture</button>
        <p class="muted" data-field="avatar-message" role="status"></p>
        <label>Bio</label>
        <textarea data-field="bio" rows="2" maxlength="500">${esc(p.profile_bio || '')}</textarea>
        <label>Social links (one per line: name | https://...)</label>
        <textarea data-field="links" rows="2">${esc((p.social_links || []).map(link => `${link.label} | ${link.url}`).join('\n'))}</textarea>
        <button data-profile-save>Save profile</button>
      </section>`).join('')
    : '<p class="muted">No profiles are available for this election.</p>';
  $('managedProfiles').querySelectorAll('.managed-profile').forEach(card => {
    const input = card.querySelector('[data-field="avatar"]');
    const profile = profiles.find(item => item.type === card.dataset.profile && String(item.id) === card.dataset.id);
    managedAvatarRemovers.set(input, bindProfilePhoto({
      input,
      image: card.querySelector('[data-field="avatar-preview"]'),
      uploadUrl: `/api/admin/profiles/${card.dataset.profile}/${card.dataset.id}/avatar`,
      deleteUrl: `/api/admin/profiles/${card.dataset.profile}/${card.dataset.id}/avatar`,
      message: card.querySelector('[data-field="avatar-message"]'),
      initialPhotoUrl: profile.profile_photo_url || DEFAULT_PROFILE_PHOTO
    }));
  });
}));

$('managedProfiles').addEventListener('click', e => run(async () => {
  const button = e.target.closest('button[data-profile-save]');
  if (!button) return;
  const card = button.closest('.managed-profile');
  const links = readSocialLinks(card.querySelector('[data-field="links"]').value);
  await api(`/profiles/${card.dataset.profile}/${card.dataset.id}`, 'PUT', {
    profile_bio: card.querySelector('[data-field="bio"]').value.trim(),
    social_links: links
  });
  msg('Profile saved');
}));

$('managedProfiles').addEventListener('click', e => run(async () => {
  const button = e.target.closest('button[data-avatar-remove]');
  if (!button) return;
  const card = button.closest('.managed-profile');
  const input = card.querySelector('[data-field="avatar"]');
  const removeAvatar = managedAvatarRemovers.get(input);
  await removeAvatar();
}));

async function loadAdmins() {
  if (!me || !me.isMain) return;
  const list = await acct('');
  $('adminTable').innerHTML =
    '<tr><th>Username</th><th>Role</th><th></th></tr>' +
    list.map(a => `<tr>
      <td>${esc(a.username)}</td>
      <td>${a.is_main ? 'Main Admin' : 'Admin'}</td>
      <td>${a.is_main ? '' : `<button class="small danger" data-admin-del="${a.id}">Delete</button>`}</td>
    </tr>`).join('');
}

$('addAdmin').addEventListener('click', () => run(async () => {
  await acct('', 'POST', { username: $('au').value.trim(), password: $('ap').value });
  ['au', 'ap'].forEach(id => $(id).value = '');
  await loadAdmins();
  msg('Admin created');
}));

$('adminTable').addEventListener('click', e => run(async () => {
  const btn = e.target.closest('button[data-admin-del]');
  if (!btn) return;
  if (!confirm('Delete this admin account? They will be logged out immediately.')) return;
  await acct('/' + btn.dataset.adminDel, 'DELETE');
  await loadAdmins();
  msg('Admin deleted');
}));

// ---------- Live pie charts ----------
function resetCharts() {
  Object.values(charts).forEach(c => c.destroy());
  charts = {};
  $('liveCharts').innerHTML = '';
  $('turnout').textContent = '';
}

async function loadLive() {
  const id = currentId;
  if (!id) return;
  const { rows, turnout } = await acct('/live/' + id);
  if (id !== currentId) return;       // election changed while loading
  $('turnout').textContent = `Turnout: ${turnout.voted} / ${turnout.total} students`;

  const byPosition = {};
  rows.forEach(r => (byPosition[r.position_id] ??= { title: r.position, items: [] }).items.push(r));

  Object.keys(charts).forEach(k => {          // drop charts for removed positions
    if (!byPosition[k]) { charts[k].canvas.parentElement.remove(); charts[k].destroy(); delete charts[k]; }
  });

  for (const [pid, p] of Object.entries(byPosition)) {
    const labels = p.items.map(i => i.name);
    const data = p.items.map(i => i.votes);
    if (charts[pid]) {
      charts[pid].data.labels = labels;
      charts[pid].data.datasets[0].data = data;
      charts[pid].update();
    } else {
      const box = document.createElement('div');
      box.className = 'chartbox';
      box.innerHTML = `<h3>${esc(p.title)}</h3><canvas></canvas>`;
      $('liveCharts').appendChild(box);
      charts[pid] = new Chart(box.querySelector('canvas'), {
        type: 'pie',
        data: { labels, datasets: [{ data }] },
        options: { plugins: { legend: { position: 'bottom' } } }
      });
    }
  }
}

function startLive() {
  if (liveStarted) return;
  liveStarted = true;
  new EventSource('/api/results/stream/live').onmessage = () => { if (me) loadLive().catch(() => {}); };
  setInterval(() => { if (me && !document.hidden) loadLive().catch(() => {}); }, 15000);
}

// ---------- Elections ----------
async function loadElections(selectId) {
  const list = await api('/elections');
  const sel = $('electionSelect');
  sel.innerHTML = list.map(e => `<option value="${e.id}">${esc(e.title)} (#${e.id})</option>`).join('');
  if (!list.length) { currentId = null; return; }
  currentId = selectId || currentId || list[0].id;
  if (!list.some(e => e.id == currentId)) currentId = list[0].id;
  sel.value = currentId;
}

$('electionSelect').addEventListener('change', e => run(async () => {
  currentId = e.target.value;
  $('codesBox').classList.add('hidden');
  resetCharts();
  await refresh();
  await loadLive();
}));

$('createElection').addEventListener('click', () => run(async () => {
  const title = $('eTitle').value.trim();
  if (!title) throw new Error('Enter an election title');
  const created = await api('/elections', 'POST', {
    title,
    description: $('eDesc').value.trim(),
    theme: { primary: $('ePrimary').value, accent: $('eAccent').value, logo: $('eLogo').value.trim() }
  });
  ['eTitle', 'eDesc', 'eLogo'].forEach(id => $(id).value = '');
  await loadElections(created.id);
  resetCharts();
  await refresh();
  await loadLive();
  msg('Election created. Add positions, candidates and voters, then open voting.');
}));

async function setStatus(status) {
  if (!currentId) throw new Error('Select or create an election first');
  if (status === 'closed' && !confirm('Close voting? Students will no longer be able to vote, and stored voter codes will be erased.')) return;
  await api('/elections/' + currentId, 'PATCH', { status });
  await refresh();
  msg('Status changed to ' + status);
}
$('btnDraft').addEventListener('click', () => run(() => setStatus('draft')));
$('btnOpen').addEventListener('click',  () => run(() => setStatus('open')));
$('btnClose').addEventListener('click', () => run(() => setStatus('closed')));

$('btnDelete').addEventListener('click', () => run(async () => {
  if (!currentId) throw new Error('No election selected');
  const title = $('electionSelect').selectedOptions[0].textContent.replace(/ \(#\d+\)$/, '');
  const typed = prompt(
    `This permanently deletes the election, including all its candidates, voters and votes.\n\n` +
    `Type the election title to confirm:\n${title}`);
  if (typed === null) return;
  await api('/elections/' + currentId, 'DELETE', { confirmTitle: typed });

  currentId = null;
  resetCharts();
  $('codesBox').classList.add('hidden');
  await loadElections();
  if (currentId) {
    await refresh();
    await loadLive();
  } else {
    $('statusBadge').textContent = '-';
    $('statusBadge').className = 'badge';
    $('candPosition').innerHTML = '<option value="">(create an election first)</option>';
    $('candList').innerHTML = '';
    $('voterTable').innerHTML = '';
    $('voterSummary').textContent = 'Voters';
  }
  msg('Election deleted');
}));

// ---------- Positions and candidates ----------
$('addPosition').addEventListener('click', () => run(async () => {
  if (!currentId) throw new Error('Create an election first');
  const title = $('posTitle').value.trim();
  if (!title) throw new Error('Enter a position title');
  await api(`/elections/${currentId}/positions`, 'POST', { title });
  $('posTitle').value = '';
  await refresh();
  await loadLive();
  msg('Position added');
}));

$('addCandidate').addEventListener('click', () => run(async () => {
  const positionId = $('candPosition').value;
  const name = $('candName').value.trim();
  const username = $('candUsername').value.trim();
  const password = $('candPassword').value;
  if (!positionId) throw new Error('Add a position first');
  if (!name) throw new Error('Enter the candidate name');
  if (!username || !password) throw new Error('Enter a candidate account username and password');
  await api(`/positions/${positionId}/candidates`, 'POST', {
    name,
    grade_section: $('candGrade').value.trim(),
    bio: $('candBio').value.trim(),
    photo_url: $('candPhoto').value.trim(),
    account_username: username,
    account_password: password
  });
  ['candName', 'candGrade', 'candBio', 'candPhoto', 'candUsername', 'candPassword'].forEach(id => $(id).value = '');
  await refresh();
  await loadLive();
  msg('Candidate added');
}));

$('candList').addEventListener('click', e => run(async () => {
  const accountBtn = e.target.closest('button[data-account-save]');
  if (accountBtn) {
    const candidateRow = accountBtn.closest('li');
    const username = candidateRow.querySelector('[data-account-username]').value.trim();
    const password = candidateRow.querySelector('[data-account-password]').value;
    await api(`/candidates/${accountBtn.dataset.accountSave}/account`, 'PUT', { username, password });
    candidateRow.querySelector('[data-account-password]').value = '';
    candidateRow.querySelector('details').open = false;
    msg('Candidate account credentials saved');
    return;
  }
  const btn = e.target.closest('button[data-del]');
  if (!btn) return;
  const isPosition = btn.dataset.del === 'position';
  if (!confirm(isPosition ? 'Remove this position and ALL of its candidates?' : 'Remove this candidate?')) return;
  await api(`/${isPosition ? 'positions' : 'candidates'}/${btn.dataset.id}`, 'DELETE');
  await refresh();
  await loadLive();
  msg(isPosition ? 'Position removed' : 'Candidate removed');
}));

// ---------- Voters ----------
function parseStudents(text) {
  return text.split(/\r?\n/)
    .map(line => line.split(/[,\t;]/).map(x => x.trim().replace(/^"|"$/g, '')))
    .filter(cols => cols[0])
    .filter(cols => !/^student\s*_?id$/i.test(cols[0]))
    .map(cols => ({ studentId: cols[0], fullName: cols[1] || '', gradeSection: cols[2] || '' }));
}

$('addVoters').addEventListener('click', () => run(async () => {
  if (!currentId) throw new Error('Create an election first');
  const students = parseStudents($('voterText').value);
  if (!students.length) throw new Error('Paste at least one student');
  const issued = await api(`/elections/${currentId}/voters`, 'POST', { students });
  const skipped = students.length - issued.length;
  $('voterText').value = '';

  if (issued.length) {
    $('codesTable').innerHTML =
      '<tr><th>Student ID</th><th>Name</th><th>Section</th><th>Code</th></tr>' +
      issued.map(r => `<tr><td>${esc(r.studentId)}</td><td>${esc(r.fullName)}</td><td>${esc(r.gradeSection)}</td><td><code>${esc(r.code)}</code></td></tr>`).join('');
    $('codesBox').classList.remove('hidden');
  }
  await refresh();
  await loadLive();
  msg(`${issued.length} voter(s) added` + (skipped ? `, ${skipped} skipped (already registered)` : ''));
}));

$('printBtn').addEventListener('click', () => window.print());

$('voterTable').addEventListener('click', e => run(async () => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const out = btn.closest('tr').querySelector('.codeout');

  if (btn.dataset.action === 'save-section') {
    await api(`/voters/${id}`, 'PUT', {
      gradeSection: btn.closest('tr').querySelector('[data-voter-section]').value.trim()
    });
    msg('Voter section saved');
  } else if (btn.dataset.action === 'show') {
    out.textContent = (await api(`/voters/${id}/code`)).code;
  } else if (btn.dataset.action === 'reset') {
    if (!confirm('Issue a new code? The old code will stop working.')) return;
    out.textContent = (await api(`/voters/${id}/reset-code`, 'POST')).code;
    msg('New code issued. It is shown in the table row.');
  } else if (btn.dataset.action === 'remove') {
    if (!confirm('Remove this voter?')) return;
    await api(`/voters/${id}`, 'DELETE');
    await refresh();
    await loadLive();
    msg('Voter removed');
  }
}));

// ---------- Rendering ----------
async function refresh() {
  if (!currentId) return;
  const [election, voters] = await Promise.all([
    fetch('/api/election/' + currentId).then(r => r.json()),
    api(`/elections/${currentId}/voters`)
  ]);

  const badge = $('statusBadge');
  badge.textContent = election.status;
  badge.className = 'badge ' + election.status;

  const positions = election.positions || [];
  $('candPosition').innerHTML = positions.length
    ? positions.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('')
    : '<option value="">(add a position first)</option>';

  $('candList').innerHTML = positions.length
    ? positions.map(p => `
        <div class="posrow">
          <h4>${esc(p.title)}</h4>
          <button class="small danger" data-del="position" data-id="${p.id}">Remove position</button>
        </div>
        ${p.candidates.length
          ? '<ul>' + p.candidates.map(c => `
              <li>${esc(c.name)} ${c.grade_section ? '(' + esc(c.grade_section) + ')' : ''}
                <details class="candidate-account">
                  <summary>Set candidate login</summary>
                  <label>Username <input data-account-username autocomplete="off"></label>
                  <label>Password <input data-account-password type="password" autocomplete="new-password"></label>
                  <button class="small secondary" data-account-save="${c.id}">Save login</button>
                </details>
                <button class="small danger" data-del="candidate" data-id="${c.id}">Remove</button>
              </li>`).join('') + '</ul>'
          : '<p><em>No candidates yet</em></p>'}`).join('')
    : '<p><em>No positions yet</em></p>';

  const voted = voters.filter(v => v.has_voted).length;
  $('voterSummary').textContent = `Voters (${voted} of ${voters.length} have voted)`;
  $('voterTable').innerHTML = voters.length
    ? '<tr><th>Student ID</th><th>Name</th><th>Section</th><th>Voted?</th><th>Code</th></tr>' +
      voters.map(v => `<tr>
        <td>${esc(v.student_id)}</td><td>${esc(v.full_name)}</td>
        <td><input data-voter-section aria-label="Section for ${esc(v.student_id)}" value="${esc(v.grade_section)}">
          <button class="small secondary" data-action="save-section" data-id="${v.id}">Save</button></td>
        <td>${v.has_voted ? 'Yes' : 'No'}</td>
        <td>${v.has_voted ? '' : `<span class="codeout"></span>
          ${v.has_code ? `<button class="small secondary" data-action="show" data-id="${v.id}">Show</button>` : ''}
          <button class="small secondary" data-action="reset" data-id="${v.id}">Reset</button>
          <button class="small secondary" data-action="remove" data-id="${v.id}">Remove</button>`}
        </td></tr>`).join('')
    : '<tr><td><em>No voters yet</em></td></tr>';
}

// ---------- Start ----------
async function init() {
  me = await acct('/me');
  $('whoami').textContent = me.username + (me.isMain ? ' (Main Admin)' : '');
  const profile = await acct('/me/profile');
  if (!adminAvatarRemove) {
    adminAvatarRemove = bindProfilePhoto({
      input: $('adminProfilePhoto'),
      image: $('adminProfileCardPhoto'),
      uploadUrl: '/api/admins/me/avatar',
      deleteUrl: '/api/admins/me/avatar',
      message: $('adminProfileMessage'),
      initialPhotoUrl: profile.profile_photo_url ||
        (profile.has_profile_photo ? '/api/admins/me/avatar' : DEFAULT_PROFILE_PHOTO)
    });
    $('removeAdminProfilePhoto').addEventListener('click', () => run(() => adminAvatarRemove()));
  }
  $('adminProfileDisplayName').value = profile.display_name || '';
  $('adminProfileBio').value = profile.profile_bio || '';
  $('adminProfileLinks').value = (profile.social_links || []).map(link => `${link.label} | ${link.url}`).join('\n');
  renderAdminProfile({ ...profile, username: me.username });
  $('adminsCard').classList.toggle('hidden', !me.isMain);
  await loadElections();
  show('app');
  await refresh();
  await loadLive();
  await loadAdmins();
  startLive();
}

(async () => {
  try {
    const s = await (await fetch('/api/auth/setup-status')).json();
    if (s.needsSetup) { show('setup'); return; }
    await init();
  } catch { show('login'); }
})();