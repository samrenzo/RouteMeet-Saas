import "server-only";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Check https://docs.claude.com/en/docs/about-claude/models for the
// current recommended model id before deploying — pin whatever you
// verify there rather than trusting this default blindly.
const DEFAULT_MODEL = "claude-sonnet-4-5";

/**
 * Turns a raw meeting note into a short, professional follow-up email
 * draft. Returned as plain text (paragraphs separated by blank lines) so
 * `lib/email.ts#sendFollowUpEmail` can render it and the owner can edit it
 * in a plain textarea before sending — nothing here sends anything itself.
 */
export async function draftFollowUpEmail(input: {
  clientName: string;
  businessName: string;
  ownerName?: string;
  noteBody: string;
}): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 500,
      system:
        "You draft short, professional follow-up emails for small business " +
        "owners (real estate agents, sales reps, consultants, home service " +
        "pros) to send to clients after a meeting. Write only the email " +
        "body as plain text paragraphs separated by blank lines — no " +
        "subject line, no greeting placeholders like [Name] left " +
        "unfilled, no markdown formatting, no commentary about the task. " +
        "Sign off with the owner's first name if given, otherwise omit a " +
        "signature line entirely. Keep it under 150 words.",
      messages: [
        {
          role: "user",
          content:
            `Client: ${input.clientName}\n` +
            `Business: ${input.businessName}\n` +
            (input.ownerName ? `Owner's first name: ${input.ownerName}\n` : "") +
            `\nMeeting notes:\n${input.noteBody}\n\n` +
            `Draft the follow-up email.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic request failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b: any) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Anthropic response contained no text content");
  }

  return textBlock.text.trim();
}
