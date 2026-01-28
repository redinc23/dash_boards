import "./globals.css";

export const metadata = {
  title: "AEGIS Dashboard",
  description: "Repo monitoring with real-time updates"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
