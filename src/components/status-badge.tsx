import type { ChargeStatus, ClientStatus } from "@/lib/types";

type Status = ChargeStatus | ClientStatus | "Conectado" | "Desconectado" | "Pendente";

export function StatusBadge({ status }: { status: Status }) {
  const key = status.toLowerCase().replaceAll(" ", "-");
  return <span className={`status-badge status-${key}`}>{status}</span>;
}
