import { AppShell } from "./app-shell";

export function PageLoading({ role = "Administrador" }: { role?: "Administrador" | "Operador" }) {
  return (
    <AppShell role={role}>
      <div className="loading-heading skeleton-block" />
      <div className="loading-subheading skeleton-block" />
      <section className="stats-grid loading-stats">
        {[0, 1, 2, 3].map((item) => <div className="stat-card skeleton-card" key={item}><div className="skeleton-circle" /><div className="skeleton-lines"><span /><strong /><small /></div></div>)}
      </section>
      <section className="grid-2 loading-grid">
        <div className="card loading-panel"><div className="skeleton-block loading-title" /><div className="skeleton-rows">{[0,1,2,3].map((item) => <span key={item} />)}</div></div>
        <div className="card loading-panel"><div className="skeleton-block loading-title" /><div className="skeleton-rows">{[0,1,2,3].map((item) => <span key={item} />)}</div></div>
      </section>
    </AppShell>
  );
}
