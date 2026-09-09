import "server-only";
import Stripe from "stripe";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/plans";
import type { Business, Plan } from "@/lib/types";

let _stripe: Stripe | null = null;
function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2024-06-20",
    });
  }
  return _stripe;
}

/**
 * Creates a Stripe Checkout session (subscription mode) for upgrading a
 * business to Pro or Business, and returns the URL to redirect the owner
 * to. Reuses an existing Stripe customer if one's already on file so
 * repeat upgrades/downgrades don't create duplicate customers.
 */
export async function createCheckoutSession(
  business: Business,
  targetPlan: "pro" | "business",
  appUrl: string
): Promise<string> {
  const priceEnvVar = PLANS[targetPlan].stripePriceEnvVar!;
  const priceId = process.env[priceEnvVar];
  if (!priceId) {
    throw new Error(`${priceEnvVar} is not configured`);
  }

  const customerId =
    business.stripe_customer_id ?? (await createStripeCustomer(business));

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard/billing?checkout=success`,
    cancel_url: `${appUrl}/dashboard/billing?checkout=cancelled`,
    client_reference_id: business.id,
    metadata: { businessId: business.id, targetPlan },
    subscription_data: { metadata: { businessId: business.id, targetPlan } },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/** Creates a Stripe Billing Portal session so the owner can manage/cancel. */
export async function createPortalSession(
  business: Business,
  appUrl: string
): Promise<string> {
  if (!business.stripe_customer_id) {
    throw new Error("No Stripe customer on file yet — upgrade first.");
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: business.stripe_customer_id,
    return_url: `${appUrl}/dashboard/billing`,
  });

  return session.url;
}

async function createStripeCustomer(business: Business): Promise<string> {
  const customer = await stripe().customers.create({
    email: business.owner_email,
    name: business.name,
    metadata: { businessId: business.id },
  });

  const supabase = createClient();
  await supabase
    .from("businesses")
    .update({ stripe_customer_id: customer.id })
    .eq("id", business.id);

  return customer.id;
}

/**
 * Verifies and parses a raw webhook request body. Must receive the RAW
 * (unparsed) request body — Stripe signs the exact bytes sent, so running
 * this through JSON.parse first would break signature verification.
 */
export function constructWebhookEvent(
  rawBody: string,
  signature: string
): Stripe.Event {
  return stripe().webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}

function planFromPriceId(priceId: string | undefined): Plan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_ID_BUSINESS) return "business";
  return null;
}

/**
 * Applies the effect of a Stripe webhook event to the matching business's
 * `plan`/`stripe_subscription_id`. Uses the service-role client since
 * webhooks arrive with no Supabase session attached.
 */
export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  const supabase = createServiceRoleClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const businessId = session.client_reference_id ?? session.metadata?.businessId;
      const targetPlan = session.metadata?.targetPlan as Plan | undefined;
      if (!businessId || !targetPlan) break;

      await supabase
        .from("businesses")
        .update({
          plan: targetPlan,
          stripe_customer_id: (session.customer as string) ?? undefined,
          stripe_subscription_id: (session.subscription as string) ?? undefined,
        })
        .eq("id", businessId);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const businessId = subscription.metadata?.businessId;
      const priceId = subscription.items.data[0]?.price?.id;
      const plan = planFromPriceId(priceId);
      if (!businessId || !plan) break;

      // Downgrade proactively if Stripe reports the subscription as no
      // longer active (past_due beyond grace period, unpaid, etc.) —
      // simplest safe behavior is to only upgrade/keep-current while
      // status is healthy, and let the `deleted` handler below cover the
      // terminal case.
      if (["active", "trialing"].includes(subscription.status)) {
        await supabase
          .from("businesses")
          .update({ plan, stripe_subscription_id: subscription.id })
          .eq("id", businessId);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const businessId = subscription.metadata?.businessId;
      if (!businessId) break;

      await supabase
        .from("businesses")
        .update({ plan: "free", stripe_subscription_id: null })
        .eq("id", businessId);
      break;
    }

    default:
      // Ignore anything else — Stripe sends many event types we don't act on.
      break;
  }
}
