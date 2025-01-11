"use client";

import React, { useState } from "react";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "../../firebase"; // Ensure this path is correct
import styles from "./page.module.css"; // Import the updated CSS module

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false); // Toggle between login and sign-up
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // Toggle between Login and Sign-Up
  const toggleForm = () => setIsSignUp(!isSignUp);

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log("Login successful!");
      router.push("/dashboard"); // Redirect to dashboard
    } catch (error) {
      setError(error.message);
    }
  };

  // Handle Sign-Up
  const handleSignUp = async (e) => {
    e.preventDefault();
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      console.log("Sign-Up successful!");
      router.push("/dashboard"); // Redirect to dashboard
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles["card-switch"]}>
        <label className={styles.switch}>
          <input type="checkbox" className={styles.toggle} onChange={toggleForm} />
          <div className={styles["flip-card__inner"]}>
            {/* Login Card */}
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
            </div>

            {/* Sign-Up Card */}
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
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}