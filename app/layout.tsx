import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PWARegister from "@/components/PWARegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Workspace Multi-Empresa",
  description: "Plataforma de workspace multiempresa com copiloto de IA e WhatsApp",
  manifest: "/manifest.webmanifest",
  applicationName: "Workspace",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Workspace" },
  // O favicon e o apple-touch vêm de app/icon.png e app/apple-icon.png (convenção do Next).
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  // Comporta-se como app: sem zoom por pinça/duplo-toque e sem zoom automático ao
  // focar campos no celular. viewportFit=cover respeita as áreas seguras (notch).
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
