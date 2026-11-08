/* eslint-disable prettier/prettier */
import type { Metadata } from "next";
import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "react-hot-toast";
import "@stream-io/video-react-sdk/dist/css/styles.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Neuromeet",
  description: "Zoom upgraded version",
  icons: {
    icon: "/icons/favicon.ico",
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
        className={`${inter.variable} ${jetbrainsMono.variable} bg-surface-container-low text-on-surface`}
        suppressHydrationWarning
      >
        <div id="root" className="min-h-screen">
          <ClerkProvider
            appearance={{
              variables: {
                colorPrimary: "#834ACB",
                colorText: "#0A0A0A",
                colorMutedForeground: "#6B6B6B",
                colorBackground: "#FFFFFF",
                colorInputBackground: "#F8F8F8",
                colorInputText: "#0A0A0A",
                colorBorder: "#E6E6E6",
                colorSuccess: "#00C48C",
                colorDanger: "#BA1A1A",
                borderRadius: "0.75rem",
                fontFamily:
                  "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
              },
              layout: {
                socialButtonsVariant: "blockButton" as const,
                animations: true,
                logoImageUrl: "/icons/logo.png",
              },
              elements: {
                formButtonPrimary:
                  "bg-primary-container hover:bg-primary text-on-primary text-sm font-medium",
                card: "shadow-lg",
              },
            }}
          >
            {children}
            <Toaster
              position="top-right"
              reverseOrder={false}
              gutter={12}
              toasterId="default"
              toastOptions={{
                className: "",
                duration: 5000,
                removeDelay: 1000,
                style: {
                  background: "#1C1C1E",
                  color: "white",
                  fontFamily: "var(--font-inter)",
                  fontSize: "15px",
                },
              }}
            />
          </ClerkProvider>
        </div>
      </body>
    </html>
  );
}
