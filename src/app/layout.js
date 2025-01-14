import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "./components/Navigation/Navigation"; // Adjust path if needed
import { AuthProvider } from "./context/authContext"; // Import AuthProvider

// Font configuration
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadata for the app
export const metadata = {
  title: "Apna Premier League",
  description: "Fantasy cricket league platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* Wrap the application with AuthProvider */}
        <AuthProvider>
          {/* Include the Navigation Component */}
          <Navigation />
          {/* Render the page-specific content */}
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
