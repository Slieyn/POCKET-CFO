"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { ToastStack, type ToastItem } from "./ui";
import type { NavigationOrientation, SessionUser, Tab } from "@/lib/types";

const NAV: { id: Tab; label: string; icon: IconName; ownerOnly?: boolean }[] = [
  { id: "dashboard", label: "Overview", icon: "dashboard" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "transactions", label: "Transactions", icon: "transactions" },
  { id: "customers", label: "Customers", icon: "customers" },
  { id: "deals", label: "Quotes & invoices", icon: "deals" },
  { id: "reports", label: "Reports", icon: "reports" },
  { id: "integrations", label: "Integrations", icon: "integrations", ownerOnly: true },
  { id: "settings", label: "Settings", icon: "settings" },
];

const TITLES: Record<Tab, { title: string; subtitle: string }> = {
  dashboard: { title: "Overview", subtitle: "Your business at a glance" },
  calendar: { title: "Calendar", subtitle: "Plan your day and keep work moving" },
  transactions: { title: "Transactions", subtitle: "Every rand in and out" },
  customers: { title: "Customers", subtitle: "The people behind your revenue" },
  deals: { title: "Quotes & invoices", subtitle: "Documents that get you paid" },
  reports: { title: "Reports", subtitle: "Your numbers, ready to share" },
  integrations: { title: "Integrations", subtitle: "Connect the tools your business already uses" },
  settings: { title: "Settings", subtitle: "Workspace, security and data" },
};

export function AppShell({
  user,
  business,
  role,
  tab,
  orientation,
  toasts,
  children,
  onTab,
  onBack,
  onSignOut,
  onOrientation,
  onAddTransaction,
  onDismissToast,
}: {
  user: SessionUser;
  business: { id: string; name: string };
  role: string;
  tab: Tab;
  orientation: NavigationOrientation;
  toasts: ToastItem[];
  children: ReactNode;
  onTab: (tab: Tab) => void;
  onBack: () => void;
  onSignOut: () => void;
  onOrientation: (orientation: NavigationOrientation) => void;
  onAddTransaction: () => void;
  onDismissToast: (id: string) => void;
}) {
  const heading = TITLES[tab];
  const today = new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const navRef = useRef<HTMLElement | null>(null);
  const [navOverflow, setNavOverflow] = useState({ left: false, right: false });

  const updateNavOverflow = useCallback(() => {
    const el = navRef.current;
    if (!el) {
      setNavOverflow({ left: false, right: false });
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    setNavOverflow({
      left: el.scrollLeft > 4,
      right: max > 4 && el.scrollLeft < max - 4,
    });
  }, []);

  useEffect(() => {
    updateNavOverflow();
    window.addEventListener("resize", updateNavOverflow);
    return () => window.removeEventListener("resize", updateNavOverflow);
  }, [updateNavOverflow, role]);

  // Keep the active tab in view when the navigation scrolls horizontally on
  // narrow screens, so the current page is always discoverable.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    nav.querySelector<HTMLElement>(".nav-link.active")?.scrollIntoView({
      behavior: "auto",
      block: "nearest",
      inline: "center",
    });
    updateNavOverflow();
  }, [tab, updateNavOverflow]);

  function scrollNav(direction: -1 | 1) {
    const el = navRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(140, Math.round(el.clientWidth * 0.72)), behavior: "smooth" });
  }

  return (
    <div className={`app app-${orientation}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>

      <aside className="sidebar">
        <button
          className="sidebar-brand"
          type="button"
          onClick={() => onTab("dashboard")}
          title="Go to Overview"
          aria-label="POCKET CFO — go to Overview"
        >
          <img src="/pocket-cfo-mark.svg" alt="" width={44} height={44} />
          <div>
            <span className="brand-word">POCKET <strong>CFO</strong></span>
            <span className="sidebar-tagline">Know your numbers. Grow your business.</span>
          </div>
        </button>

        <div className="main-nav-wrap">
          <button
            type="button"
            className="nav-scroll-button nav-scroll-left"
            data-visible={navOverflow.left}
            onClick={() => scrollNav(-1)}
            aria-label="Show earlier pages"
            aria-hidden={!navOverflow.left}
            tabIndex={navOverflow.left ? 0 : -1}
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <nav
            className="main-nav"
            aria-label="Main navigation"
            ref={navRef}
            onScroll={updateNavOverflow}
          >
            {NAV.filter((item) => !item.ownerOnly || role === "OWNER").map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? "nav-link active" : "nav-link"}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => onTab(item.id)}
              >
                <Icon name={item.icon} size={19} />
                <span>{item.label}</span>
                {item.id === "integrations" && <span className="nav-new">New</span>}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="nav-scroll-button nav-scroll-right"
            data-visible={navOverflow.right}
            onClick={() => scrollNav(1)}
            aria-label="Show more pages"
            aria-hidden={!navOverflow.right}
            tabIndex={navOverflow.right ? 0 : -1}
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>

        <div className="sidebar-spacer" />

        <button className="sidebar-add" type="button" onClick={onAddTransaction}>
          <span><Icon name="plus" size={18} /></span>
          Add transaction
        </button>

        <div className="sidebar-workspace">
          <span className="sidebar-label">Workspace</span>
          <strong>{business.name}</strong>
          <small>{user.email}</small>
          <div className="sidebar-actions">
            <div className="layout-switch" role="group" aria-label="Navigation layout">
              <button
                type="button"
                className={orientation === "vertical" ? "selected" : ""}
                aria-pressed={orientation === "vertical"}
                title="Side navigation"
                aria-label="Use side navigation"
                onClick={() => onOrientation("vertical")}
              >
                <Icon name="panelLeft" size={16} />
              </button>
              <button
                type="button"
                className={orientation === "horizontal" ? "selected" : ""}
                aria-pressed={orientation === "horizontal"}
                title="Top navigation"
                aria-label="Use top navigation"
                onClick={() => onOrientation("horizontal")}
              >
                <Icon name="panelTop" size={16} />
              </button>
            </div>
            <button className="icon-button" type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-heading">
            {tab !== "dashboard" && (
              <button
                className="back-button"
                type="button"
                onClick={onBack}
                title="Go back to the previous page"
                aria-label="Go back to the previous page"
              >
                <Icon name="chevronLeft" size={16} />
                <span>Back</span>
              </button>
            )}
            <div className="topbar-heading-text">
              <span className="eyebrow">{heading.subtitle}</span>
              <h1>{heading.title}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="today"><Icon name="calendar" size={15} />{today}</span>
            {user.demo && <span className="demo-chip">Demo workspace</span>}
            <button className="button primary topbar-add" type="button" onClick={onAddTransaction}>
              <Icon name="plus" size={17} />
              Add transaction
            </button>
            <div className="topbar-user" title={user.email}>
              <span className="avatar avatar-sm" aria-hidden="true">
                {user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}
              </span>
              <span>{user.name}</span>
            </div>
            <button className="icon-button mobile-signout" type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <Icon name="logout" size={17} />
            </button>
          </div>
        </header>

        <main id="main-content" className="main-content">
          <div className="view-enter" key={tab}>
            {children}
          </div>
        </main>

        <footer className="app-footer">
          <span>POCKET CFO is a record-keeping and planning tool, not a bank or credit provider.</span>
          <span>Amounts in ZAR · Your data belongs to you.</span>
        </footer>
      </div>

      <ToastStack toasts={toasts} onDismiss={onDismissToast} />
    </div>
  );
}
