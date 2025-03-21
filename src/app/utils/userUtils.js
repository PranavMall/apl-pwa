/**
 * Generates an initials-based avatar for users without profile pictures
 * @param {string} userName - The user's team name or display name
 * @param {string} userId - The user's unique ID (optional, for consistent coloring)
 * @returns {string} SVG data URL for an avatar with user's initials
 */
export const getUserAvatar = (userName, userId = null) => {
  if (!userName) return "/images/placeholder-profile.png";
  
  // Extract initials (up to 2 characters)
  const initials = userName.split(' ')
    .map(name => name.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase();
  
  // Generate a color based on user ID or name for consistency
  let color;
  
  if (userId) {
    // Generate consistent color based on user ID
    const hashCode = userId.split('').reduce(
      (acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0
    );
    const hue = Math.abs(hashCode % 360);
    color = `hsl(${hue}, 65%, 55%)`;
  } else {
    // Generate color based on name
    const hashCode = userName.split('').reduce(
      (acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0
    );
    const hue = Math.abs(hashCode % 360);
    color = `hsl(${hue}, 65%, 55%)`;
  }
  
  // Create SVG string
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <circle cx="50" cy="50" r="50" fill="${color}" />
      <text x="50" y="50" dy=".3em" 
        text-anchor="middle" 
        font-family="Arial, sans-serif" 
        font-size="40" 
        font-weight="bold" 
        fill="white">
        ${initials}
      </text>
    </svg>
  `;
  
  // Convert to a data URL
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
