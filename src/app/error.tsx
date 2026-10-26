"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("POCKET CFO page error", error);
  }, [error]);

  return (
    <main className="status-page" role="alert">
      <span className="empty-icon"><Icon name="alert" size={24} /></span>
      <h1>Something went wrong</h1>
      <p>
        POCKET CFO could not finish loading this view. Your saved records are safe. Try again, or
        reload the page if the problem continues.
      </p>
      {error.digest && <p className="fine-print">Reference: {error.digest}</p>}
      <div className="button-row">
        <button className="button primary" type="button" onClick={reset}>
          Try again
        </button>
        <Link className="button secondary" href="/">
          Back to POCKET CFO
        </Link>
      </div>
    </main>
  );
}
