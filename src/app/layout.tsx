import type { Metadata, Viewport } from "next";
import { Noto_Sans_Bengali, Plus_Jakarta_Sans, Sora } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const heading = Sora({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
// Supplies the ৳ sign and Bangla names, which the two Latin faces lack.
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-bengali", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "Tixora | Find your next experience", template: "%s | Tixora" },
  description: "Discover and book concerts, marathons, festivals, workshops and conferences across Bangladesh. Secure checkout and instant QR tickets.",
  openGraph: { siteName: "Tixora", type: "website" },
};

export const viewport: Viewport = { themeColor: "#090d18", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable} ${bengali.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster theme="dark" position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
