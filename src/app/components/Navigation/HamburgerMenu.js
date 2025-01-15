"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "../../context/authContext";
import styles from "./HamburgerMenu.module.css";

export default function HamburgerMenu({ isLoggedIn }) {
  const { logout } = useAuth();

  const loggedInMenu = [
    { label: "About APL", href: "/about-apl", icon: "ℹ️" },
    { label: "Logout", onClick: logout, icon: "🚪" },
  ];

  const nonLoggedInMenu = [
    { label: "About APL", href: "/about-apl", icon: "ℹ️" },
    { label: "Other Info", href: "/info", icon: "📚" },
  ];

  const menuItems = isLoggedIn ? loggedInMenu : nonLoggedInMenu;

  return (
    <div className={styles.hamburgerMenu}>
      <ul>
        {menuItems.map((item) =>
          item.onClick ? (
            <li key={item.label} onClick={item.onClick} className={styles.menuItem}>
              <span>{item.icon}</span> {item.label}
            </li>
          ) : (
            <li key={item.label}>
              <Link href={item.href}>
                <span>{item.icon}</span> {item.label}
              </Link>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
