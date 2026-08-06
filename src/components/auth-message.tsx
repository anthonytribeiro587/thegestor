"use client";

import { useSearchParams } from "next/navigation";

export function AuthMessage() {
  const params = useSearchParams();
  const error = params.get("erro");
  const success = params.get("sucesso");

  if (!error && !success) return null;

  return (
    <div className={`auth-feedback ${error ? "error" : "success"}`} role="status">
      {error ?? success}
    </div>
  );
}
