"use client";

/**
 * Client-side translation state shared by the live-captions and transcript
 * views: the current display mode (original / English / both) plus an on-demand
 * translator that fetches English for any not-yet-translated source-language
 * text and caches it, so toggling to English never re-requests the same text.
 *
 * Most non-English turns already arrive with `translatedText` from the bot; this
 * hook only fills gaps (e.g. turns translated before the model was available).
 */
import { useCallback, useReducer, useRef } from "react";
import { api } from "./api";
import { isTranslatable } from "./lang";

export type TranslationMode = "original" | "english" | "both";

export interface Translations {
  mode: TranslationMode;
  setMode: (mode: TranslationMode) => void;
  /** Kick off translation of `text` (from `lang`) if not already known/in-flight. */
  ensure: (text: string, lang?: string) => void;
  /** The cached English for `text`, if it has been fetched. */
  get: (text: string) => string | undefined;
}

export function useTranslations(initial: TranslationMode = "original"): Translations {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const modeRef = useRef<TranslationMode>(initial);
  const cache = useRef<Map<string, string>>(new Map());
  const inflight = useRef<Set<string>>(new Set());

  const setMode = useCallback((mode: TranslationMode) => {
    modeRef.current = mode;
    force();
  }, []);

  const ensure = useCallback((text: string, lang?: string) => {
    if (!text || !isTranslatable(lang)) return;
    if (cache.current.has(text) || inflight.current.has(text)) return;
    inflight.current.add(text);
    api
      .translate(text, lang!, "en")
      .then((r) => {
        cache.current.set(text, r.translatedText);
      })
      .catch(() => {
        /* leave uncached so a later toggle can retry */
      })
      .finally(() => {
        inflight.current.delete(text);
        force();
      });
  }, []);

  const get = useCallback((text: string) => cache.current.get(text), []);

  return { mode: modeRef.current, setMode, ensure, get };
}
