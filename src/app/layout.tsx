import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "Brewery floor dashboard",
  description: "Watch batches, tank readings, quality checks, and alerts in one place."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
