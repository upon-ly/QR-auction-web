import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

import { Provider } from "../providers/provider";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";
import { InfoBar } from "@/components/InfoBar";
import { Header } from "@/components/Header";
import { FarcasterLogin } from "@/components/FarcasterLogin";
import { Analytics } from "@vercel/analytics/react";

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
      name: "$QR",
      url: `${String(process.env.NEXT_PUBLIC_HOST_URL)}/`,
      splashImageUrl: `${String(process.env.NEXT_PUBLIC_HOST_URL)}/qrLogo.png`,
      splashBackgroundColor: "#FFFFFF",
    },
  },
};

export function generateMetadata(): Metadata {
  const url = process.env.NEXT_PUBLIC_HOST_URL || "https://qrcoin.fun/";

  return {
    metadataBase: new URL(url),
    title: "QR",
    description: "Same QR. New Website. Every day.",
    openGraph: {
      images: [`${url}/opgIMage.png`],
      title: "QR coin",
      description: "Same QR. New Website. Every day.",
    },
    twitter: {
      card: "summary",
      title: "QR Coin",
      description: "Same QR. New Website. Every day.",
      images: {
        url: `${url}/opgIMage.png`,
        alt: "QRCoinDotFun Logo",
      },
      creator: "@QRcoindotfun",
    },
    icons: {
      icon: `${url}/qrLogo.png`,
      apple: `${url}/qrLogo.png`,
    },
    other: {
      "fc:frame": JSON.stringify(frameMetadata),
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* X (Twitter) Pixel Base Code */}
        <Script
          id="x-pixel-base"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
              },s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
              a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
              twq('config','p8njm');
            `
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Toaster position="top-center" richColors={true} />
          <Provider>
            <InfoBar />
            <Header />
            <FarcasterLogin />
            {children}
            <Analytics />
          </Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
