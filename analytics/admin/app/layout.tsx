import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import { ReactQueryClientProvider } from "@/components/react-query-provider";

export const metadata: Metadata = {
  title: "Analytics Dashboard",
  description: "Real-time analytics overview",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-background text-foreground">
        <ReactQueryClientProvider>{children}</ReactQueryClientProvider>
      </body>
    </html>
  );
}
