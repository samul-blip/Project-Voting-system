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
      el.innerHTML = `
        ${c.photo_url ? `<img src="${escapeHtml(c.photo_url)}" alt="">` : ''}
        <h3>${escapeHtml(c.name)}</h3>
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