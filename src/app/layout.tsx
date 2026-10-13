/* eslint-disable prettier/prettier */
import type { Metadata } from "next";
import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "react-hot-toast";
import "@stream-io/video-react-sdk/dist/css/styles.css";

const hankenGrotesk = Hanken_Grotesk({
	variable: "--font-hanken-grotesk",
	weight: ["400", "500", "600", "700", "800"],
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
				className={`${hankenGrotesk.variable} ${jetbrainsMono.variable} bg-inverse-surface`}
				suppressHydrationWarning
			>
				<div id="root" className="min-h-screen">
					<ClerkProvider
						appearance={{
							variables: {
								colorPrimary: "#830EF9",
								colorText: "#181B27",
								colorMutedForeground: "#4C4356",
								colorBackground: "#FFFFFF",
								colorInputBackground: "#F3F2FF",
								colorInputText: "#181B27",
								colorBorder: "#CEC2D9",
								colorSuccess: "#00C48C",
								colorDanger: "#BA1A1A",
								borderRadius: "0.5rem",
								fontFamily:
									"var(--font-hanken-grotesk), ui-sans-serif, system-ui, sans-serif",
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
									background: "#19232d",
									color: "white",
									fontFamily: "var(--font-hanken-grotesk)",
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
