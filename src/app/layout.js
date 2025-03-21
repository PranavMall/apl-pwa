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
        <body className={`${geistSans.variable} ${geistMono.variable}`}>
          <AnalyticsWrapper>
            <BottomNavigation />
            {children}
          </AnalyticsWrapper>
          <GoogleAnalytics gaId='G-XXXXXXXXXX' />
        </body>
      </html>
    </AuthProvider>
  );
}
