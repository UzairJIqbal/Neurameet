// Layout for the guest join path. Does NOT wrap children in StreamClientProvider
// (G0 §4.5.2) — the GuestStreamClientProvider on the page is the only Stream video
// client for this subtree. The (root) layout above still injects Clerk + Navbar,
// and StreamVideoProvider is bypassed in code (src/Providers/StreamClientProvider.tsx
// checks the guest lobby path and returns <>{children}</> when the user is not authenticated).
export default function GuestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
