'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/',        icon: '⬡', label: 'Command Center' },
  { href: '/queue',   icon: '≡', label: 'Recovery Queue' },
  { href: '/metrics', icon: '◈', label: 'Metrics' },
];

const SETTINGS_ITEMS = [
  { href: '/settings', icon: '◎', label: 'Settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-title">
          <span className="sidebar-logo-accent" />
          RevoX
        </div>
        <div className="sidebar-logo-sub">Agentic Recovery Intelligence</div>
      </div>

      {/* Main nav */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Engine</div>
        {NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <div className="sidebar-section-label" style={{ marginTop: 12 }}>Config</div>
        {SETTINGS_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Footer branding */}
      <div style={{ padding: '16px 22px 22px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#4A6382', letterSpacing: '0.06em' }}>
          POWERED BY RAZORPAY
        </div>
      </div>
    </aside>
  );
}
