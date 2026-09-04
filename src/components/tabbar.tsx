"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

const TABS: Array<{ href: string; label: string; icon: IconName; match: string }> = [
  { href: "/today", label: "Today", icon: "home", match: "/today" },
  { href: "/record", label: "Record", icon: "record", match: "/record" },
  { href: "/nadi", label: "Nadi", icon: "sparkle", match: "/nadi" },
  { href: "/care", label: "Care", icon: "care", match: "/care" },
  { href: "/profile", label: "Profile", icon: "user", match: "/profile" },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => {
        const active = pathname === tab.match || pathname.startsWith(`${tab.match}/`);
        if (tab.href === "/nadi") {
          return (
            <Link key={tab.href} href={tab.href} data-active={active} aria-current={active ? "page" : undefined}>
              <span className="orb"><Icon name="sparkle" strokeWidth={2} /></span>
              {tab.label}
            </Link>
          );
        }
        return (
          <Link key={tab.href} href={tab.href} data-active={active} aria-current={active ? "page" : undefined}>
            <Icon name={tab.icon} size={21} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
