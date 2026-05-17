/* eslint-disable prettier/prettier */
import type { Metadata } from "next";
import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";
import localFont from "next/font/local";
import { dark } from "@clerk/themes";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "react-hot-toast";
import "@stream-io/video-react-sdk/dist/css/styles.css";

const suseMono = localFont({
	src: [
		{
			path: "./fonts/SUSEMono-Italic-VariableFont_wght.ttf",
			style: "italic",
			weight: "100 900",
		},
		{
			path: "./fonts/SUSEMono-VariableFont_wght.ttf",
			style: "normal",
			weight: "100 900",
		},
	],
	variable: "--font-suse-mono",
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
				className={`${suseMono.className} bg-dark-2`}
				suppressHydrationWarning
			>
				<div id="root">
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
								formButtonPrimary: "bg-slate-500 hover:bg-slate-400 text-sm",
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
									fontFamily: "suseMono",
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
