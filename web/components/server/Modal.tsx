"use client";

import { IconClose } from "@/components/server/icons";
import { useEffect, type ReactNode } from "react";

/** Centered overlay modal. Click backdrop / Esc to close (unless locked). */
export default function Modal({
  title,
  onClose,
  locked,
  size = "lg",
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  locked?: boolean;
  size?: "md" | "lg" | "xl";
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !locked) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, locked]);

  const maxW = size === "md" ? "max-w-lg" : size === "xl" ? "max-w-4xl" : "max-w-2xl";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10 backdrop-blur-sm"
      onClick={() => !locked && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`card w-full ${maxW} p-6 fade-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            className="text-[var(--color-faint)] hover:text-[var(--color-fg)] transition-colors"
            onClick={() => !locked && onClose()}
            aria-label="Đóng"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
