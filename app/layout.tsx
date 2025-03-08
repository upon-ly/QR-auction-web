import "@rainbow-me/rainbowkit/styles.css";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Provider } from "../providers/provider";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const frameMetadata = {
  version: "next",
  imageUrl: `${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`,
  button: {
    title: "Launch App",
    action: {
      type: "launch_frame",
      name: "QR Coin Mini App",
      url: `${String(process.env.NEXT_PUBLIC_HOST_URL)}/`,
      splashImageUrl: `${String(process.env.NEXT_PUBLIC_HOST_URL)}/qrLogo.png`,
      splashBackgroundColor: "#FFFFFF",
    },
  },
};

export const metadata: Metadata = {
  title: "QR coin",
  description:
    "A daily auction bid to control which website the QR points to next",
  icons: "https://qrcoin.fun/qrLogo.png",
  openGraph: {
    url: "https://www.qrcoin.fun",
    images: [
      {
        url: "https://qrcoin.fun/opgIMage.png",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "QR Auction",
    description:
      "A daily auction bid to control which website the QR points to next",
    images: {
      url: "https://qrcoin.fun/opgIMage.png",
      alt: "QRCoinDotFun Logo",
    },
    creator: "@QRcoindotfun",
  },
  other: {
    "fc:frame": JSON.stringify(frameMetadata),
    "og:image": frameMetadata.imageUrl,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Toaster position="top-center" richColors={true} />
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
