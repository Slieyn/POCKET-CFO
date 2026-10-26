"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthScreen } from "@/components/AuthScreen";
import { CalendarView } from "@/components/CalendarView";
import { CustomersView } from "@/components/CustomersView";
import { DashboardView } from "@/components/DashboardView";
import { DealsView } from "@/components/DealsView";
import { IntegrationsView } from "@/components/IntegrationsView";
import { ReportsView } from "@/components/ReportsView";
import { SettingsView } from "@/components/SettingsView";
import { TransactionsView } from "@/components/TransactionsView";
import { LoadingScreen, type ToastItem } from "@/components/ui";
import { api } from "@/lib/api";
import type { NavigationOrientation, Tab, Workspace } from "@/lib/types";

const DEFAULT_BUDGET = { operationsPercent: 60, reservePercent: 20, ownerDrawPercent: 20 };

const TABS: Tab[] = [
  "dashboard",
  "calendar",
  "transactions",
  "customers",
  "deals",
  "reports",
  "integrations",
  "settings",
];

function tabFromHash(hash: string): Tab | null {
  const value = hash.replace(/^#/, "").trim() as Tab;
  return TABS.includes(value) ? value : null;
}

function tabUrl(tab: Tab) {
  return `${window.location.pathname}${window.location.search}#${tab}`;
}

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [initialising, setInitialising] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [newDealCustomerId, setNewDealCustomerId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<NavigationOrientation>(() => {
    if (typeof window === "undefined") return "vertical";
    return window.localStorage.getItem("pocketcfo-navigation-orientation") === "horizontal"
      ? "horizontal"
      : "vertical";
  });

  const notify = useCallback((tone: "success" | "error" | "info", message: string) => {
    setToasts((current) => [
      ...current.slice(-3),
      { id: crypto.randomUUID(), tone, message },
    ]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const tabRef = useRef<Tab>("dashboard");
  const routedRef = useRef(false);
  const sessionRole = workspace?.auth.role;

  const goToTab = useCallback(
    (next: Tab) => {
      if (next === tabRef.current) return;
      if (next === "integrations" && sessionRole !== "OWNER") return;
      tabRef.current = next;
      setTab(next);
      const depth = Number(window.history.state?.pocketcfoDepth) || 0;
      window.history.pushState({ pocketcfoTab: next, pocketcfoDepth: depth + 1 }, "", tabUrl(next));
    },
    [sessionRole],
  );

  const goBack = useCallback(() => {
    const depth = Number(window.history.state?.pocketcfoDepth) || 0;
    if (depth > 0) {
      window.history.back();
      return;
    }
    // A deep link opened directly has no in-app history to step back to, so
    // return to the overview without adding a stop the browser could revisit.
    tabRef.current = "dashboard";
    setTab("dashboard");
    window.history.replaceState({ pocketcfoTab: "dashboard", pocketcfoDepth: 0 }, "", tabUrl("dashboard"));
  }, []);

  // Restore the page named in the URL once the workspace is available, and keep
  // each tab in browser history so Back/Forward behave the way people expect.
  useEffect(() => {
    if (!workspace || routedRef.current) return;
    routedRef.current = true;
    const requested = tabFromHash(window.location.hash);
    const initial =
      requested && (requested !== "integrations" || workspace.auth.role === "OWNER") ? requested : tabRef.current;
    tabRef.current = initial;
    setTab(initial);
    window.history.replaceState({ pocketcfoTab: initial, pocketcfoDepth: 0 }, "", tabUrl(initial));
  }, [workspace]);

  useEffect(() => {
    if (!sessionRole) return;

    function syncFromLocation() {
      const stateTab = (window.history.state as { pocketcfoTab?: Tab } | null)?.pocketcfoTab;
      const requested =
        stateTab && TABS.includes(stateTab) ? stateTab : tabFromHash(window.location.hash) ?? "dashboard";
      const next = requested === "integrations" && sessionRole !== "OWNER" ? "dashboard" : requested;
      tabRef.current = next;
      setTab(next);
    }

    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("hashchange", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener("hashchange", syncFromLocation);
    };
  }, [sessionRole]);

  const refresh = useCallback(async () => {
    const next = await api.workspace();
    if (!next) {
      setWorkspace(null);
      throw new Error("Your session has ended. Please sign in again.");
    }
    setWorkspace(next);
  }, []);

  useEffect(() => {
    let active = true;
    let splashTimer: number | undefined;
    const startedAt = Date.now();

    api.workspace()
      .then((next) => {
        if (!active || !next) return;
        // Apply the deep-linked page before the first workspace paint so a
        // shared link never flashes the overview first.
        const requested = tabFromHash(window.location.hash);
        if (requested && (requested !== "integrations" || next.auth.role === "OWNER")) {
          tabRef.current = requested;
          setTab(requested);
        }
        setWorkspace(next);
      })
      .catch((error: unknown) => {
        if (active) setAuthError(error instanceof Error ? error.message : "POCKET CFO could not connect to your workspace.");
      })
      .finally(() => {
        // Give the animated mark enough time to read as an intentional intro
        // instead of a flash on fast connections.
        const remaining = Math.max(0, 850 - (Date.now() - startedAt));
        splashTimer = window.setTimeout(() => {
          if (active) setInitialising(false);
        }, remaining);
      });

    return () => {
      active = false;
      if (splashTimer) window.clearTimeout(splashTimer);
    };
  }, []);

  useEffect(() => {
    if (tab !== "dashboard") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [tab]);

  function changeOrientation(next: NavigationOrientation) {
    setOrientation(next);
    window.localStorage.setItem("pocketcfo-navigation-orientation", next);
  }

  async function handleLogin(input: { email: string; password: string }) {
    setAuthBusy(true);
    setAuthError("");
    try {
      await api.login(input);
      await refresh();
      notify("success", "Welcome back.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleRegister(input: {
    name: string;
    businessName: string;
    email: string;
    password: string;
    includeSampleData: boolean;
  }) {
    setAuthBusy(true);
    setAuthError("");
    try {
      const result = await api.register(input);
      await refresh();
      notify(
        "success",
        result.sampleDataAdded
          ? "Workspace created. Sample records are labelled so you can explore and remove them."
          : "Workspace created. Welcome to POCKET CFO.",
      );
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to create your account.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleDemo() {
    setAuthBusy(true);
    setAuthError("");
    try {
      await api.demo();
      await refresh();
      notify("success", "Demo workspace ready. Explore freely — nothing here is real money.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to open the demo workspace.");
    } finally {
      setAuthBusy(false);
    }
  }

  function resetNavigation() {
    routedRef.current = false;
    tabRef.current = "dashboard";
    setTab("dashboard");
    window.history.replaceState(
      { pocketcfoTab: "dashboard", pocketcfoDepth: 0 },
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }

  async function handleSignOut() {
    try {
      await api.logout();
    } catch {
      // The session may already have expired; clear the local view either way.
    }
    setWorkspace(null);
    resetNavigation();
    setToasts([]);
  }

  function handleSessionEnded() {
    setWorkspace(null);
    resetNavigation();
    setToasts([]);
    setAuthError("");
  }

  async function saveBudget(next: { operationsPercent: number; reservePercent: number; ownerDrawPercent: number }) {
    await api.budget.save(next);
    await refresh();
  }

  if (initialising) return <LoadingScreen />;

  if (!workspace) {
    return (
      <AuthScreen
        busy={authBusy}
        error={authError}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onDemo={handleDemo}
      />
    );
  }

  const { user, business, role } = workspace.auth;
  const budget = workspace.budget ?? DEFAULT_BUDGET;

  return (
    <AppShell
      user={user}
      business={business}
      role={role}
      tab={tab}
      orientation={orientation}
      toasts={toasts}
      onTab={goToTab}
      onBack={goBack}
      onSignOut={handleSignOut}
      onOrientation={changeOrientation}
      onAddTransaction={() => goToTab("transactions")}
      onDismissToast={dismissToast}
    >
      {tab === "dashboard" && (
        <DashboardView
          user={user}
          dashboard={workspace.overview}
          transactions={workspace.transactions}
          budget={budget}
          onNavigate={goToTab}
          onSaveBudget={saveBudget}
          onAddTransaction={() => goToTab("transactions")}
          onAddCustomer={() => goToTab("customers")}
          notify={notify}
        />
      )}

      {tab === "calendar" && <CalendarView notify={notify} />}

      {tab === "transactions" && (
        <TransactionsView
          transactions={workspace.transactions}
          customers={workspace.customers}
          businessName={business.name}
          onRefresh={refresh}
          notify={notify}
        />
      )}

      {tab === "customers" && (
        <CustomersView
          customers={workspace.customers}
          transactions={workspace.transactions}
          onRefresh={refresh}
          onCreateDeal={(customerId) => {
            setNewDealCustomerId(customerId);
            goToTab("deals");
          }}
          notify={notify}
        />
      )}

      {tab === "deals" && (
        <DealsView
          deals={workspace.deals}
          customers={workspace.customers}
          businessName={business.name}
          user={user}
          newDealCustomerId={newDealCustomerId}
          onConsumeNewDeal={() => setNewDealCustomerId(null)}
          onNavigateCustomers={() => goToTab("customers")}
          onRefresh={refresh}
          notify={notify}
        />
      )}

      {tab === "reports" && (
        <ReportsView
          dashboard={workspace.overview}
          transactions={workspace.transactions}
          businessName={business.name}
          onNavigate={goToTab}
          notify={notify}
        />
      )}

      {tab === "integrations" && role === "OWNER" && (
        <IntegrationsView
          isOwner={role === "OWNER"}
          onWorkspaceRefresh={refresh}
          notify={notify}
        />
      )}

      {tab === "settings" && (
        <SettingsView
          user={user}
          business={business}
          role={role}
          orientation={orientation}
          transactions={workspace.transactions}
          onOrientation={changeOrientation}
          onRefresh={refresh}
          onSignOut={handleSignOut}
          onSessionEnded={handleSessionEnded}
          onNavigate={goToTab}
          notify={notify}
        />
      )}
    </AppShell>
  );
}
