import type { Metadata } from "next";
import "./globals.css";
import "./premium.css";

export const metadata: Metadata = {
  title: "VSMI",
  description: "Gestion clients et finances personnelles",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="vsmi-light-mode">
      <body>{children}</body>
    </html>
  );
}
