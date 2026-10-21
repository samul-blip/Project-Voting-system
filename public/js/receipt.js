function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

const STATUS_TEXT = {
  open:   'Voting is open',
  closed: 'Voting has closed',
  draft:  'Not open yet'
};

async function renderRecord(el, me) {
  let html = `
    <h2>My voting record</h2>
    <p><strong>Election:</strong> ${escHtml(me.electionTitle)}</p>
    <p><strong>Current status:</strong>
       <span class="pill ${escHtml(me.electionStatus)}">${escHtml(STATUS_TEXT[me.electionStatus] || me.electionStatus)}</span></p>`;

  const r = await fetch('/api/voter/receipt');
  if (r.ok) {
    const rec = await r.json();
    html += `<p class="muted">Vote recorded on ${escHtml(new Date(rec.castAt).toLocaleString())}</p>` +
      rec.choices.map(c =>
        `<div class="pick"><span>${escHtml(c.position)}</span><strong>${escHtml(c.candidate)}</strong></div>`
      ).join('');
  } else {
    html += '<p class="muted">No record of your choices is available for this vote.</p>';
  }
  el.innerHTML = html;
  el.hidden = false;
}