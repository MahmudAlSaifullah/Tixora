"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const encoded = encodeURIComponent(url);
  const text = encodeURIComponent(title);
  const links = [
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encoded}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${text}%20${encoded}` },
    { label: "X", href: `https://x.com/intent/tweet?url=${encoded}&text=${text}` },
  ];

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url });
    } catch {
      // The person closed the share sheet.
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Button key={link.label} asChild variant="outline" size="sm">
          <a href={link.href} target="_blank" rel="noopener noreferrer">
            {link.label}
          </a>
        </Button>
      ))}
      <Button variant="outline" size="sm" onClick={copy} type="button">
        {copied ? <Check /> : <Link2 />} {copied ? "Copied" : "Copy link"}
      </Button>
      <Button variant="outline" size="sm" onClick={nativeShare} type="button" className="sm:hidden" aria-label="Share">
        <Share2 />
      </Button>
    </div>
  );
}
