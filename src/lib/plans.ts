import type { Plan } from "@/lib/types";

export interface PlanConfig {
  name: string;
  priceMonthly: number; // dollars, 0 for Free
  bookingLimitPerMonth: number | null; // null = unlimited
  virtualOnly: boolean;
  routeOptimization: boolean;
  smsWhatsapp: boolean;
  multiUser: boolean;
  aiFollowUp: boolean;
  stripePriceEnvVar?: "STRIPE_PRICE_ID_PRO" | "STRIPE_PRICE_ID_BUSINESS";
}

/**
 * Single source of truth for plan features. Every gating check in the app
 * (booking creation, route optimization access, notification preferences,
 * AI drafting) reads from here rather than hardcoding plan names, so
 * changing what a tier includes means editing one object, not hunting
 * through the codebase.
 *
 * Interpretation note: the original spec is explicit that Free excludes
 * route optimization, SMS/WhatsApp, and in-person bookings, and that
 * Business adds SMS/WhatsApp + multi-user + AI follow-up on top of Pro.
 * It does NOT explicitly say email or push notifications are restricted
 * on Free (Pro's description just lists them as included) — so email and
 * push remain available on every tier here rather than being gated. If
 * you want Free to lose push too, add a `push: boolean` field and check
 * it in `lib/push.ts`.
 */
export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    name: "Free",
    priceMonthly: 0,
    bookingLimitPerMonth: 10,
    virtualOnly: true,
    routeOptimization: false,
    smsWhatsapp: false,
    multiUser: false,
    aiFollowUp: false,
  },
  pro: {
    name: "Pro",
    priceMonthly: 29,
    bookingLimitPerMonth: null,
    virtualOnly: false,
    routeOptimization: true,
    smsWhatsapp: false,
    multiUser: false,
    aiFollowUp: false,
    stripePriceEnvVar: "STRIPE_PRICE_ID_PRO",
  },
  business: {
    name: "Business",
    priceMonthly: 79,
    bookingLimitPerMonth: null,
    virtualOnly: false,
    routeOptimization: true,
    smsWhatsapp: true,
    multiUser: true,
    aiFollowUp: true,
    stripePriceEnvVar: "STRIPE_PRICE_ID_BUSINESS",
  },
};

export function planConfig(plan: Plan): PlanConfig {
  return PLANS[plan];
}

export function hasReachedBookingLimit(
  plan: Plan,
  bookingsThisMonth: number
): boolean {
  const limit = PLANS[plan].bookingLimitPerMonth;
  return limit !== null && bookingsThisMonth >= limit;
}
