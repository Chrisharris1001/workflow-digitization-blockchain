import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AccountSwitcher from './AccountSwitcher';
import { AccountProvider } from './AccountContext';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Workflow Digitization",
  description: "A decentralized platform for digitizing workflows",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AccountProvider>
          <AccountSwitcher />
          {children}
        </AccountProvider>
      </body>
    </html>
  );
}

