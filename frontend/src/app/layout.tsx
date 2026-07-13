import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const fontSans = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Document ES",
  description: "ระบบส่งเอกสารระหว่างแผนก",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={fontSans.variable}>
      <body className="antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
