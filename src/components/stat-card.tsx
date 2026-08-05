import type { LucideIcon } from "lucide-react";

export function StatCard({ title, value, helper, icon: Icon, tone = "blue" }: {
  title: string;
  value: string | number;
  helper?: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "orange" | "red" | "slate";
}) {
  return (
    <article className="stat-card">
      <div className={`stat-icon tone-${tone}`}><Icon size={22} /></div>
      <div className="stat-copy"><span>{title}</span><strong>{value}</strong>{helper ? <small>{helper}</small> : null}</div>
    </article>
  );
}
