"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/authContext";
import { auth } from "@/firebase";
import { signOut } from "firebase/auth";
import styles from "./HamburgerMenu.module.css";

const HamburgerMenu = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleToggle = () => setMenuOpen(!menuOpen);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
      setMenuOpen(false);
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const loggedInMenu = [
    { label: "About APL", href: "/about-apl" },
    { label: "Point System", href: "/point-system" },
    { label: "Logout", onClick: handleLogout }
  ];

  const nonLoggedInMenu = [
    { label: "About APL", href: "/about-apl" },
    { label: "Point System", href: "/point-system" }
  ];

  const menuLinks = user ? loggedInMenu : nonLoggedInMenu;

  const handleClick = (item) => {
    if (item.onClick) {
      item.onClick();
    } else {
      router.push(item.href);
    }
    setMenuOpen(false);
  };

  return (
    <div className={styles.hamburger}>
      <button className={styles.hamburgerIcon} onClick={handleToggle}>
        <span></span>
        <span></span>
        <span></span>
      </button>
      {menuOpen && (
        <>
          <div className={styles.menuOverlay} onClick={handleToggle} />
          <div className={styles.menu}>
            <ul>
              {menuLinks.map((item) => (
                <li key={item.label}>
                  <button
                    onClick={() => handleClick(item)}
                    className={styles.menuItem}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default HamburgerMenu;
