"use client";

import React, { useState } from "react";
import Link from "next/link";
import styles from "./Navigation.module.css";

export default function Navigation({ isLoggedIn, user }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuToggle = () => setMenuOpen(!menuOpen);

  const loggedInLinks = [
    { label: "Home/Dashboard", href: "/" },
    { label: "Player Performance", href: "/player-performance" },
    { label: "Team Performance", href: "/team-performance" },
    { label: "Leaderboard", href: "/leaderboard" },
    { label: "Transfer Window", href: "/transfer-window" },
    { label: "About APL", href: "/about" },
    { label: "Point System", href: "/point-system" },
  ];

  const nonLoggedInLinks = [
    { label: "About APL", href: "/about" },
    { label: "Point System", href: "/point-system" },
  ];

  return (
    <>
      <nav className={styles.navbar}>
        <div className={styles.hamburger} onClick={handleMenuToggle}>
          <span></span>
          <span></span>
          <span></span>
        </div>
        {isLoggedIn ? (
          <div className={styles.profile}>
            <img
              src={user?.photoURL || "/default-avatar.png"}
              alt="User Profile"
            />
          </div>
        ) : (
          <div className={styles.authLinks}>
            <Link href="/login">Login</Link>
            <Link href="/signup">Sign Up</Link>
          </div>
        )}
      </nav>

      {/* Hamburger Menu */}
      <div
        className={`${styles.hamburgerMenu} ${
          menuOpen ? styles.active : ""
        }`}
      >
        <ul>
          {(isLoggedIn ? loggedInLinks : nonLoggedInLinks).map((link) => (
            <li key={link.label}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Overlay */}
      <div
        className={`${styles.menuOverlay} ${
          menuOpen ? styles.active : ""
        }`}
        onClick={handleMenuToggle}
      ></div>
    </>
  );
}
