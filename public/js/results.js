function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

(async () => {
  const e = await applyTheme();
  const charts = {};

  async function load() {
    const res = await fetch(`/api/results/${e.id}`);
    if (!res.ok) { document.getElementById('charts').textContent = (await res.json()).error; return; }
    const { rows, turnout, partyTotals = [] } = await res.json();

    document.getElementById('turnout').textContent =
      `Turnout: ${turnout.voted} / ${turnout.total} students`;
    const partyResults = document.getElementById('partyResults');
    partyResults.innerHTML = partyTotals.length
      ? `<div class="scroll"><table><tr><th>Party</th><th>Total votes</th><th>By position</th></tr>
         ${partyTotals.map(p => `<tr>
           <td><span class="party-badge" style="--party-color:${/^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#1e66f5'}">${escapeHtml(p.name)}</span></td>
           <td>${p.total_votes}</td>
           <td>${p.positions.map(position => `${escapeHtml(position.position)}: ${position.votes}`).join(' · ') || 'No positions'}</td>
         </tr>`).join('')}</table></div>`
      : '<p class="muted">No parties have been created for this election.</p>';

    const byPosition = {};
    rows.forEach(r => (byPosition[r.position_id] ??= { title: r.position, items: [] }).items.push(r));

    for (const [pid, p] of Object.entries(byPosition)) {
      const labels = p.items.map(i => i.party_name ? `${i.name} (${i.party_name})` : `${i.name} (Independent)`);
      const data = p.items.map(i => i.votes);

      if (charts[pid]) {                       // update existing chart in place
        charts[pid].data.labels = labels;
        charts[pid].data.datasets[0].data = data;
        charts[pid].update();
      } else {                                 // create a new chart
        const wrap = document.createElement('div');
        wrap.className = 'card';
        wrap.innerHTML = `<h2>${escapeHtml(p.title)}</h2><canvas></canvas>`;
        document.getElementById('charts').appendChild(wrap);
        charts[pid] = new Chart(wrap.querySelector('canvas'), {
          type: 'pie',
          data: { labels, datasets: [{ data }] },
          options: { plugins: { legend: { position: 'bottom' } } }
        });
      }
    }
  }

  await load();
  const source = new EventSource('/api/results/stream/live');
  source.onmessage = load;           // refresh whenever a vote is cast
  setInterval(load, 15000);          // fallback polling
})();