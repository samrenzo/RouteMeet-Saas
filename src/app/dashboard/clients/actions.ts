"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { draftFollowUpEmail as draftFollowUpEmailApi } from "@/lib/anthropic";
import { sendFollowUpEmail as sendFollowUpEmailApi } from "@/lib/email";
import { z } from "zod";

export const AVAILABLE_TAGS = ["Hot lead", "Follow-up needed", "Closed"] as const;

async function assertOwnerOwnsClient(clientId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: client } = await supabase
    .from("clients")
    .select("id, business_id, businesses!inner(owner_user_id)")
    .eq("id", clientId)
    .single();

  if (!client || (client as any).businesses.owner_user_id !== user.id) {
    throw new Error("Client not found");
  }
  return client;
}

const addNoteSchema = z.object({
  clientId: z.string().uuid(),
  businessId: z.string().uuid(),
  bookingId: z.string().uuid().optional().nullable(),
  body: z.string().min(1, "Note can't be empty"),
});

export async function addClientNote(input: {
  clientId: string;
  businessId: string;
  bookingId?: string | null;
  body: string;
}) {
  const parsed = addNoteSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid note");
  }

  await assertOwnerOwnsClient(parsed.data.clientId);

  const supabase = createClient();
  const { error } = await supabase.from("client_notes").insert({
    business_id: parsed.data.businessId,
    client_id: parsed.data.clientId,
    booking_id: parsed.data.bookingId ?? null,
    body: parsed.data.body,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
  revalidatePath("/dashboard");
}

export async function updateClientTags(clientId: string, tags: string[]) {
  await assertOwnerOwnsClient(clientId);

  const supabase = createClient();
  const { error } = await supabase
    .from("clients")
    .update({ tags })
    .eq("id", clientId);

  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/clients");
}

/**
 * Calls Claude to draft a follow-up email from a note's text. Returns the
 * draft as plain text for the dashboard to show in an editable textarea —
 * nothing is sent here. See sendFollowUpEmail below for the actual send.
 */
export async function draftFollowUpEmail(noteId: string): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: note, error } = await supabase
    .from("client_notes")
    .select("*, clients(name), businesses(name, owner_user_id, plan)")
    .eq("id", noteId)
    .single();

  if (error || !note) throw new Error("Note not found");
  if ((note as any).businesses.owner_user_id !== user.id) {
    throw new Error("Unauthorized");
  }
  if ((note as any).businesses.plan !== "business") {
    throw new Error("AI follow-up drafting requires the Business plan.");
  }

  return draftFollowUpEmailApi({
    clientName: (note as any).clients.name,
    businessName: (note as any).businesses.name,
    noteBody: note.body,
  });
}

const sendFollowUpSchema = z.object({
  clientId: z.string().uuid(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

/** Sends the (possibly edited) draft to the client via Resend. */
export async function sendFollowUpEmail(input: {
  clientId: string;
  subject: string;
  body: string;
}) {
  const parsed = sendFollowUpSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid email");
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: client } = await supabase
    .from("clients")
    .select("*, businesses(*)")
    .eq("id", parsed.data.clientId)
    .single();

  if (!client || !(client as any).email) throw new Error("Client has no email on file");
  const business = (client as any).businesses;
  if (business.owner_user_id !== user.id) throw new Error("Unauthorized");

  await sendFollowUpEmailApi(business, (client as any).email, parsed.data.subject, parsed.data.body);
}
