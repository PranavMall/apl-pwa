"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css"; // Import the CSS module

export default function LoginPage() {
  const router = useRouter(); // For navigation
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Simulated login logic
  const handleLogin = async (e) => {
    e.preventDefault(); // Prevent page reload
    try {
      if (email === "user@example.com" && password === "password123") {
        console.log("Login successful");
        router.push("/dashboard"); // Redirect to the dashboard
      } else {
        throw new Error("Invalid email or password");
      }
    } catch (error) {
      setErrorMessage(error.message);
    }
  };

  return (
    <div className={styles["auth-container"]}>
      <header className={styles.header}>
        <img
          src="/apl-logo.png" // Replace with your actual logo path
          alt="Apna Premier League"
          className={styles.logo}
        />
      </header>

      <div className={styles["auth-card"]}>
        <h2>Welcome to Apna Premier League</h2>
        <p>Please log in to continue</p>

        <form className={styles["auth-form"]} onSubmit={handleLogin}>
          <div className={styles["input-group"]}>
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles["input-group"]}>
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {/* Display Error Message */}
          {errorMessage && <p className={styles["error-message"]}>{errorMessage}</p>}

          <button type="submit" className={styles["auth-button"]}>
            Log In
          </button>
        </form>

        <p className={styles["signup-text"]}>
          Don't have an account? <a href="#">Sign Up</a>
        </p>
      </div>
    </div>
  );
}