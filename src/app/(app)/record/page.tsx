import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getTimeline } from "@/lib/record";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppBar, IconLink } from "@/components/appbar";
import { SubNav } from "@/components/subnav";

export const metadata = { title: "Record · Aayu" };
export const dynamic = "force-dynamic";

export default async function RecordPage() {
  const ctx = await requireUser();
  const [timeline, total] = await Promise.all([
    getTimeline(ctx, 80),
    db.observation.count({ where: { userId: ctx.user.id } }),
  ]);
  await audit({ userId: ctx.user.id, action: "record.read", resource: "timeline" });

  return (
    <>
      <AppBar
        title="Record"
        subtitle={`${total.toLocaleString("en-GB")} readings · every source`}
        actions={<IconLink href="/log" icon="plus" label="Log a reading" />}
      />
      <main className="shell-body">
        <SubNav
          items={[
            { href: "/record", label: "Timeline" },
            { href: "/record/labs", label: "Labs" },
            { href: "/record/documents", label: "Documents" },
            { href: "/record/sources", label: "Sources" },
          ]}
        />

        {timeline.length === 0 ? (
          <div className="empty-state">
            <b>Your record is empty</b>
            Log a reading, upload a lab report, or import an export file to start it.
            <div style={{ marginTop: 16, display: "flex", gap: 9, justifyContent: "center" }}>
              <Link href="/log" className="btn sm">Log a reading</Link>
              <Link href="/record/sources" className="btn sm ghost">Import a file</Link>
            </div>
          </div>
        ) : (
          <section className="timeline">
            {timeline.map((event) => (
              <Link
                href={event.href ?? "/record"}
                className="tev"
                key={`${event.type}-${event.id}`}
                data-muted={event.muted ? "true" : "false"}
              >
                <div className="d">{formatWhen(event.at)}</div>
                <b>{event.title}</b>
                <small>{event.detail}</small>
              </Link>
            ))}
          </section>
        )}
      </main>
    </>
  );
}

function formatWhen(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Yesterday · ${time}`;
  if (days < 7) return `${days} days ago · ${time}`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
