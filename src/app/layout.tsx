/* eslint-disable prettier/prettier */
import type { Metadata } from "next";
import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { dark } from "@clerk/themes";
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
				<div id="root" className="h-screen overflow-hidden">
					<ClerkProvider
						appearance={{
							variables: {
								colorPrimary: "#0000ff",
								colorForeground: "white",
								borderRadius: "10px",
								colorMutedForeground: "#888888",
								colorBorder: "black",
								colorInputText: "#fff",
								colorSuccess: "blue",
								colorDanger: "red",
							},
							layout: {
								socialButtonsVariant: "blockButton" as const,
								animations: true,
								logoImageUrl: "/icons/logo.png",
							},
							baseTheme: dark,
							elements: {
								formButtonPrimary: "bg-primary-container hover:bg-primary text-sm font-medium",
							},
						}}
					>
						{children}
						<Toaster
							position="bottom-right"
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
