import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Facet — Real-time Material Studio",
  description:
    "Author dispersion, transmission, and refraction in the browser. Live previews, real materials.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-[#050507]">
      <body className="h-full w-full overflow-hidden bg-[#050507] text-white">
        {children}
      </body>
    </html>
  );
}
