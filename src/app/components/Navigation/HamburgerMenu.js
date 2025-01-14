"use client";

import React, { useState } from "react";
import Link from "next/link";
import styles from "./HamburgerMenu.module.css";

export default function HamburgerMenu({ isLoggedIn }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = () => setMenuOpen(!menuOpen);

  const loggedInMenu = [
    { label: "About APL", href: "/about" },
    { label: "Logout", href: "/logout" },
  ];

  const nonLoggedInMenu = [
    { label: "Other Info", href: "/info" },
  ];

  return (
    <>
      <div className={styles.hamburgerIcon} onClick={toggleMenu}>
        <span></span>
        <span></span>
        <span></span>
      </div>
      {menuOpen && (
        <div className={styles.menuOverlay} onClick={toggleMenu}>
          <div className={styles.menu}>
            <ul>
              {(isLoggedIn ? loggedInMenu : nonLoggedInMenu).map((item) => (
                <li key={item.label}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
