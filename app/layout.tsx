import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/ui/site-header";
import { getViewer } from "@/lib/viewer";
import "./globals.css";
import { Providers } from "./providers";

// Brand font (GH-4, D-022): Inter, bundled in the repo (OFL, app/fonts/OFL.txt), so
// builds never fetch fonts over the network.
const inter = localFont({
  src: "./fonts/InterVariable-latin.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Glasshouse",
  description: "Homes you can trust before you book: three agents and an honest 3D tour.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// The header reads the role switcher's cookie, so every page renders per request (GH-8).
// Brand kit: docs/teardown.md section 4.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <SiteHeader viewer={viewer} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
