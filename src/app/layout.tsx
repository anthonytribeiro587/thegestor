import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "thegestor | Gestão de cobranças",
  description: "Gestão simples de clientes, cobranças recorrentes e operação.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
