async function applyTheme() {
  const res = await fetch('/api/election');
  if (!res.ok) return null;
  const e = await res.json();
  document.documentElement.style.setProperty('--primary', e.theme.primary);
  document.documentElement.style.setProperty('--accent', e.theme.accent);
  document.title = e.title;
  const h1 = document.getElementById('election-title');
  if (h1) h1.textContent = e.title;
  const logo = document.getElementById('logo');
  if (logo && e.theme.logo) logo.src = e.theme.logo;
  return e;
}