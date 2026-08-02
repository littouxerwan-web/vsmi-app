import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VSMI",
  description: "Gestion clients pour photographe de mariage",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}