"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function BookingLinkWidget({ url }: { url: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 160 }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="flex items-center gap-4 p-4">
      {qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="QR code for your booking link" className="h-20 w-20 rounded" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Your booking link</p>
        <p className="truncate text-sm text-muted-foreground">{url}</p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy link"}
        </Button>
      </div>
    </Card>
  );
}
