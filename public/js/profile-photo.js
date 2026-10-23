const DEFAULT_PROFILE_PHOTO = '/default-avatar.svg';

function showDefaultProfilePhoto(image) {
  image.onerror = () => {
    image.onerror = null;
    image.src = DEFAULT_PROFILE_PHOTO;
  };
  image.src = DEFAULT_PROFILE_PHOTO;
}

function bindProfilePhoto({ input, image, uploadUrl, deleteUrl, message, initialPhotoUrl }) {

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      input.value = '';
      message.textContent = 'Choose a JPEG or PNG image.';
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      input.value = '';
      message.textContent = 'Profile pictures must be 25 MB or smaller.';
      return;
    }

    const previousPhoto = image.src;
    const preview = URL.createObjectURL(file);
    image.src = preview;
    message.textContent = 'Uploading picture…';
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not upload profile picture.');
      image.src = `${uploadUrl}?v=${Date.now()}`;
      message.textContent = 'Profile picture uploaded.';
    } catch (err) {
      image.src = previousPhoto;
      image.onerror = () => showDefaultProfilePhoto(image);
      message.textContent = err.message;
    } finally {
      URL.revokeObjectURL(preview);
      input.value = '';
    }
  });

  image.onerror = () => {
    showDefaultProfilePhoto(image);
  };
  image.src = initialPhotoUrl || uploadUrl;

  return async () => {
    const response = await fetch(deleteUrl, { method: 'DELETE' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not remove profile picture.');
    showDefaultProfilePhoto(image);
    message.textContent = 'Default profile picture restored.';
  };
}
