"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "../context/authContext"; // Adjust the path as necessary
import HamburgerMenu from "./HamburgerMenu"; // Reusable hamburger menu component
import styles from "./BottomNavigation.module.css";

export default function BottomNavigation() {
  const { user } = useAuth();
  const isLoggedIn = !!user;

  // Links for logged-in and non-logged-in users
  const loggedInLinks = [
    { label: "Dashboard", href: "/dashboard", icon: "🏠" },
    { label: "Leaderboard", href: "/leaderboard", icon: "📊" },
    { label: "Player Performance", href: "/player-performance", icon: "⚾" },
    { label: "Settings", href: "/settings", icon: "⚙️" },
  ];

  const nonLoggedInLinks = [
    { label: "Homepage", href: "/", icon: "🏠" },
    { label: "Login/Sign-Up", href: "/login", icon: "🔑" },
    { label: "About APL", href: "/about", icon: "ℹ️" },
    { label: "Point System", href: "/point-system", icon: "📚" },
  ];

  return (
    <nav className={styles.bottomNav}>
      <div className={styles.links}>
        {(isLoggedIn ? loggedInLinks : nonLoggedInLinks).map((link) => (
          <Link key={link.label} href={link.href}>
            <div className={styles.linkItem}>
              <span className={styles.icon}>{link.icon}</span>
              <span>{link.label}</span>
            </div>
          </Link>
        ))}
      </div>
      <HamburgerMenu isLoggedIn={isLoggedIn} />
    </nav>
  );
}
