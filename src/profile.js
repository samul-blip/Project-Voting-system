const validAccountUsername = username => /^[A-Za-z0-9_.-]{3,32}$/.test(username || '');

function parseProfile(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('Provide valid profile details');
  const bio = body.profile_bio == null ? '' : String(body.profile_bio).trim();
  const links = body.social_links == null ? [] : body.social_links;

  if (bio.length > 500) throw new Error('Bio must be 500 characters or fewer');
  if (!Array.isArray(links) || links.length > 5)
    throw new Error('Provide up to 5 social links');

  const socialLinks = links.map(link => {
    const label = String(link?.label || '').trim();
    const url = String(link?.url || '').trim();
    if (!label || label.length > 32 || url.length > 500 || !isHttpsUrl(url))
      throw new Error('Each social link needs a label and a valid HTTPS URL');
    return { label, url };
  });

  return {
    profile_bio: bio || null,
    social_links: socialLinks
  };
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = { parseProfile, validAccountUsername };
