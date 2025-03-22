import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNavigation from "./components/Navigation/BottomNavigation"; // Adjusted path
import { AuthProvider } from "@/app/context/authContext"; // Adjusted path
import { GoogleAnalytics } from '@next/third-parties/google'
import AnalyticsWrapper from '@/app/components/AnalyticsWrapper';


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Apna Premier League",
  description: "Fantasy cricket league platform",
  icons: {
    icon: '/favicon.ico',
    apple: '/images/APL.png'  // This could be your PNG
  },
  other: {
  'apple-touch-icon': '/images/APL.png'
}
};

export default function RootLayout({ children }) {
  return (
    <AuthProvider>
      <html lang="en">
    <head>
          <script dangerouslySetInnerHTML={{
  __html: `
    (function() {
      // On page load, check for dark mode preference
      function setInitialTheme() {
        // Check local storage first, then system preference
        if (
          localStorage.theme === 'dark' || 
          (!localStorage.theme && window.matchMedia('(prefers-color-scheme: dark)').matches)
        ) {
          document.documentElement.classList.add('dark-mode');
        } else {
          document.documentElement.classList.remove('dark-mode');
        }
      }
      
      // Call on initial load
      setInitialTheme();
      
      // Watch for system preference changes
      try {
        const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        // Modern approach with addEventListener
        darkModeMediaQuery.addEventListener('change', (e) => {
          if (!localStorage.theme) { // Only auto-switch if user hasn't set preference
            if (e.matches) {
              document.documentElement.classList.add('dark-mode');
            } else {
              document.documentElement.classList.remove('dark-mode');
            }
          }
        });
      } catch (e) {
        // Older browsers fallback
        console.log('Browser doesn\'t support matchMedia listener');
      }
      
      // Toggle function for manual control
      window.toggleDarkMode = function() {
        if (document.documentElement.classList.contains('dark-mode')) {
          document.documentElement.classList.remove('dark-mode');
          localStorage.theme = 'light';
        } else {
          document.documentElement.classList.add('dark-mode');
          localStorage.theme = 'dark';
        }
      }
    })();
  `
}} />
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable}`}>
          <AnalyticsWrapper>
            <BottomNavigation />
            {children}
          </AnalyticsWrapper>
          <GoogleAnalytics gaId='G-K1Y8TK928E' />
        </body>
      </html>
    </AuthProvider>
  );
}
