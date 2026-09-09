"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { updateClientTags, AVAILABLE_TAGS } from "@/app/dashboard/clients/actions";

export function TagsEditor({
  clientId,
  initialTags,
}: {
  clientId: string;
  initialTags: string[];
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [isPending, startTransition] = useTransition();

  function toggle(tag: string) {
    const next = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    setTags(next);
    startTransition(async () => {
      try {
        await updateClientTags(clientId, next);
      } catch {
        setTags(tags); // revert on failure
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {AVAILABLE_TAGS.map((tag) => {
        const active = tags.includes(tag);
        return (
          <button
            key={tag}
            onClick={() => toggle(tag)}
            disabled={isPending}
            className="disabled:opacity-60"
          >
            <Badge variant={active ? "accent" : "outline"}>{tag}</Badge>
          </button>
        );
      })}
    </div>
  );
}
