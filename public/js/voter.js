const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

(async () => {
  const res = await fetch('/api/voter/me');
  if (!res.ok) { location.replace('/'); return; }          // not logged in
  const me = await res.json();

  // Each page belongs to one voter: send anyone else to their own page
  const urlId = decodeURIComponent(location.pathname.split('/')[2] || '');
  if (urlId !== me.studentId) { location.replace('/voter/' + encodeURIComponent(me.studentId)); return; }

  await applyTheme();
  $('name').textContent = me.fullName || me.studentId;
  $('sid').textContent = me.studentId;
  $('voterSection').textContent = me.gradeSection || 'Section not provided';
  const removeProfilePhoto = bindProfilePhoto({
    input: $('profilePhoto'),
    image: $('profilePhotoPreview'),
    uploadUrl: '/api/voter/me/avatar',
    deleteUrl: '/api/voter/me/avatar',
    message: $('profileMessage'),
    initialPhotoUrl: me.profile_photo_url || (me.has_profile_photo ? undefined : DEFAULT_PROFILE_PHOTO)
  });
  $('removeProfilePhoto').onclick = () => removeProfilePhoto().catch(err => {
    $('profileMessage').textContent = err.message;
  });
  $('profileBio').value = me.profile_bio || '';
  $('saveProfile').onclick = async () => {
    const profileMessage = $('profileMessage');
    profileMessage.textContent = '';
    const response = await fetch('/api/voter/me/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_bio: $('profileBio').value.trim() })
    });
    const result = await response.json().catch(() => ({}));
    profileMessage.textContent = response.ok ? 'Profile saved.' : (result.error || 'Could not save profile.');
  };
  $('changeVoterCode').onclick = async () => {
    const message = $('voterCodeMessage');
    message.textContent = '';
    const current = $('currentVoterCode').value;
    const next = $('newVoterCode').value;
    if (next !== $('confirmVoterCode').value) {
      message.textContent = 'The new voter codes do not match.';
      return;
    }
    const response = await fetch('/api/voter/me/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current, next })
    });
    const result = await response.json().catch(() => ({}));
    message.textContent = response.ok ? 'Voter code changed.' : (result.error || 'Could not change voter code.');
    if (response.ok) {
      $('currentVoterCode').value = '';
      $('newVoterCode').value = '';
      $('confirmVoterCode').value = '';
    }
  };
  $('logoutBtn').onclick = async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.replace('/'); };

  if (me.hasVoted) {
    $('status').textContent = 'You have voted. Thank you!';
    await renderRecord($('record'), me);
    return;
  }
  if (me.electionStatus !== 'open') {
    $('status').textContent = me.electionStatus === 'closed'
      ? 'Voting has closed. You did not cast a vote in this election.'
      : 'Voting is not open yet.';
    return;
  }
  $('status').textContent = 'You have not voted yet. Choose one candidate per position, then submit.';

  const eRes = await fetch('/api/election');
  if (!eRes.ok) return;
  const e = await eRes.json();
  const choices = {};
  const submitBtn = $('submit');
  submitBtn.hidden = false;
  submitBtn.disabled = true;

  e.positions.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h2>${esc(p.title)}</h2><div class="candidates"></div>`;
    const list = card.querySelector('.candidates');
    p.candidates.forEach(c => {
      const el = document.createElement('div');
      el.className = 'candidate';
      const partyColor = /^#[0-9a-f]{6}$/i.test(c.party_color || '') ? c.party_color : '#1e66f5';
      el.innerHTML = `
        ${c.photo_url ? `<img src="${esc(c.photo_url)}" alt="">` : ''}
        <h3>${esc(c.name)}</h3>
        ${c.party_name ? `${c.party_logo_url ? `<img class="party-logo" src="${esc(c.party_logo_url)}" alt="">` : ''}<span class="party-badge" style="--party-color:${partyColor}">${esc(c.party_name)}</span>` : '<span class="party-independent">Independent</span>'}
        ${c.party_slogan ? `<p class="party-slogan">${esc(c.party_slogan)}</p>` : ''}
        ${c.party_platform ? `<small class="party-platform">${esc(c.party_platform)}</small>` : ''}
        <p>${esc(c.grade_section || '')}</p><small>${esc(c.bio || '')}</small>`;
      el.onclick = () => {
        list.querySelectorAll('.candidate').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
        choices[p.id] = c.id;
        submitBtn.disabled = Object.keys(choices).length !== e.positions.length;
      };
      list.appendChild(el);
    });
    list.querySelectorAll('.party-logo').forEach(image => {
      image.onerror = () => image.remove();
    });
    $('positions').appendChild(card);
  });

  submitBtn.onclick = async () => {
    if (!confirm('Submit your vote? This cannot be changed.')) return;
    submitBtn.disabled = true;
    const r = await fetch('/api/vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choices })
    });
    if (r.ok) { location.replace('/thanks.html'); return; }
    alert((await r.json().catch(() => ({}))).error || 'Could not submit your vote');
    submitBtn.disabled = false;
  };
})();