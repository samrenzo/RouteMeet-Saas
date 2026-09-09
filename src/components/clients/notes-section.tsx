"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import type { ClientNote } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  addClientNote,
  draftFollowUpEmail,
  sendFollowUpEmail,
} from "@/app/dashboard/clients/actions";

export function NotesSection({
  clientId,
  businessId,
  clientName,
  notes,
  canUseAiFollowUp,
}: {
  clientId: string;
  businessId: string;
  clientName: string;
  notes: ClientNote[];
  canUseAiFollowUp: boolean;
}) {
  const [newNote, setNewNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAddNote() {
    if (!newNote.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await addClientNote({ clientId, businessId, body: newNote.trim() });
        setNewNote("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save note");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <Textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder={`How did the meeting with ${clientName} go?`}
          rows={3}
        />
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={handleAddNote} disabled={isPending || !newNote.trim()} size="sm">
            {isPending ? "Saving…" : "Add note"}
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        {notes.length === 0 && (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
        {notes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            clientId={clientId}
            canUseAiFollowUp={canUseAiFollowUp}
          />
        ))}
      </div>
    </div>
  );
}

function NoteRow({
  note,
  clientId,
  canUseAiFollowUp,
}: {
  note: ClientNote;
  clientId: string;
  canUseAiFollowUp: boolean;
}) {
  const [drafting, startDraftTransition] = useTransition();
  const [sending, startSendTransition] = useTransition();
  const [draft, setDraft] = useState<string | null>(null);
  const [subject, setSubject] = useState("Following up");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleDraft() {
    setError(null);
    startDraftTransition(async () => {
      try {
        const text = await draftFollowUpEmail(note.id);
        setDraft(text);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to draft email");
      }
    });
  }

  function handleSend() {
    if (!draft) return;
    setError(null);
    startSendTransition(async () => {
      try {
        await sendFollowUpEmail({ clientId, subject, body: draft });
        setSent(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to send email");
      }
    });
  }

  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">
        {format(new Date(note.created_at), "MMM d, yyyy 'at' h:mm a")}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{note.body}</p>

      {draft === null ? (
        canUseAiFollowUp ? (
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={handleDraft}
            disabled={drafting}
          >
            {drafting ? "Drafting…" : "Draft Follow-Up Email"}
          </Button>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled>
              Draft Follow-Up Email
            </Button>
            <Badge variant="outline">Business plan</Badge>
            <Link href="/pricing" className="text-xs underline text-muted-foreground">
              Upgrade
            </Link>
          </div>
        )
      ) : (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleSend} disabled={sending || sent}>
              {sent ? "Sent" : sending ? "Sending…" : "Send email"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={sent}>
              Discard
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </Card>
  );
}
