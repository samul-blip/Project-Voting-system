function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

(async () => {
  const e = await applyTheme();
  const container = document.getElementById('positions');
  const submitBtn = document.getElementById('submit');
  if (!e) { container.textContent = 'No active election.'; submitBtn.style.display = 'none'; return; }

  const choices = {};
  submitBtn.disabled = true;

  e.positions.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h2>${escapeHtml(p.title)}</h2><div class="candidates"></div>`;
    const list = card.querySelector('.candidates');

    p.candidates.forEach(c => {
      const el = document.createElement('div');
      el.className = 'candidate';
      const partyColor = /^#[0-9a-f]{6}$/i.test(c.party_color || '') ? c.party_color : '#1e66f5';
      el.innerHTML = `
        ${c.photo_url ? `<img src="${escapeHtml(c.photo_url)}" alt="">` : ''}
        <h3>${escapeHtml(c.name)}</h3>
        ${c.party_name ? `${c.party_logo_url ? `<img class="party-logo" src="${escapeHtml(c.party_logo_url)}" alt="">` : ''}<span class="party-badge" style="--party-color:${partyColor}">${escapeHtml(c.party_name)}</span>` : '<span class="party-independent">Independent</span>'}
        ${c.party_slogan ? `<p class="party-slogan">${escapeHtml(c.party_slogan)}</p>` : ''}
        ${c.party_platform ? `<small class="party-platform">${escapeHtml(c.party_platform)}</small>` : ''}
        <p>${escapeHtml(c.grade_section || '')}</p>
        <small>${escapeHtml(c.bio || '')}</small>`;
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
    container.appendChild(card);
  });

  submitBtn.onclick = async () => {
    if (!confirm('Submit your vote? This cannot be changed.')) return;
    submitBtn.disabled = true;
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choices })
    });
    if (res.ok) { location.href = 'thanks.html'; return; }
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Could not submit your vote');
    if (res.status === 401) location.href = '/';   // not logged in or session expired
    else submitBtn.disabled = false;
  };
})();