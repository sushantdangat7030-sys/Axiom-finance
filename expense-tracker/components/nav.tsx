"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabase/client";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/import", label: "Import" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname.startsWith("/login")) return null;

  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b px-4 py-3 sm:px-6">
      <span className="mr-4 whitespace-nowrap text-sm font-semibold">◆ Axiom Finance</span>
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href}
          className={cn(
            "whitespace-nowrap rounded-md px-3 py-1.5 text-sm",
            pathname === link.href ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
          )}>
          {link.label}
        </Link>
      ))}
      <button
        className="ml-auto whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50"
        onClick={async () => { await supabaseBrowser().auth.signOut(); router.push("/login"); }}>
        Sign out
      </button>
    </nav>
  );
}
