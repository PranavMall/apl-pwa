"use client";

import React, { useContext, useState } from "react";
import Link from "next/link";
import styles from "./HamburgerMenu.module.css";
import { AuthContext } from "@/app/context/authContext";

export default function HamburgerMenu() {
  const { user, logout } = useContext(AuthContext);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuToggle = () => setMenuOpen(!menuOpen);

  const loggedInLinks = [
    { label: "About APL", href: "/about-apl" },
    { label: "Logout", href: "#", onClick: logout },
  ];

  const nonLoggedInLinks = [
    { label: "About APL", href: "/about-apl" },
    { label: "Point System", href: "/point-system" },
  ];

  return (
    <div>
      <button className={styles.hamburgerButton} onClick={handleMenuToggle}>
        ☰
      </button>
      {menuOpen && (
        <div className={styles.hamburgerMenu}>
          <ul>
            {(user ? loggedInLinks : nonLoggedInLinks).map((link) => (
              <li key={link.label}>
                {link.onClick ? (
                  <button onClick={link.onClick}>{link.label}</button>
                ) : (
                  <Link href={link.href}>{link.label}</Link>
                )}
              </li>
            ))}
          </ul>
          <div
            className={styles.overlay}
            onClick={handleMenuToggle}
          ></div>
        </div>
      )}
    </div>
  );
}
