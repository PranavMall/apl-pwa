"use client";

import React, { useState, useContext } from "react";
import Link from "next/link";
import styles from "./Navigation.module.css";
import { AuthContext } from "@/app/context/authContext";

export default function Navigation() {
  const { user, logout, loading } = useContext(AuthContext);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuToggle = () => setMenuOpen(!menuOpen);

  const loggedInLinks = [
    { label: "Dashboard", href: "/dashboard", icon: "🏠" },
    { label: "Leaderboard", href: "/leaderboard", icon: "📊" },
    { label: "Player Performance", href: "/player-performance", icon: "⚾" },
    { label: "Settings", href: "/settings", icon: "⚙️" },
  ];

  const nonLoggedInLinks = [
    { label: "Homepage", href: "/" },
    { label: "Login/Sign-Up", href: "/login" },
    { label: "About APL", href: "/about-apl" },
    { label: "Point System", href: "/point-system" },
  ];

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <nav className={styles.navbar}>
      <ul className={styles.navLinks}>
        {(user ? loggedInLinks : nonLoggedInLinks).map((link) => (
          <li key={link.label}>
            <Link href={link.href}>
              {link.icon} {link.label}
            </Link>
          </li>
        ))}
        {user && (
          <li>
            <button onClick={logout} className={styles.logout}>
              Logout
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}
