import Link from "next/link";
import { Icon, type IconName } from "./icons";

export function AppBar({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="appbar">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
        {back && (
          <Link href={back} className="icon-btn" aria-label="Back" style={{ marginTop: 2 }}>
            <Icon name="back" strokeWidth={2} />
          </Link>
        )}
        <div style={{ minWidth: 0 }}>
          <h1>{title}</h1>
          {subtitle && <div className="sub">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="appbar-actions">{actions}</div>}
    </header>
  );
}

export function IconLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: IconName;
  label: string;
}) {
  return (
    <Link href={href} className="icon-btn" aria-label={label} title={label}>
      <Icon name={icon} />
    </Link>
  );
}
