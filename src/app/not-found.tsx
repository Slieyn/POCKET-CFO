import Link from "next/link";
import { Icon } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="status-page">
      <span className="empty-icon"><Icon name="search" size={24} /></span>
      <h1>Page not found</h1>
      <p>
        That page does not exist in POCKET CFO. It may have moved, or the link may be incomplete.
      </p>
      <Link className="button primary" href="/">
        Go to your workspace
      </Link>
    </main>
  );
}
