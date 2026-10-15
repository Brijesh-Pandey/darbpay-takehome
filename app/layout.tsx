import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import { SiteHeader } from "./site-header";
import "./globals.css";

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source",
});

export const metadata: Metadata = {
  applicationName: "Darb",
  title: {
    default: "Darb",
    template: "%s · Darb",
  },
  description: "Match receipts and tax invoices to card transactions.",
};

export const viewport: Viewport = {
  themeColor: "#16382f",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={body.variable}>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 py-6 sm:px-8">
          <SiteHeader />
          <div className="mt-8 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
