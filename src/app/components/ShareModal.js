// components/ShareModal.js
"use client";

import React, { useState, useEffect } from 'react';
import styles from './ShareModal.module.css';

const ShareModal = ({ isOpen, onClose, referralCode }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  
  useEffect(() => {
    if (isOpen && referralCode) {
      // Create text to encode in QR
      const shareText = `Join me on Apna Premier League (APL) fantasy cricket! Use my referral code: ${referralCode} to sign up and earn bonus points. https://apnapremierleague.vercel.app/login`;
      
      // Generate QR code URL using Google Chart API
      const encodedText = encodeURIComponent(shareText);
      const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=250x250&chl=${encodedText}&choe=UTF-8`;
      
      setQrCodeUrl(qrUrl);
    }
  }, [isOpen, referralCode]);
  
  if (!isOpen) return null;
  
  const handleWhatsAppShare = () => {
    const message = encodeURIComponent(
      `Hey! Join me on Apna Premier League (APL) - the ultimate fantasy cricket experience! ` +
      `Use my referral code: ${referralCode} to get started and earn bonus points. ` +
      `Sign up here: https://apnapremierleague.vercel.app/login`
    );
    
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };
  
  const handleCopyLink = () => {
    const link = `https://apnapremierleague.vercel.app/login?ref=${referralCode}`;
    navigator.clipboard.writeText(link);
    alert('Link copied to clipboard!');
  };
  
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <button className={styles.closeButton} onClick={onClose}>×</button>
        
        <h3>Share Your Referral Code</h3>
        
        <div className={styles.qrCodeContainer}>
          <img src={qrCodeUrl} alt="QR Code" className={styles.qrCode} />
          <p className={styles.scanText}>Scan this QR code to join!</p>
        </div>
        
        <div className={styles.codeDisplay}>
          <p>Your Referral Code:</p>
          <div className={styles.code}>{referralCode}</div>
        </div>
        
        <div className={styles.shareButtons}>
          <button onClick={handleWhatsAppShare} className={styles.whatsappButton}>
            <span className={styles.whatsappIcon}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M17.6 6.95c-1.88-1.88-4.37-2.92-7.03-2.92-5.49 0-9.95 4.47-9.95 9.95 0 1.75.46 3.47 1.33 4.98L1 23.04l4.18-.92c1.46.79 3.1 1.21 4.76 1.21 5.49 0 9.95-4.47 9.95-9.95 0-2.65-1.04-5.15-2.92-7.03zm-7.03 15.31c-1.49 0-2.95-.4-4.22-1.15l-.3-.18-3.13.82.83-3.04-.19-.32c-.81-1.31-1.24-2.82-1.24-4.38 0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42 1.56 1.56 2.41 3.63 2.41 5.83.02 4.54-3.68 8.24-8.22 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.08 0 1.22.89 2.41 1.02 2.57.12.17 1.75 2.68 4.25 3.76.59.25 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.11-.23-.16-.48-.29z"/>
              </svg>
            </span>
            Share on WhatsApp
          </button>
          <button onClick={handleCopyLink} className={styles.copyButton}>
            Copy Link
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
