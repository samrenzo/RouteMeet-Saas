import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TagsEditor } from "@/components/clients/tags-editor";
import { NotesSection } from "@/components/clients/notes-section";

export default async function ClientDetailPage({
  params,
}: {
  params: { clientId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: client } = await supabase
    .from("clients")
    .select("*, businesses!inner(id, owner_user_id, plan)")
    .eq("id", params.clientId)
    .single();

  if (!client || (client as any).businesses.owner_user_id !== user!.id) {
    notFound();
  }

  const businessId = (client as any).businesses.id as string;
  const canUseAiFollowUp = (client as any).businesses.plan === "business";

  const [{ data: bookings }, { data: notes }] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .eq("client_id", client.id)
      .order("start_time", { ascending: false }),
    supabase
      .from("client_notes")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
        <p className="text-sm text-muted-foreground">
          {client.email}
          {client.phone ? ` · ${client.phone}` : ""}
        </p>
        <div className="mt-3">
          <TagsEditor clientId={client.id} initialTags={client.tags} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          Booking history
        </h2>
        {(bookings ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {bookings!.map((booking) => (
              <Card key={booking.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-medium">
                    {format(new Date(booking.start_time), "EEE, MMM d, yyyy 'at' h:mm a")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {booking.location_type === "virtual" ? "Virtual" : booking.address}
                  </p>
                </div>
                <Badge variant="outline">{booking.status.replace("_", " ")}</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Notes</h2>
        <NotesSection
          clientId={client.id}
          businessId={businessId}
          clientName={client.name}
          notes={notes ?? []}
          canUseAiFollowUp={canUseAiFollowUp}
        />
      </div>
    </div>
  );
}
