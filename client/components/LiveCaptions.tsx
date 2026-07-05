"use client";

import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Caption } from "@scribe/shared";
import { LanguageBadge } from "@/components/LanguageBadge";
import { SpeakerAvatar } from "@/components/SpeakerAvatar";
import { TranslatedText } from "@/components/TranslatedText";
import { TranslationControls } from "@/components/TranslationControls";
import { formatClock } from "@/lib/format";
import { isTranslatable } from "@/lib/lang";
import { speakerColor } from "@/lib/speaker";
import { useTranslations } from "@/lib/useTranslations";

/** Consecutive captions from one speaker, rendered as a single block. */
interface Group {
  userId: string;
  username: string;
  captions: Caption[];
}

function groupBySpeaker(captions: Caption[]): Group[] {
  const groups: Group[] = [];
  for (const c of captions) {
    const last = groups[groups.length - 1];
    if (last && last.userId === c.userId) last.captions.push(c);
    else groups.push({ userId: c.userId, username: c.username, captions: [c] });
  }
  return groups;
}

/** A caption's source language, only when it's a non-English (badge-worthy) one. */
function badgeLang(lang?: string): string | undefined {
  return lang && lang !== "en" ? lang : undefined;
}

export function LiveCaptions({ captions, live }: { captions: Caption[]; live: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const t = useTranslations();

  const hasTranslatable = captions.some((c) => isTranslatable(c.lang));
  const englishOf = (c: Caption): string | undefined => c.translatedText ?? t.get(c.text);

  // When showing English, fetch any final turn the bot didn't already translate.
  useEffect(() => {
    if (t.mode === "original") return;
    for (const c of captions) {
      if (c.isFinal && !c.translatedText && isTranslatable(c.lang)) t.ensure(c.text, c.lang);
    }
  }, [t.mode, captions, t]);

  // Follow the tail while the user is pinned to the bottom.
  useLayoutEffect(() => {
    if (pinned && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [captions, pinned]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      setPinned(atBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setPinned(true);
  };

  if (captions.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-surface text-muted">
        {live ? "Listening… captions will appear as people speak." : "No captions were recorded."}
      </div>
    );
  }

  const groups = groupBySpeaker(captions);

  return (
    <div className="space-y-3">
      {hasTranslatable && (
        <div className="flex justify-end">
          <TranslationControls mode={t.mode} onChange={t.setMode} />
        </div>
      )}
      <div className="relative">
        <div
          ref={scrollRef}
          className="max-h-[65vh] space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-4"
        >
          {groups.map((g, gi) => {
            const groupLang = badgeLang(g.captions.find((c) => badgeLang(c.lang))?.lang);
            return (
              <div key={gi} className="flex gap-3">
                <SpeakerAvatar userId={g.userId} name={g.username} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium" style={{ color: speakerColor(g.userId) }}>
                      {g.username}
                    </span>
                    <span className="font-mono text-xs text-muted">
                      {formatClock(g.captions[0]!.tsStart)}
                    </span>
                    <LanguageBadge code={groupLang} />
                  </div>
                  <p className="leading-relaxed">
                    {g.captions.map((c, ci) => (
                      <span
                        key={ci}
                        className={clsx(
                          c.isFinal ? "text-fg/90" : "italic text-muted",
                          !c.isFinal && "after:ml-0.5 after:animate-pulse after:content-['▍']",
                        )}
                      >
                        <TranslatedText text={c.text} english={englishOf(c)} mode={t.mode} inline />{" "}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {!pinned && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm text-fg shadow-lg hover:border-accent/50"
          >
            Jump to latest ↓
          </button>
        )}
      </div>
    </div>
  );
}
