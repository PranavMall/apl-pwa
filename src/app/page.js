'use client'; // Add this at the top to mark as a client component

import React, { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './page.module.css';
import { trackAppInstall } from './pwa-install';

export default function Home() {
  // Use useEffect to run client-side only code
  useEffect(() => {
    // This will only run in the browser
    const handleAppInstalled = (event) => {
      logAppInstall();
    };
    
    window.addEventListener('appinstalled', handleAppInstalled);
    
    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logoContainer}>
          <Image
            src="/images/APL.png"
            alt="APL Logo"
            width={80}
            height={80}
            className={styles.logo}
            priority
          />
          <h1 className={styles.title}>Apna Premier League</h1>
        </div>
        <p className={styles.subtitle}>Fantasy Cricket at its Finest</p>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>APL 2025</h1>
            <p className={styles.heroDescription}>
              Create your dream cricket team. Compete with friends. Win big!
            </p>
            <div className={styles.ctas}>
              <Link href="/login" className={`${styles.button} ${styles.primary}`}>
                Sign Up / Login
              </Link>
              <Link href="/about-apl" className={`${styles.button} ${styles.secondary}`}>
                Learn More
              </Link>
            </div>
          </div>
          <div className={styles.heroImage}>
            <Image 
              src="/images/hero.jpg" 
              alt="Cricket Players" 
              width={500} 
              height={300}
              className={styles.image}
            />
          </div>
        </section>

        <section className={styles.features}>
          <h2 className={styles.sectionTitle}>Why Play APL Fantasy Cricket?</h2>
          
          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🏏</div>
              <h3>Build Your Dream Team</h3>
              <p>Select from international cricket stars and create a balanced team of batsmen, bowlers, all-rounders, and wicket-keepers.</p>
            </div>
            
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>📊</div>
              <h3>Live Scoring</h3>
              <p>Watch your players earn points in real-time based on their actual performance in matches.</p>
            </div>
            
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🏆</div>
              <h3>Weekly Competitions</h3>
              <p>Compete in weekly leaderboards and track your progress throughout the tournament.</p>
            </div>
            
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🔄</div>
              <h3>Transfer Windows</h3>
              <p>Strategically update your team during transfer windows to maximize points and stay competitive.</p>
            </div>
            
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>👨‍👩‍👧‍👦</div>
              <h3>Invite Friends</h3>
              <p>Refer friends to join the league and earn bonus points to boost your standing.</p>
            </div>
            
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>📱</div>
              <h3>Mobile Friendly</h3>
              <p>Manage your team anytime, anywhere with our responsive mobile interface.</p>
            </div>
          </div>
        </section>

        <section className={styles.howItWorks}>
          <h2 className={styles.sectionTitle}>How It Works</h2>
          
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3>Sign Up</h3>
              <p>Create your account and join the Apna Premier League.</p>
            </div>
            
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3>Build Your Team</h3>
              <p>Select 11 players within the given constraints (4 batsmen, 4 bowlers, 2 all-rounders, 1 wicket-keeper).</p>
            </div>
            
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3>Choose Captain & Vice-Captain</h3>
              <p>Pick your captain (2x points) and vice-captain (1.5x points) strategically.</p>
            </div>
            
            <div className={styles.step}>
              <div className={styles.stepNumber}>4</div>
              <h3>Earn Points</h3>
              <p>Your players earn points based on their real-world performance in matches.</p>
            </div>
            
            <div className={styles.step}>
              <div className={styles.stepNumber}>5</div>
              <h3>Make Transfers</h3>
              <p>Update your team during transfer windows to adapt to player form and fixtures.</p>
            </div>
          </div>
        </section>

        <section className={styles.pointSystem}>
          <h2 className={styles.sectionTitle}>Point System Highlights</h2>
          
          <div className={styles.pointCategories}>
            <div className={styles.pointCategory}>
              <h3>Batting</h3>
              <ul className={styles.pointList}>
                <li>Run: 1 point</li>
                <li>Boundary: 1 point</li>
                <li>Six: 2 points</li>
                <li>Half-Century: 8 points</li>
                <li>Century: 16 points</li>
              </ul>
            </div>
            
            <div className={styles.pointCategory}>
              <h3>Bowling</h3>
              <ul className={styles.pointList}>
                <li>Wicket: 25 points</li>
                <li>3 Wickets: 8 bonus points</li>
                <li>4 Wickets: 16 bonus points</li>
                <li>5 Wickets: 25 bonus points</li>
                <li>Maiden Over: 8 points</li>
              </ul>
            </div>
            
            <div className={styles.pointCategory}>
              <h3>Fielding</h3>
              <ul className={styles.pointList}>
                <li>Catch: 8 points</li>
                <li>Stumping: 12 points</li>
                <li>Run Out: 12 points</li>
                <li>Playing XI: 5 points</li>
                <li>Captain: 2x multiplier</li>
              </ul>
            </div>
          </div>
          
          <Link href="/point-system" className={styles.viewMoreLink}>
            View Full Point System
          </Link>
        </section>

        <section className={styles.callToAction}>
          <div className={styles.ctaContent}>
            <h2>Ready to join APL 2025?</h2>
            <p>Sign up today and start building your dream team!</p>
            <Link href="/login" className={`${styles.button} ${styles.ctaButton}`}>
              Get Started Now
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerLogo}>
            <Image
              src="/cricket-logo.png"
              alt="APL Logo"
              width={50}
              height={50}
              className={styles.logo}
            />
            <p>Apna Premier League</p>
          </div>
          
          <div className={styles.footerLinks}>
            <div className={styles.linkColumn}>
              <h4>About</h4>
              <Link href="/about-apl">About APL</Link>
              <Link href="/point-system">Point System</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/privacy">Privacy Policy</Link>
            </div>
            
            <div className={styles.linkColumn}>
              <h4>Help</h4>
              <Link href="/faq">FAQ</Link>
              <Link href="/contact">Contact Us</Link>
              <Link href="/rules">Rules</Link>
            </div>
            
            <div className={styles.linkColumn}>
              <h4>Follow Us</h4>
              <Link href="https://twitter.com/aplcricket">Twitter</Link>
              <Link href="https://facebook.com/aplcricket">Facebook</Link>
              <Link href="https://instagram.com/aplcricket">Instagram</Link>
            </div>
          </div>
        </div>
        
        <div className={styles.footerBottom}>
          <p>&copy; 2025 Apna Premier League. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
