import type { TranslationMode } from "@/lib/useTranslations";

/**
 * Renders a turn's text for the current translation mode:
 * - `original`, or no English available → the original text
 * - `english` → the English translation
 * - `both` → original with the English beneath (block) or after it (inline)
 *
 * `inline` keeps everything on one line (for the flowing live-caption stream);
 * the default stacks the English under the original (for transcript lines).
 */
export function TranslatedText({
  text,
  english,
  mode,
  inline = false,
}: {
  text: string;
  english?: string;
  mode: TranslationMode;
  inline?: boolean;
}) {
  if (mode === "original" || !english) return <>{text}</>;
  if (mode === "english") return <>{english}</>;

  if (inline) {
    return (
      <>
        {text} <span className="text-muted">· {english}</span>
      </>
    );
  }
  return (
    <>
      <span>{text}</span>
      <span className="mt-0.5 block text-sm italic text-muted">{english}</span>
    </>
  );
}
