"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubNav({ items }: { items: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  return (
    <nav className="seg" aria-label="Section">
      {items.map((item) => (
        <Link key={item.href} href={item.href} data-active={pathname === item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
