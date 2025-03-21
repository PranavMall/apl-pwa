"use client";

import React, { useState, useEffect } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "../../firebase"; 
import styles from "./page.module.css";
import { FantasyService } from "../services/fantasyService";
import { transferService } from "../services/transferService";
import { generateReferralCode, isValidReferralFormat } from "../utils/referralUtils";

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false); // Toggle between login and sign-up
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [referralError, setReferralError] = useState("");
  const [googleReferralCode, setGoogleReferralCode] = useState("");
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  // Toggle between Login and Sign-Up forms
  const toggleForm = () => {
    if (!showResetForm) {
      setIsSignUp(!isSignUp);
    }
  };

  // Handle Email/Password Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log("Login successful!");
      router.push("/profile"); // Redirect to the profile
    } catch (error) {
      console.error("Login error:", error);
      setError(error.message);
    }
  };

  const validateGoogleReferralCode = (code) => {
    if (!code) return true; // Optional field
    
    if (!isValidReferralFormat(code)) {
      setReferralError("Invalid referral code format (must start with APL-)");
      return false;
    }
    
    setReferralError("");
    return true;
  };

  // Validate referral code
  const validateReferralCode = (code) => {
    if (!code) return true; // Optional field
    
    if (!isValidReferralFormat(code)) {
      setReferralError("Invalid referral code format (must start with APL-)");
      return false;
    }
    
    setReferralError("");
    return true;
  };

  // Handle Email/Password Sign-Up
  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    
    if (referralCode && !validateReferralCode(referralCode)) {
      return; // Stop if referral code is invalid
    }
    
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);

      // Generate a referral code for this user
      const userReferralCode = generateReferralCode(result.user.uid);

      // Create user document
      const userDoc = doc(db, "users", result.user.uid);
      await setDoc(userDoc, {
        name,
        email: result.user.email,
        photoURL: null,
        createdAt: new Date(),
        // Fantasy cricket specific fields
        registrationDate: new Date(),
        referralCode: userReferralCode,
        referrals: [],
        referralPoints: 0,
        totalPoints: 0,
        rank: 0
      });

      // Initialize user's tournament stats if there's an active tournament
      await FantasyService.initializeUserTournamentStats(result.user.uid, "bbl-2024");

      // Process referral if provided
      if (referralCode) {
        await transferService.processReferral(result.user.uid, referralCode);
      }

      console.log("Sign-Up successful!");
      router.push("/profile"); // Redirect to profile page to complete setup
    } catch (error) {
      console.error("Sign-Up error:", error);
      setError(error.message);
    }
  };

  // Modified Google Sign-In handler
  const handleGoogleSignIn = async () => {
    setError("");
    setSuccessMessage("");
    if (googleReferralCode && !validateGoogleReferralCode(googleReferralCode)) {
      return; // Stop if referral code is invalid
    }
    const provider = new GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    provider.setCustomParameters({
      prompt: "select_account"
    });

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user already exists
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      const isNewUser = !userDoc.exists();

      // Generate a referral code for this user
      const userReferralCode = generateReferralCode(user.uid);

      // Create/update user document
      await setDoc(userDocRef, {
        name: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        createdAt: new Date(),
        // Fantasy cricket specific fields
        registrationDate: new Date(),
        referralCode: userReferralCode,
        referrals: userDoc.exists() ? userDoc.data().referrals || [] : [],
        referralPoints: userDoc.exists() ? userDoc.data().referralPoints || 0 : 0,
        totalPoints: userDoc.exists() ? userDoc.data().totalPoints || 0 : 0,
        rank: 0
      }, { merge: true });

      // Initialize user's tournament stats if there's an active tournament and this is a new user
      if (isNewUser) {
        await FantasyService.initializeUserTournamentStats(user.uid, "bbl-2024");
        
        // Process referral if provided
        if (googleReferralCode) {
          await transferService.processReferral(user.uid, googleReferralCode);
        }
        
        router.push("/profile"); // New users go to profile setup
      } else {
        router.push("/profile"); // Existing users go to profile
      }
    } catch (error) {
      console.error("Google Sign-In error:", error);
      setError(error.message);
    }
  };

  // Handle Password Reset
  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    
    if (!resetEmail) {
      setError("Please enter your email address");
      return;
    }
    
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setSuccessMessage("Password reset email sent! Check your inbox.");
      
      // Reset form after successful submission
      setTimeout(() => {
        if (successMessage) {
          setShowResetForm(false);
          setResetEmail("");
          setSuccessMessage("");
        }
      }, 3000);
    } catch (error) {
      console.error("Password reset error:", error);
      setError(error.message);
    }
  };

  // Toggle to reset password form
  const showPasswordReset = () => {
    setShowResetForm(true);
    setResetEmail(email); // Pre-fill with login email if available
    setError("");
    setSuccessMessage("");
  };

  // Go back to login from reset form
  const hidePasswordReset = () => {
    setShowResetForm(false);
    setError("");
    setSuccessMessage("");
  };

  return (
    <div className={styles.wrapper}>
      {showResetForm && (
        <div className={styles.resetPasswordContainer}>
          <div className={styles.resetPasswordForm}>
            <div className={styles.title}>Reset Password</div>
            <form onSubmit={handlePasswordReset}>
              <div className={styles.inputGroup}>
                <input
                  className={styles["flip-card__input"]}
                  name="resetEmail"
                  placeholder="Your Email"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </div>
              
              {error && <p className={styles["error-message"]}>{error}</p>}
              {successMessage && <p className={styles["success-message"]}>{successMessage}</p>}
              
              <div className={styles.resetButtonGroup}>
                <button type="submit" className={styles["flip-card__btn"]}>
                  Send Reset Link
                </button>
                <button 
                  type="button" 
                  className={styles.secondaryBtn}
                  onClick={hidePasswordReset}
                >
                  Back to Login
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={styles["card-switch"]}>
        <label className={styles.switch}>
          <input 
            type="checkbox" 
            className={styles.toggle} 
            onChange={toggleForm} 
            checked={isSignUp}
          />
          <span className={styles["card-side"]}></span>
          <div className={styles["flip-card__inner"]}>
            {/* Login Form */}
            <div className={styles["flip-card__front"]}>
              <div className={styles.title}>Log in</div>
              <form className={styles["flip-card__form"]} onSubmit={handleLogin}>
                <input
                  className={styles["flip-card__input"]}
                  name="email"
                  placeholder="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className={styles["flip-card__input"]}
                  name="password"
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className={styles.forgotPassword}>
                  <button 
                    type="button" 
                    onClick={showPasswordReset}
                    className={styles.forgotPasswordLink}
                  >
                    Forgot Password?
                  </button>
                </div>
                {error && <p className={styles["error-message"]}>{error}</p>}
                {successMessage && <p className={styles["success-message"]}>{successMessage}</p>}
                <button type="submit" className={styles["flip-card__btn"]}>Log In</button>
              </form>
              <button
                className={styles["google-btn"]}
                onClick={handleGoogleSignIn}
              >
                Login with Google
              </button>
            </div>

            {/* Sign-Up Form */}
            <div className={styles["flip-card__back"]}>
              <div className={styles.title}>Sign up</div>
              <form className={styles["flip-card__form"]} onSubmit={handleSignUp}>
                <input
                  className={styles["flip-card__input"]}
                  placeholder="Name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className={styles["flip-card__input"]}
                  name="email"
                  placeholder="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className={styles["flip-card__input"]}
                  name="password"
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <input
                  className={styles["flip-card__input"]}
                  name="referralCode"
                  placeholder="Referral Code (Optional)"
                  type="text"
                  value={referralCode}
                  onChange={(e) => {
                    setReferralCode(e.target.value);
                    validateReferralCode(e.target.value);
                  }}
                />
                {referralError && <p className={styles["error-message"]}>{referralError}</p>}
                {error && <p className={styles["error-message"]}>{error}</p>}
                {successMessage && <p className={styles["success-message"]}>{successMessage}</p>}
                <button type="submit" className={styles["flip-card__btn"]}>Sign Up</button>
              </form>
              <div>
                <input
                  className={styles["flip-card__input"]}
                  name="googleReferralCode"
                  placeholder="Referral Code (Optional)"
                  type="text"
                  value={googleReferralCode}
                  onChange={(e) => setGoogleReferralCode(e.target.value)}
                />
                {referralError && <p className={styles["error-message"]}>{referralError}</p>}
                <button
                  type="button"
                  className={styles["google-btn"]}
                  onClick={handleGoogleSignIn}
                >
                  Sign up with Google
                </button>
              </div>
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}
