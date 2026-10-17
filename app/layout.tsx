import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Glasshouse",
  description: "Homes you can trust before you book: three agents and an honest 3D tour.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// GH-8 (Beka) replaces this header with the real one: logo, search entry and the
// "View as Guest / Host" role switcher. Brand font and colors come from GH-4.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
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
