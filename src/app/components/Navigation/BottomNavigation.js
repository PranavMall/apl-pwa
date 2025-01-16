"use client";

import React from "react";
import { useAuth } from "@/app/context/authContext";
import HamburgerMenu from "./HamburgerMenu";
import styles from "./BottomNavigation.module.css";

const BottomNavigation = () => {
  const { user, loading } = useAuth();

  if (loading) return null;

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
    { label: "Point System", href: "/point-system", icon: "📋" },
  ];

  const links = user ? loggedInLinks : nonLoggedInLinks;

  return (
    <div className={styles.bottomNav}>
      {links.map((link) => (
        <a key={link.label} href={link.href} className={styles.navItem}>
          <span className={styles.icon}>{link.icon}</span>
          <span className={styles.label}>{link.label}</span>
        </a>
      ))}
      <HamburgerMenu />
    </div>
  );
};

export default BottomNavigation;
