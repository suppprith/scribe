"use client";

import clsx from "clsx";
import type { TranslationMode } from "@/lib/useTranslations";

const MODES: { value: TranslationMode; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "english", label: "English" },
  { value: "both", label: "Both" },
];

/**
 * Segmented control for the Original / English / Both translation view. Render
 * it only when a view actually has non-English content to translate.
 */
export function TranslationControls({
  mode,
  onChange,
}: {
  mode: TranslationMode;
  onChange: (mode: TranslationMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm"
      role="group"
      aria-label="Translation view"
    >
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          aria-pressed={mode === m.value}
          className={clsx(
            "rounded-md px-3 py-1.5 transition-colors",
            mode === m.value ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
