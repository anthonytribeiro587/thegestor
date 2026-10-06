"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./filter-popover.module.css";

type FilterPopoverProps = { label: string; active?: boolean; children: React.ReactNode; className?: string };

export function FilterPopover({ label, active = false, children, className = "" }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [rightAligned, setRightAligned] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const rect = root.current?.getBoundingClientRect();
    setRightAligned(Boolean(rect && rect.left > document.documentElement.clientWidth - 340));
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  return (
    <div className={`${styles.root} ${className}`} ref={root}>
      <button className={`${styles.trigger} ${active ? styles.active : ""}`} type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {label}{active ? <span className={styles.dot} aria-label="filtro ativo" /> : null}<ChevronDown size={13} />
      </button>
      {open ? <div className={`${styles.panel} ${rightAligned ? styles.rightAligned : ""}`} role="group" aria-label={`Filtro ${label}`} onClick={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest("button")) setOpen(false);
      }}>{children}</div> : null}
    </div>
  );
}
