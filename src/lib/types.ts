// Hand-written to match supabase/migrations/0001_init.sql.
// Once you have a live project, regenerate with:
//   supabase gen types typescript --project-id <ref> > src/lib/types.ts

export type LocationType = "virtual" | "in_person";
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";
export type Plan = "free" | "pro" | "business";

export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          owner_user_id: string;
          name: string;
          slug: string;
          home_base_address: string | null;
          home_base_lat: number | null;
          home_base_lng: number | null;
          timezone: string;
          plan: Plan;
          google_refresh_token: string | null;
          notify_email: boolean;
          notify_sms: boolean;
          notify_whatsapp: boolean;
          notify_push: boolean;
          owner_phone: string | null;
          owner_email: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          bookings_this_month: number;
          onboarding_completed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_user_id: string;
          name: string;
          slug: string;
          home_base_address?: string | null;
          home_base_lat?: number | null;
          home_base_lng?: number | null;
          timezone?: string;
          plan?: Plan;
          google_refresh_token?: string | null;
          notify_email?: boolean;
          notify_sms?: boolean;
          notify_whatsapp?: boolean;
          notify_push?: boolean;
          owner_phone?: string | null;
          owner_email: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          bookings_this_month?: number;
          onboarding_completed?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["businesses"]["Insert"]>;
      };
      clients: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          tags: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          tags?: string[];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
      };
      client_notes: {
        Row: {
          id: string;
          business_id: string;
          client_id: string;
          booking_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          client_id: string;
          booking_id?: string | null;
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["client_notes"]["Insert"]>;
      };
      route_stats: {
        Row: {
          id: string;
          business_id: string;
          route_date: string;
          naive_seconds: number;
          optimized_seconds: number;
          stop_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          route_date: string;
          naive_seconds: number;
          optimized_seconds: number;
          stop_count?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["route_stats"]["Insert"]>;
      };
      team_invites: {
        Row: {
          id: string;
          business_id: string;
          email: string;
          invited_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          email: string;
          invited_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["team_invites"]["Insert"]>;
      };
      bookings: {
        Row: {
          id: string;
          business_id: string;
          client_id: string | null;
          client_name: string;
          client_email: string;
          client_phone: string | null;
          location_type: LocationType;
          address: string | null;
          lat: number | null;
          lng: number | null;
          start_time: string;
          end_time: string;
          status: BookingStatus;
          meet_link: string | null;
          event_id: string | null;
          reminder_sent: boolean;
          push_reminder_sent: boolean;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          client_id?: string | null;
          client_name: string;
          client_email: string;
          client_phone?: string | null;
          location_type: LocationType;
          address?: string | null;
          lat?: number | null;
          lng?: number | null;
          start_time: string;
          end_time: string;
          status?: BookingStatus;
          meet_link?: string | null;
          event_id?: string | null;
          reminder_sent?: boolean;
          push_reminder_sent?: boolean;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bookings"]["Insert"]>;
      };
      business_hours: {
        Row: {
          id: string;
          business_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["business_hours"]["Insert"]
        >;
      };
    };
  };
}

export type Business = Database["public"]["Tables"]["businesses"]["Row"];
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type ClientNote = Database["public"]["Tables"]["client_notes"]["Row"];
export type RouteStats = Database["public"]["Tables"]["route_stats"]["Row"];
export type TeamInvite = Database["public"]["Tables"]["team_invites"]["Row"];
export type Booking = Database["public"]["Tables"]["bookings"]["Row"];
export type BusinessHours =
  Database["public"]["Tables"]["business_hours"]["Row"];
