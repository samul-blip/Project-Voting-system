const $ = id => document.getElementById(id);

function setSocialLinks(value) {
  return (value || []).map(link => `${link.label} | ${link.url}`).join('\n');
}

function parseSocialLinks(value) {
  return value.split(/\r?\n/).filter(Boolean).map(line => {
    const [label, ...url] = line.split('|');
    return { label: label.trim(), url: url.join('|').trim() };
  });
}

function renderSocialLinks(links) {
  const list = $('candidateSocialLinks');
  list.replaceChildren();
  (links || []).forEach(link => {
    let url;
    try { url = new URL(link.url); }
    catch { return; }
    if (url.protocol !== 'https:') return;
    const anchor = document.createElement('a');
    anchor.href = url.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = link.label;
    list.append(anchor);
  });
  $('candidateSocialEmpty').hidden = list.childElementCount > 0;
}

async function loadCandidate() {
  const response = await fetch('/api/candidate/me');
  if (!response.ok) {
    if (response.status === 401) {
      $('dashboard').hidden = true;
      $('loginCard').hidden = false;
      return false;
    }
    throw new Error('Could not load candidate account');
  }
  const candidate = await response.json();
  $('loginCard').hidden = true;
  $('dashboard').hidden = false;
  const photoPreview = $('profilePhotoPreview');
  photoPreview.onerror = () => {
    photoPreview.onerror = null;
    photoPreview.src = '/default-avatar.svg';
  };
  photoPreview.src = candidate.profile_photo_url ||
    (candidate.has_profile_photo ? `/api/candidate/me/avatar?v=${Date.now()}` : '/default-avatar.svg');
  $('candidateName').textContent = candidate.name;
  $('candidatePosition').textContent = [candidate.position, candidate.grade_section].filter(Boolean).join(' · ');
  $('candidateElection').textContent = candidate.election_title;
  $('voteCount').textContent = candidate.votes;
  $('partyVoteCount').textContent = '0';
  $('candidateBio').textContent = candidate.profile_bio || candidate.bio || 'No bio added yet.';
  renderSocialLinks(candidate.social_links);
  $('profileBio').value = candidate.profile_bio || '';
  $('profileLinks').value = setSocialLinks(candidate.social_links);
  return true;
}

async function signIn() {
  $('loginError').textContent = '';
  const response = await fetch('/api/auth/candidate-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: $('username').value.trim(), password: $('password').value })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    $('loginError').textContent = result.error || 'Could not sign in.';
    return;
  }
  $('password').value = '';
  await loadCandidate();
}

async function saveProfile() {
  const message = $('profileMessage');
  message.textContent = '';
  const response = await fetch('/api/candidate/me/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile_bio: $('profileBio').value.trim(),
      social_links: parseSocialLinks($('profileLinks').value)
    })
  });
  const result = await response.json().catch(() => ({}));
  message.textContent = response.ok ? 'Profile saved.' : (result.error || 'Could not save profile.');
  if (response.ok) await loadCandidate();
}

async function start() {
  await applyTheme();
  const removeProfilePhoto = bindProfilePhoto({
    input: $('profilePhoto'),
    image: $('profilePhotoPreview'),
    uploadUrl: '/api/candidate/me/avatar',
    deleteUrl: '/api/candidate/me/avatar',
    message: $('profileMessage'),
    initialPhotoUrl: DEFAULT_PROFILE_PHOTO
  });
  $('removeProfilePhoto').addEventListener('click', () => {
    removeProfilePhoto().catch(err => { $('profileMessage').textContent = err.message; });
  });
  $('loginBtn').addEventListener('click', () => signIn().catch(err => { $('loginError').textContent = err.message; }));
  $('password').addEventListener('keydown', event => { if (event.key === 'Enter') $('loginBtn').click(); });
  $('username').addEventListener('keydown', event => { if (event.key === 'Enter') $('loginBtn').click(); });
  $('saveProfile').addEventListener('click', () => saveProfile().catch(err => { $('profileMessage').textContent = err.message; }));
  $('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.reload();
  });

  if (await loadCandidate()) {
    const source = new EventSource('/api/results/stream/live');
    source.onmessage = () => loadCandidate().catch(console.error);
    setInterval(() => {
      if (!document.hidden) loadCandidate().catch(console.error);
    }, 15000);
  }
}

start().catch(err => { $('loginError').textContent = err.message; });
