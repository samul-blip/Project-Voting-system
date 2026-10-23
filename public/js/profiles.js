const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

async function loadProfiles() {
  await applyTheme();
  const response = await fetch('/api/profiles');
  if (!response.ok) {
    if (response.status === 401) {
      location.replace('/');
      return;
    }
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Could not load election profiles');
  }
  const profiles = await response.json();
  const list = document.getElementById('profileList');
  if (!profiles.length) {
    list.textContent = 'No profiles are available yet.';
    return;
  }

  list.innerHTML = profiles.map(profile => {
    const links = (profile.social_links || []).map(link =>
      `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`
    ).join('');
    return `<article class="profile-card">
      <img class="profile-avatar" src="${escapeHtml(profile.profile_photo_url || '/default-avatar.svg')}" alt="${escapeHtml(profile.name)} profile photo">
      <span class="pill">${escapeHtml(profile.type)}</span>
      <h3>${escapeHtml(profile.name)}</h3>
      ${profile.position ? `<p class="muted">${escapeHtml(profile.position)}${profile.grade_section ? ` · ${escapeHtml(profile.grade_section)}` : ''}</p>` : ''}
      ${profile.party_name && profile.party_logo_url ? `<img class="party-logo" src="${escapeHtml(profile.party_logo_url)}" alt="">` : ''}
      ${profile.party_name ? `<span class="party-badge" style="--party-color:${/^#[0-9a-f]{6}$/i.test(profile.party_color || '') ? profile.party_color : '#1e66f5'}">${escapeHtml(profile.party_name)}</span>` : ''}
      ${profile.party_slogan ? `<p class="party-slogan">${escapeHtml(profile.party_slogan)}</p>` : ''}
      ${profile.party_platform ? `<p class="party-platform">${escapeHtml(profile.party_platform)}</p>` : ''}
      ${profile.profile_bio ? `<p>${escapeHtml(profile.profile_bio)}</p>` : '<p class="muted">No bio yet.</p>'}
      ${links ? `<nav class="social-links" aria-label="${escapeHtml(profile.name)} social links">${links}</nav>` : ''}
    </article>`;
  }).join('');
  list.querySelectorAll('.profile-avatar').forEach(image => {
    image.onerror = () => {
      image.onerror = null;
      image.src = '/default-avatar.svg';
    };
  });
  list.querySelectorAll('.party-logo').forEach(image => {
    image.onerror = () => image.remove();
  });
}

loadProfiles().catch(err => { document.getElementById('profileError').textContent = err.message; });
