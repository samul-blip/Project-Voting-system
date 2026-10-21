const crypto = require('crypto');

if (!process.env.CODE_KEY) throw new Error('CODE_KEY is missing from .env');
const key = crypto.createHash('sha256').update(process.env.CODE_KEY).digest();

exports.encrypt = (text) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
};

exports.decrypt = (stored) => {
  const [iv, tag, enc] = stored.split('.').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
};