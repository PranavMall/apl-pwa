import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore'; // Added necessary imports
import { getAuth } from 'firebase/auth';
import { isValidReferralFormat, generateReferralCode } from '@/app/utils/referralUtils';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase only if it hasn't been initialized
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

// Check if code is running in browser environment
if (typeof window !== 'undefined') {
  // Only define these functions in browser context
  window.fixUserReferralCode = async function(userId) {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.error(`User ${userId} not found`);
        return { success: false, error: 'User not found' };
      }
      
      const userData = userDoc.data();
      const currentCode = userData.referralCode || '';
      
      if (isValidReferralFormat(currentCode)) {
        console.log(`User's current code ${currentCode} is already valid`);
        return { success: true, message: 'Code already valid', code: currentCode };
      }
      
      const newCode = generateReferralCode(userId);
      await updateDoc(userRef, { referralCode: newCode });
      
      console.log(`Updated user ${userId} referral code:`, {
        old: currentCode,
        new: newCode
      });
      
      return { success: true, oldCode: currentCode, newCode };
    } catch (error) {
      console.error('Error fixing user referral code:', error);
      return { success: false, error: error.message };
    }
  };

  console.log("Referral code fix utility added. Run window.fixUserReferralCode('user-id') in console to execute.");
}

export { auth, db };
