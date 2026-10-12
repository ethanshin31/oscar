import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oscar",
  description: "Your personal AI assistant.",
  applicationName: "Oscar",
  appleWebApp: { capable: true, title: "Oscar", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#04070c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
