require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const path = require('path');
const pool = require('./db');
const migrate = require('./migrate');

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(express.json());
app.use(session({
  store: new pgSession({ pool }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 60 * 1000 } // 30 min
}));

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/election', require('./routes/election'));
app.use('/api/vote', require('./routes/vote'));
app.use('/api/results', require('./routes/results'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admins', require('./routes/admins'));
app.use('/api/voter', require('./routes/voter'));
app.use('/api/candidate', require('./routes/candidate'));
app.use('/api/profiles', require('./routes/profiles'));
app.get('/voter/:studentId', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'voter.html')));

async function start() {
  await migrate();
  app.listen(process.env.PORT || 3000, () => console.log('Server running'));
}

start().catch(err => {
  console.error('Server startup failed:', err);
  process.exitCode = 1;
});
