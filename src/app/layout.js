import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNavigation from "./components/BottomNavigation/BottomNavigation";
import { AuthProvider } from "./context/AuthContext";

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
          {/* Bottom Navigation */}
          <BottomNavigation />
          {children}
        </body>
      </html>
    </AuthProvider>
  );
}
