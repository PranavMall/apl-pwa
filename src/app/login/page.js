"use client";

import React, { useState } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "../../firebase"; // Adjust path to your firebase.js and Firestore initialization
import styles from "./page.module.css";
import { FantasyService } from "../services/fantasyService";

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false); // Toggle between login and sign-up
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // Toggle between Login and Sign-Up forms
  const toggleForm = () => setIsSignUp(!isSignUp);

  // Handle Email/Password Login
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log("Login successful!");
      router.push("/dashboard"); // Redirect to the dashboard
    } catch (error) {
      console.error("Login error:", error);
      setError(error.message);
    }
  };

  // Handle Email/Password Sign-Up
const handleSignUp = async (e) => {
    e.preventDefault();
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);

      // Create user document
      const userDoc = doc(db, "users", result.user.uid);
      await setDoc(userDoc, {
        name,
        email: result.user.email,
        photoURL: null,
        createdAt: new Date(),
        // Fantasy cricket specific fields
        registrationDate: new Date(),
        referralCount: 0,
        totalPoints: 0,
        rank: 0
      });

      // Initialize user's tournament stats if there's an active tournament
      // You might want to check for active tournaments first
      await FantasyService.initializeUserTournamentStats(result.user.uid, "bbl-2024");

      console.log("Sign-Up successful!");
      router.push("/dashboard");
    } catch (error) {
      console.error("Sign-Up error:", error);
      setError(error.message);
    }
  };

  // Modified Google Sign-In handler
  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    provider.setCustomParameters({
      prompt: "select_account"
    });

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Create/update user document
      const userDoc = doc(db, "users", user.uid);
      await setDoc(userDoc, {
        name: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        createdAt: new Date(),
        // Fantasy cricket specific fields
        registrationDate: new Date(),
        referralCount: 0,
        totalPoints: 0,
        rank: 0
      }, { merge: true });

      // Initialize user's tournament stats if there's an active tournament
      await FantasyService.initializeUserTournamentStats(user.uid, "bbl-2024");

      console.log("Google Sign-In successful!");
      router.push("/dashboard");
    } catch (error) {
      console.error("Google Sign-In error:", error);
      setError(error.message);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles["card-switch"]}>
        <label className={styles.switch}>
          <input type="checkbox" className={styles.toggle} onChange={toggleForm} />
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
                {error && <p className={styles["error-message"]}>{error}</p>}
                <button className={styles["flip-card__btn"]}>Log In</button>
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
                {error && <p className={styles["error-message"]}>{error}</p>}
                <button className={styles["flip-card__btn"]}>Sign Up</button>
              </form>
              <button
                className={styles["google-btn"]}
                onClick={handleGoogleSignIn}
              >
                Sign up with Google
              </button>
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}
