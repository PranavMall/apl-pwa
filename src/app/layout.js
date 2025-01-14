import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNavigation from "./components/Navigation/BottomNavigation"; // Adjust path as necessary
import { AuthProvider } from "@/app/context/authContext"; // Use absolute path for clarity

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
};

export default function RootLayout({ children }) {
  return (
    <AuthProvider>
      <html lang="en">
        <body className={`${geistSans.variable} ${geistMono.variable}`}>
          {/* Bottom Navigation with global user tracking */}
          <BottomNavigation />
          {/* Render page-specific content */}
          {children}
        </body>
      </html>
    </AuthProvider>
  );
}
