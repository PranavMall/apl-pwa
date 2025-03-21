"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './about.module.css';

export default function AboutAPLPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    supportType: 'collaboration',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Here you would normally send the data to your backend
      // For now, we'll simulate a successful submission
      await new Promise(resolve => setTimeout(resolve, 1500));
      setSubmitted(true);
      
      // Optional: Send to a service like EmailJS or your own API endpoint
      // await fetch('/api/support-request', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(formData)
      // });
    } catch (err) {
      setError('Failed to submit form. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
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
          <h1 className={styles.title}>About Apna Premier League</h1>
        </div>
        <p className={styles.subtitle}>The Journey and Vision</p>
      </header>

      <main className={styles.main}>
        <section className={styles.aboutSection}>
          <div className={styles.sectionContent}>
            <h2 className={styles.sectionTitle}>The APL Story</h2>
            <p>
              What began as a basic form last year has evolved into a full-fledged Progressive Web App. 
              After countless late nights, 130+ error-filled deployments, and dreams quite literally filled 
              with code fixes, Apna Premier League Fantasy Cricket was born.
            </p>
            <p>
              The journey wasn't always smooth - working full-time during the day while coding through the night 
              became a routine. Through testing during the Big Bash League, New Zealand's tour, and the ICC Champions 
              Trophy, each tournament brought new challenges and opportunities for refinement.
            </p>
            <p>
              What makes this project special is that it was created without financial investment - just time, 
              persistence, and a passion for cricket. From navigating the complexities of processing real-time 
              data to designing responsive interfaces, every challenge has been part of the learning journey.
            </p>
          </div>
          <div className={styles.imageContainer}>
            <Image 
              src="/images/hero.jpg" 
              alt="Cricket Players" 
              width={400} 
              height={300}
              className={styles.sectionImage}
            />
          </div>
        </section>

        <section className={styles.featuresSection}>
          <h2 className={styles.sectionTitle}>Platform Features</h2>
          
          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>👤</div>
              <h3>User Registrations</h3>
              <p>Create your account, set up your profile, and join the league.</p>
            </div>
            
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🏏</div>
              <h3>Match Tracking</h3>
              <p>Follow live matches and see how your players are performing.</p>
            </div>
            
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>📊</div>
              <h3>Player Stats</h3>
              <p>Detailed performance statistics for all players in the tournament.</p>
            </div>
            
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🏆</div>
              <h3>Leaderboards</h3>
              <p>Compete with others and track your ranking on weekly leaderboards.</p>
            </div>
            
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🔄</div>
              <h3>Transfer Windows</h3>
              <p>Strategically update your team during designated transfer periods.</p>
            </div>
            
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>👥</div>
              <h3>Referral System</h3>
              <p>Invite friends to join and earn bonus points for your team.</p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>⚙️</div>
              <h3>Team Management</h3>
              <p>Build your dream team with a balanced selection of players.</p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>📱</div>
              <h3>Progressive Web App</h3>
              <p>Install on your device for a native app-like experience.</p>
            </div>
          </div>
        </section>

        <section className={styles.visionSection}>
          <div className={styles.sectionContent}>
            <h2 className={styles.sectionTitle}>The Vision Ahead</h2>
            <p>
              While APL has come a long way, the journey is far from over. The platform continues 
              to evolve with new features, improved performance, and enhanced user experience.
            </p>
            <p>
              The vision for APL goes beyond just being another fantasy cricket platform. It aims to create 
              a community of cricket enthusiasts who can engage with the sport in a more interactive and 
              rewarding way.
            </p>
            <p>
              Future plans include private leagues for friends and family, more comprehensive 
              statistics and analytics, and expanded coverage of cricket tournaments worldwide.
            </p>
          </div>
        </section>

        <section className={styles.timelineSection}>
          <h2 className={styles.sectionTitle}>Development Timeline</h2>
          
          <div className={styles.timeline}>
            <div className={styles.timelineItem}>
              <div className={styles.timelineDot}></div>
              <div className={styles.timelineContent}>
                <h3>Initial Concept</h3>
                <p>A basic form-based approach to fantasy cricket scoring.</p>
                <span className={styles.timelineDate}>2023</span>
              </div>
            </div>
            
            <div className={styles.timelineItem}>
              <div className={styles.timelineDot}></div>
              <div className={styles.timelineContent}>
                <h3>First Prototype</h3>
                <p>Development of core functionality and basic UI.</p>
                <span className={styles.timelineDate}>Early 2024</span>
              </div>
            </div>
            
            <div className={styles.timelineItem}>
              <div className={styles.timelineDot}></div>
              <div className={styles.timelineContent}>
                <h3>Testing Phase</h3>
                <p>Live testing during Big Bash League and New Zealand Tour.</p>
                <span className={styles.timelineDate}>Q1 2024</span>
              </div>
            </div>
            
            <div className={styles.timelineItem}>
              <div className={styles.timelineDot}></div>
              <div className={styles.timelineContent}>
                <h3>Progressive Web App</h3>
                <p>Transformation into a full-featured PWA with enhanced capabilities.</p>
                <span className={styles.timelineDate}>Q2 2024</span>
              </div>
            </div>
            
            <div className={styles.timelineItem}>
              <div className={styles.timelineDot}></div>
              <div className={styles.timelineContent}>
                <h3>Public Launch</h3>
                <p>Official release of APL to the cricket community.</p>
                <span className={styles.timelineDate}>March 2025</span>
              </div>
            </div>
            
            <div className={styles.timelineItem}>
              <div className={styles.timelineDot}></div>
              <div className={styles.timelineContent}>
                <h3>Future Development</h3>
                <p>Continuous improvement and addition of new features.</p>
                <span className={styles.timelineDate}>Ongoing</span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.supportSection} id="support">
          <h2 className={styles.sectionTitle}>Support the Project</h2>
          <p className={styles.supportInfo}>
            APL is a passion project built without financial investment. If you're interested in 
            supporting its growth through sponsorship, technical collaboration, or other forms of 
            partnership, please reach out using the form below.
          </p>
          
          {!submitted ? (
            <form className={styles.supportForm} onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label htmlFor="name">Your Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="Enter your name"
                />
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="Enter your email"
                />
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="supportType">How would you like to help?</label>
                <select
                  id="supportType"
                  name="supportType"
                  value={formData.supportType}
                  onChange={handleChange}
                  required
                >
                  <option value="collaboration">Technical Collaboration</option>
                  <option value="sponsorship">Sponsorship</option>
                  <option value="feedback">Feedback & Ideas</option>
                  <option value="other">Other Support</option>
                </select>
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="message">Your Message</label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  placeholder="Tell us how you'd like to collaborate or support"
                  rows={5}
                ></textarea>
              </div>
              
              {error && <div className={styles.error}>{error}</div>}
              
              <button 
                type="submit" 
                className={styles.submitButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          ) : (
            <div className={styles.successMessage}>
              <div className={styles.successIcon}>✓</div>
              <h3>Thank You!</h3>
              <p>Your message has been sent successfully. We'll get back to you soon.</p>
              <button 
                className={styles.resetButton}
                onClick={() => {
                  setSubmitted(false);
                  setFormData({
                    name: '',
                    email: '',
                    supportType: 'collaboration',
                    message: ''
                  });
                }}
              >
                Send Another Message
              </button>
            </div>
          )}
        </section>

        <section className={styles.acknowledgmentsSection}>
          <h2 className={styles.sectionTitle}>Acknowledgments</h2>
          <p className={styles.acknowledgmentsText}>
            Special thanks to my wife for being supportive of the vision, to my dad for being 
            the initial source of kicking this off, and to my sister and father-in-law for their 
            continuous support throughout this journey.
          </p>
          <p className={styles.acknowledgmentsText}>
            And of course, thank you to all the users who have provided feedback, reported bugs, 
            and participated in testing - your input has been invaluable in shaping APL into 
            what it is today.
          </p>
        </section>

        <section className={styles.ctaSection}>
          <div className={styles.ctaContent}>
            <h2>Ready to join the league?</h2>
            <p>Create your account and start building your dream team today!</p>
            <div className={styles.ctaButtons}>
              <Link href="/login" className={styles.ctaButton}>
                Sign Up / Login
              </Link>
              <Link href="/point-system" className={styles.secondaryButton}>
                View Point System
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
