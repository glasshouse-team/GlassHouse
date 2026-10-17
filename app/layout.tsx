import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
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

// GH-8 (Beka) replaces this header with the real one: logo (public/logo-mark.svg), search
// entry and the "View as Guest / Host" role switcher. Brand kit: docs/teardown.md section 4.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <header className="border-b border-neutral-200 dark:border-neutral-800">
            <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm">
              <Link href="/" className="font-semibold tracking-tight">
                Glasshouse
              </Link>
              <Link
                href="/search"
                className="text-neutral-600 hover:underline dark:text-neutral-300"
              >
                Search
              </Link>
              <Link
                href="/host/dashboard"
                className="text-neutral-600 hover:underline dark:text-neutral-300"
              >
                Host
              </Link>
              <Link href="/feed" className="text-neutral-600 hover:underline dark:text-neutral-300">
                Feed
              </Link>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
