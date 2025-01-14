"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/app/context/authContext";
import HamburgerMenu from "./HamburgerMenu";
import styles from "./BottomNavigation.module.css";

export default function BottomNavigation() {
  const { user, loading } = useAuth();

  if (loading) {
    // While user authentication state is loading, show nothing or a placeholder
    return null;
  }

  const loggedInLinks = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Leaderboard", href: "/leaderboard" },
    { label: "Player Performance", href: "/player-performance" },
    { label: "Settings", href: "/settings" },
  ];

  const nonLoggedInLinks = [
    { label: "Homepage", href: "/" },
    { label: "Login/Sign-Up", href: "/login" },
    { label: "About APL", href: "/about-apl" },
    { label: "Point System", href: "/point-system" },
  ];

  return (
    <nav className={styles.bottomNav}>
      <div className={styles.navLinks}>
        {(user ? loggedInLinks : nonLoggedInLinks).map((item) => (
          <Link key={item.label} href={item.href} className={styles.navLink}>
            {item.label}
          </Link>
        ))}
      </div>

      {/* Hamburger Menu */}
      <div className={styles.hamburgerWrapper}>
        <HamburgerMenu />
      </div>
    </nav>
  );
}
