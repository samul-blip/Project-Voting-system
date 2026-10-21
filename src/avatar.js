const express = require('express');

const MAX_AVATAR_BYTES = 1024 * 1024;
const uploadAvatarBody = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: MAX_AVATAR_BYTES
});

function validateAvatar(req, res, next) {
  if (!Buffer.isBuffer(req.body) || !req.body.length)
    return res.status(400).json({ error: 'Choose a JPEG, PNG, or WebP image to upload' });

  const type = req.headers['content-type'];
  const image = req.body;
  const valid = type === 'image/jpeg' && image.length >= 3 &&
      image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff ||
    type === 'image/png' && image.length >= 8 &&
      image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    type === 'image/webp' && image.length >= 12 &&
      image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) return res.status(400).json({ error: 'The uploaded file is not a valid JPEG, PNG, or WebP image' });

  req.avatarMime = type;
  next();
}

function sendAvatar(res, row) {
  if (!row || !row.profile_photo_data || !row.profile_photo_mime) {
    return res.status(404).json({ error: 'No uploaded profile picture' });
  }
  res.set({
    'Content-Type': row.profile_photo_mime,
    'Content-Length': row.profile_photo_data.length,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  return res.send(row.profile_photo_data);
}

module.exports = { uploadAvatarBody, validateAvatar, sendAvatar };
