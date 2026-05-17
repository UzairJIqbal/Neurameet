/* eslint-disable prettier/prettier */
import StreamVideoProvider from "../../Providers/StreamClientProvider";

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return <StreamVideoProvider>{children}</StreamVideoProvider>;
}
