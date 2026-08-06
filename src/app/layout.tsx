import type { Metadata } from "next";
import "./globals.css";
import "./quality.css";

export const metadata: Metadata = {
  title: "thegestor | Gestão de cobranças",
  description: "Gestão simples de clientes, cobranças recorrentes e operação.",
};

function supabaseOrigin() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const origin = supabaseOrigin();
  return (
    <html lang="pt-BR">
      <head>
        {origin ? <link rel="preconnect" href={origin} crossOrigin="anonymous" /> : null}
        {origin ? <link rel="dns-prefetch" href={origin} /> : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
