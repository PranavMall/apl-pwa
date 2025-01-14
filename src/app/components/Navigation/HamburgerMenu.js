"use client";

import React, { useState } from "react";
import Link from "next/link";
import styles from "./HamburgerMenu.module.css";
import { useAuth } from "@/app/context/authContext";

export default function HamburgerMenu() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuToggle = () => setMenuOpen(!menuOpen);

  const loggedInLinks = [
    { label: "About APL", href: "/about-apl" },
    { label: "Logout", action: logout }, // Logout triggers the `logout` function
  ];

  const nonLoggedInLinks = [
    { label: "About APL", href: "/about-apl" },
    { label: "Other Info", href: "/other-info" },
  ];

  return (
    <>
      {/* Hamburger Icon */}
      <div className={styles.hamburger} onClick={handleMenuToggle}>
        <span></span>
        <span></span>
        <span></span>
      </div>

      {/* Hamburger Menu */}
      <div
        className={`${styles.hamburgerMenu} ${
          menuOpen ? styles.active : ""
        }`}
      >
        <ul>
          {(user ? loggedInLinks : nonLoggedInLinks).map((item, index) => (
            <li key={index}>
              {item.href ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <button onClick={item.action} className={styles.logoutButton}>
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Overlay to close menu */}
      {menuOpen && (
        <div
          className={styles.menuOverlay}
          onClick={handleMenuToggle}
        ></div>
      )}
    </>
  );
}
