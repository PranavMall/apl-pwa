/**
 * Generates a unique referral code based on user ID and timestamp
 * @param {string} userId - The user's ID
 * @returns {string} A unique referral code
 */
export const generateReferralCode = (userId) => {
  // Get current timestamp
  const timestamp = Date.now();
  
  // Take first 6 characters of userId
  const userIdPart = userId.substring(0, 6);
  
  // Take last 4 digits of timestamp
  const timestampPart = timestamp.toString().slice(-4);
  
  // Mix with some random characters
  const randomChars = Math.random().toString(36).substring(2, 5).toUpperCase();
  
  // Combine parts
  return `APL-${randomChars}${userIdPart.substring(0, 3)}${timestampPart}`;
};

/**
 * Validates a referral code format
 * @param {string} code - The referral code to validate
 * @returns {boolean} Whether the code is in a valid format
 */
export const isValidReferralFormat = (code) => {
  // Check if code follows our format: APL-XXXYYYZZZZ
  const regex = /^APL-[A-Z0-9]{10}$/;
  return regex.test(code);
};
