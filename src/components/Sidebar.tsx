'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useState, useEffect } from 'react';

interface IntegrationStatus {
  demoMode: boolean;
  razorpayTestMode: boolean;
  voiceSimulator: boolean;
  twilioEnabled: boolean;
}

interface SidebarProps {
  integrationStatus?: IntegrationStatus;
}

const NAV_ITEMS = [
  { href: '/',        icon: '⬡', label: 'Command Center' },
  { href: '/queue',   icon: '≡', label: 'Recovery Queue' },
  { href: '/metrics', icon: '◈', label: 'Metrics' },
];

const SETTINGS_ITEMS = [
  { href: '/settings', icon: '◎', label: 'Settings / Demo' },
];

export default function Sidebar({ integrationStatus }: SidebarProps) {
  const pathname = usePathname();
  const [liveStatus, setLiveStatus] = useState<IntegrationStatus | null>(integrationStatus ?? null);

  useEffect(() => {
    if (!integrationStatus) {
      fetch('/api/dashboard')
        .then(r => r.json())
        .then(d => {
          if (d.integrationStatus) setLiveStatus(d.integrationStatus);
        })
        .catch(() => {});
    } else {
      setLiveStatus(integrationStatus);
    }
  }, [integrationStatus]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const status = liveStatus ?? {
    demoMode: true,
    razorpayTestMode: false,
    voiceSimulator: true,
    twilioEnabled: false,
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

      {/* Integration chips */}
      <div className="sidebar-chips">
        <div style={{ fontSize: 10, fontWeight: 700, color: '#4A6382', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          Integrations
        </div>
        <span className={`chip ${status.demoMode ? 'chip-demo' : 'chip-inactive'}`}>
          <span className="chip-dot" style={{ background: status.demoMode ? '#68D391' : '#374151' }} />
          DEMO MODE
        </span>
        <span className={`chip ${status.razorpayTestMode ? 'chip-rzp' : 'chip-inactive'}`}>
          <span className="chip-dot" style={{ background: status.razorpayTestMode ? '#63B3ED' : '#374151' }} />
          RZP TEST
        </span>
        <span className={`chip ${status.voiceSimulator ? 'chip-voice' : 'chip-inactive'}`}>
          <span className="chip-dot" style={{ background: status.voiceSimulator ? '#B794F4' : '#374151' }} />
          VOICE SIM
        </span>
        <span className={`chip ${status.twilioEnabled ? 'chip-twilio' : 'chip-inactive'}`}>
          <span className="chip-dot" style={{ background: status.twilioEnabled ? '#F687B3' : '#374151' }} />
          TWILIO
        </span>
      </div>
    </aside>
  );
}
