(async () => {
  const e = await applyTheme();
  const charts = {};

  async function load() {
    const res = await fetch(`/api/results/${e.id}`);
    if (!res.ok) { document.getElementById('charts').textContent = (await res.json()).error; return; }
    const { rows, turnout } = await res.json();

    document.getElementById('turnout').textContent =
      `Turnout: ${turnout.voted} / ${turnout.total} students`;

    const byPosition = {};
    rows.forEach(r => (byPosition[r.position_id] ??= { title: r.position, items: [] }).items.push(r));

    for (const [pid, p] of Object.entries(byPosition)) {
      const labels = p.items.map(i => i.name);
      const data = p.items.map(i => i.votes);

      if (charts[pid]) {                       // update existing chart in place
        charts[pid].data.labels = labels;
        charts[pid].data.datasets[0].data = data;
        charts[pid].update();
      } else {                                 // create a new chart
        const wrap = document.createElement('div');
        wrap.className = 'card';
        wrap.innerHTML = `<h2>${p.title}</h2><canvas></canvas>`;
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