"use client";

import { useEffect, useState } from "react";

// Keep the live region mounted and combine rapid filter changes into one update.
export function LiveStatus({ message }: { message: string }) {
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(message), 300);
    return () => clearTimeout(timer);
  }, [message]);
  return <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>;
}
