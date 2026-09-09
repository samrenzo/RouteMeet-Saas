import { NextResponse } from "next/server";
import { constructWebhookEvent, handleStripeWebhookEvent } from "@/lib/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // IMPORTANT: read as raw text, not request.json() — Stripe's signature
  // covers the exact byte content of the body.
  const rawBody = await request.text();

  let event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (e) {
    console.error("Stripe webhook signature verification failed:", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleStripeWebhookEvent(event);
  } catch (e) {
    console.error(`Failed to handle Stripe event ${event.type}:`, e);
    // Still 200 — returning an error here makes Stripe retry, and a bug in
    // our handler retrying won't fix itself. Log and investigate instead.
  }

  return NextResponse.json({ received: true });
}
