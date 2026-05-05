import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Replay 26 Brewery Demo",
  description: "Next.js and Temporal brewery process demo"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
