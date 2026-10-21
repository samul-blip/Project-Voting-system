// login.js
applyTheme();
document.getElementById('loginBtn').onclick = async () => {
  const res = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: studentId.value.trim(), code: code.value.trim() })
  });
  const data = await res.json();
  if (res.ok) location.href = '/voter/' + encodeURIComponent(data.studentId);
  else document.getElementById('error').textContent = data.error;
};