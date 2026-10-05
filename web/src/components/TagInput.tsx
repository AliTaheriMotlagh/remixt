"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { GENRE_TAGS, MAX_TAGS, MOOD_TAGS, normaliseTag } from "@/lib/tags";

/** Pick genre/mood tags from suggestions, or type your own (Enter or comma adds). */
export default function TagInput({
  value,
  onChange,
  compact = false,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [showAll, setShowAll] = useState(false);
  const full = value.length >= MAX_TAGS;

  function add(raw: string) {
    const tag = normaliseTag(raw);
    if (!tag || value.includes(tag) || full) return;
    onChange([...value, tag]);
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  const suggestions = [...GENRE_TAGS, ...MOOD_TAGS].filter((t) => !value.includes(t));
  const shown = showAll || compact === false ? suggestions : suggestions.slice(0, 10);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => remove(tag)}
            className="rounded-full bg-brand/20 px-2 py-0.5 text-xs text-foreground hover:bg-danger/20"
            title="Remove tag"
          >
            #{tag} <X />
          </button>
        ))}
        <input
          value={draft}
          disabled={full}
          onChange={(e) => {
            const next = e.target.value;
            if (next.endsWith(",")) {
              add(next.slice(0, -1));
              setDraft("");
            } else {
              setDraft(next);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
              setDraft("");
            } else if (e.key === "Backspace" && !draft && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={() => {
            if (draft.trim()) add(draft);
            setDraft("");
          }}
          placeholder={full ? `Up to ${MAX_TAGS} tags` : "Add a genre or mood…"}
          className="input !w-auto min-w-[140px] flex-1 !py-1 text-xs"
        />
      </div>
      {!full && (
        <div className="flex flex-wrap gap-1">
          {shown.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:border-brand/60 hover:text-foreground"
            >
              + {tag}
            </button>
          ))}
          {compact && suggestions.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="px-1 text-[11px] text-brand-strong hover:underline"
            >
              {showAll ? "fewer" : "more…"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
