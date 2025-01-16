"use client";

import React, { useState } from "react";
import { useAuth } from "@/app/context/authContext";
import styles from "./HamburgerMenu.module.css";

const HamburgerMenu = () => {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleToggle = () => setMenuOpen(!menuOpen);

  const loggedInMenu = [
    { label: "About APL", href: "/about-apl" },
    { label: "Logout", href: "/", onClick: logout },
  ];

  const nonLoggedInMenu = [
    { label: "Other Info", href: "/other-info" },
  ];

  const menuLinks = user ? loggedInMenu : nonLoggedInMenu;

  return (
    <div className={styles.hamburger}>
      <div className={styles.hamburgerIcon} onClick={handleToggle}>
        <span></span>
        <span></span>
        <span></span>
      </div>
      {menuOpen && (
        <div className={styles.menu}>
          <ul>
            {menuLinks.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  onClick={(e) => {
                    if (item.onClick) {
                      e.preventDefault();
                      item.onClick();
                    }
                    handleToggle();
                  }}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default HamburgerMenu;
