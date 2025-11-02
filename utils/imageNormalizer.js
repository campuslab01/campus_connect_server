/**
 * Normalizes image URLs to ensure they're always full URLs
 * Converts relative paths like /uploads/image.jpg to full URLs
 */
const normalizeImageUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  
  // If already a full URL, return as is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // If relative path starting with /uploads, convert to full URL
  if (url.startsWith('/uploads')) {
    const baseUrl = process.env.SERVER_PUBLIC_URL || process.env.CLIENT_URL?.replace('/api', '') || 'https://campus-connect-server-yqbh.onrender.com';
    return `${baseUrl}${url}`;
  }
  
  // If it's a data URI, return as is
  if (url.startsWith('data:')) {
    return url;
  }
  
  // Otherwise return as is (might be a different format)
  return url;
};

/**
 * Normalizes an array of image URLs
 */
const normalizeImageUrls = (urls) => {
  if (!Array.isArray(urls)) return [];
  return urls.map(normalizeImageUrl).filter(url => url !== null);
};

/**
 * Normalizes user object's image fields
 */
const normalizeUserImages = (user) => {
  if (!user) return user;
  
  const normalized = { ...user };
  
  // Normalize profileImage
  if (normalized.profileImage) {
    normalized.profileImage = normalizeImageUrl(normalized.profileImage);
  }
  
  // Normalize photos array
  if (Array.isArray(normalized.photos)) {
    normalized.photos = normalizeImageUrls(normalized.photos);
  }
  
  return normalized;
};

module.exports = {
  normalizeImageUrl,
  normalizeImageUrls,
  normalizeUserImages
};

