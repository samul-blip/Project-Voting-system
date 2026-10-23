const express = require('express');

const MAX_AVATAR_BYTES = 25 * 1024 * 1024;
const uploadAvatarBody = express.raw({
  type: ['image/jpeg', 'image/png'],
  limit: MAX_AVATAR_BYTES
});

function validateAvatar(req, res, next) {
  if (!Buffer.isBuffer(req.body) || !req.body.length)
    return res.status(400).json({ error: 'Choose a JPEG or PNG image to upload' });

  const type = req.headers['content-type'];
  const image = req.body;
  const valid = type === 'image/jpeg' && image.length >= 3 &&
      image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff ||
    type === 'image/png' && image.length >= 8 &&
      image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!valid) return res.status(400).json({ error: 'The uploaded file is not a valid JPEG or PNG image' });

  req.avatarMime = type;
  next();
}

function sendAvatar(res, row) {
  return sendImage(res, row, 'profile_photo_data', 'profile_photo_mime');
}

function sendImage(res, row, dataField, mimeField) {
  if (!row || !row[dataField] || !row[mimeField])
    return res.status(404).json({ error: 'No uploaded image' });
  res.set({
    'Content-Type': row[mimeField],
    'Content-Length': row[dataField].length,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  return res.send(row[dataField]);
}

module.exports = { uploadAvatarBody, validateAvatar, sendAvatar, sendImage };
