import Link from "next/link";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AVAILABLE_TAGS } from "./actions";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { tag?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_user_id", user!.id)
    .single();

  let clientsQuery = supabase
    .from("clients")
    .select("*")
    .eq("business_id", business!.id)
    .order("created_at", { ascending: false });

  if (searchParams.tag) {
    clientsQuery = clientsQuery.contains("tags", [searchParams.tag]);
  }

  const { data: clients } = await clientsQuery;

  const { data: bookings } = await supabase
    .from("bookings")
    .select("client_id, start_time, status")
    .eq("business_id", business!.id)
    .not("client_id", "is", null);

  const historyByClient = new Map<
    string,
    { count: number; lastBooking: string }
  >();
  for (const booking of bookings ?? []) {
    if (!booking.client_id) continue;
    const existing = historyByClient.get(booking.client_id);
    historyByClient.set(booking.client_id, {
      count: (existing?.count ?? 0) + 1,
      lastBooking:
        existing && existing.lastBooking > booking.start_time
          ? existing.lastBooking
          : booking.start_time,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-sm text-muted-foreground">
          Everyone who's booked with you, deduplicated by email.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/dashboard/clients"
          className={`rounded-full border px-3 py-1 text-sm ${
            !searchParams.tag ? "border-primary bg-primary text-primary-foreground" : "border-border"
          }`}
        >
          All
        </Link>
        {AVAILABLE_TAGS.map((tag) => (
          <Link
            key={tag}
            href={`/dashboard/clients?tag=${encodeURIComponent(tag)}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              searchParams.tag === tag
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border"
            }`}
          >
            {tag}
          </Link>
        ))}
      </div>

      {(clients ?? []).length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No clients {searchParams.tag ? `tagged "${searchParams.tag}"` : "yet"}.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {clients!.map((client) => {
            const history = historyByClient.get(client.id);
            return (
              <Link key={client.id} href={`/dashboard/clients/${client.id}`}>
                <Card className="flex items-center justify-between p-4 hover:bg-secondary/50">
                  <div>
                    <p className="font-medium">{client.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {client.email}
                      {client.phone ? ` · ${client.phone}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {client.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{history?.count ?? 0} bookings</p>
                      {history && (
                        <p>Last: {format(new Date(history.lastBooking), "MMM d, yyyy")}</p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
