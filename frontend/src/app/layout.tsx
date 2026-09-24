import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PrintSpot — Self-Service Instant Cloud Printing',
  description: 'Upload your document, pay seamlessly, and pick up your prints in seconds with real-time queue tracking.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
