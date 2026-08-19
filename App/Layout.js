import "./globals.css";

export const metadata = {
  title: "Difference Game",
  description: "A multiplayer spot-the-difference game",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar">
      <body>{children}</body>
    </html>
  );
}
