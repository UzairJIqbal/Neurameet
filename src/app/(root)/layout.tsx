/* eslint-disable prettier/prettier */
import StreamVideoProvider from "../../Providers/StreamClientProvider";
import ReminderManager from "@/components/ReminderManager";

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<div className="h-screen overflow-hidden">
			<StreamVideoProvider>
				<ReminderManager />
				{children}
			</StreamVideoProvider>
		</div>
	);
}
