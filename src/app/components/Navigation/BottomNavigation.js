"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/authContext";
import HamburgerMenu from "./HamburgerMenu";
import styles from "./BottomNavigation.module.css";

const BottomNavigation = () => {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading) return null;

  const loggedInLinks = [
    { label: "Dashboard", href: "/dashboard", icon: "🏠" },
    { label: "Leaderboard", href: "/leaderboard", icon: "📊" },
    { label: "Player Performance", href: "/player-performance", icon: "⚾" },
    { 
      label: "Settings", 
      href: "/settings", 
      icon: user?.photoURL ? (
        <Image
          src={user.photoURL}
          alt="Profile"
          width={24}
          height={24}
          className={styles.profileImage}
        />
      ) : "⚙️"
    },
  ];

  const nonLoggedInLinks = [
    { label: "Homepage", href: "/", icon: "🏠" },
    { label: "Login/Sign-Up", href: "/login", icon: "🔑" },
    { label: "About APL", href: "/about-apl", icon: "ℹ️" },
    { label: "Point System", href: "/point-system", icon: "📋" },
  ];

  const links = user ? loggedInLinks : nonLoggedInLinks;

  const handleNavigation = (href) => {
    router.push(href);
  };

  return (
    <nav className={styles.bottomNav}>
      {links.map((link) => (
        <button
          key={link.label}
          onClick={() => handleNavigation(link.href)}
          className={styles.navItem}
        >
          <span className={styles.icon}>
            {typeof link.icon === "string" ? link.icon : link.icon}
          </span>
          <span className={styles.label}>{link.label}</span>
        </button>
      ))}
      <HamburgerMenu />
    </nav>
  );
};

export default BottomNavigation;
