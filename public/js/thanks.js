// If the GIF is missing, hide it instead of showing a broken image
const gif = document.getElementById('gif');
gif.onerror = () => { gif.style.display = 'none'; };

(async () => {
  const e = await applyTheme();
  if (e && (e.show_live_results || e.status === 'closed'))
    document.getElementById('resultsLink').hidden = false;

  const res = await fetch('/api/voter/me');
  if (!res.ok) return;                       // not logged in: Home just goes to the login page
  const me = await res.json();

  document.getElementById('homeBtn').href = '/voter/' + encodeURIComponent(me.studentId);
  await renderRecord(document.getElementById('record'), me);
})();