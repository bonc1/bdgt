import type { Metadata, Viewport } from "next";
import { Manrope, Instrument_Serif, Courier_Prime } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const courierPrime = Courier_Prime({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "bdgt — Privatekonomi & Budgetuppföljning",
  description:
    "Planera förväntade räkningar, kvartalsfakturor och följ upp faktiskt utfall i mobilen.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "bdgt",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f4f4f2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="sv"
      className={`${manrope.variable} ${instrumentSerif.variable} ${courierPrime.variable}`}
    >
      <body className="min-h-screen bg-[#f4f4f2] font-sans text-[#282825] antialiased selection:bg-[#ffe81a]/60">
        {children}
      </body>
    </html>
  );
}
