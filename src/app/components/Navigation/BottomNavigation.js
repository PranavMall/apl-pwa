"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "../context/authContext";
import HamburgerMenu from "./HamburgerMenu";
import styles from "./BottomNavigation.module.css";

export default function BottomNavigation() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  const loggedInLinks = [
    { label: "Dashboard", href: "/dashboard", icon: "🏠" },
    { label: "Leaderboard", href: "/leaderboard", icon: "📊" },
    { label: "Player Performance", href: "/player-performance", icon: "⚾" },
    { label: "Settings", href: "/settings", icon: "⚙️" },
  ];

  const nonLoggedInLinks = [
    { label: "Homepage", href: "/", icon: "🏠" },
    { label: "Login/Sign-Up", href: "/login", icon: "🔑" },
    { label: "About APL", href: "/about-apl", icon: "ℹ️" },
    { label: "Point System", href: "/point-system", icon: "📜" },
  ];

  return (
    <nav className={styles.bottomNav}>
      <div className={styles.navLinks}>
        {(user ? loggedInLinks : nonLoggedInLinks).map((item) => (
          <Link key={item.label} href={item.href} className={styles.navLink}>
            <span>{item.icon}</span> {item.label}
          </Link>
        ))}
      </div>

      <HamburgerMenu isLoggedIn={!!user} />
    </nav>
  );
}
