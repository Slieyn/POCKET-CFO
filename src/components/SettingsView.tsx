"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "./icons";
import { Avatar, Badge, ConfirmDialog, Dialog } from "./ui";
import { api } from "@/lib/api";
import { exportTransactionsCsv } from "@/lib/csv-export";
import type { NavigationOrientation, SessionUser, Tab, TeamMember, Transaction } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export function SettingsView({
  user,
  business,
  role,
  orientation,
  transactions,
  onOrientation,
  onRefresh,
  onSignOut,
  onSessionEnded,
  onNavigate,
  notify,
}: {
  user: SessionUser;
  business: { id: string; name: string };
  role: string;
  orientation: NavigationOrientation;
  transactions: Transaction[];
  onOrientation: (orientation: NavigationOrientation) => void;
  onRefresh: () => Promise<void>;
  onSignOut: () => void;
  onSessionEnded: () => void;
  onNavigate: (tab: Tab) => void;
  notify: (tone: "success" | "error" | "info", message: string) => void;
}) {
  const [businessName, setBusinessName] = useState(business.name);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(role === "OWNER");
  const [teamError, setTeamError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    if (role !== "OWNER") return;
    let active = true;
    api.team
      .list()
      .then((result) => {
        if (!active) return;
        setTeam(result.members);
        setTeamError("");
      })
      .catch((error: unknown) => {
        if (active) {
          setTeamError(error instanceof Error ? error.message : "Could not load team access.");
        }
      })
      .finally(() => {
        if (active) setTeamLoading(false);
      });
    return () => {
      active = false;
    };
  }, [role]);

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAddBusy(true);
    try {
      const result = await api.team.add({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
        role: String(data.get("role") ?? "MEMBER") === "ADMIN" ? "ADMIN" : "MEMBER",
      });
      setTeam((current) => [...current, result.member]);
      setAddOpen(false);
      notify("success", `${result.member.name} can now sign in with their own password.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not add this person.");
    } finally {
      setAddBusy(false);
    }
  }

  async function removeMember() {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await api.team.remove(removeTarget.id);
      setTeam((current) => current.filter((member) => member.id !== removeTarget.id));
      notify("success", `${removeTarget.name} no longer has access.`);
      setRemoveTarget(null);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not remove this person.");
    } finally {
      setRemoveBusy(false);
    }
  }

  async function saveBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingBusiness(true);
    try {
      await api.business.update(businessName.trim());
      await onRefresh();
      notify("success", "Business name updated.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not update the business name.");
    } finally {
      setSavingBusiness(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      notify("error", "The new passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      const result = await api.changePassword({ currentPassword, newPassword });
      form.reset();
      notify("success", result.message);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not change your password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setDeleteBusy(true);
    try {
      await api.deleteAccount({
        password: String(data.get("password") ?? ""),
        confirmation: String(data.get("confirmation") ?? ""),
      });
      setDeleteOpen(false);
      onSessionEnded();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not delete the account.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="view-stack settings-view">
      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading"><div><h2>Business profile</h2><p>How your business appears on documents.</p></div></div>
          <form className="form" onSubmit={saveBusiness}>
            <label>
              Business name
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <div className="button-row">
              <button className="button primary" disabled={savingBusiness || businessName.trim() === business.name}>
                {savingBusiness ? "Saving…" : "Save business name"}
              </button>
            </div>
          </form>
          <dl className="detail-list">
            <div><dt>Workspace ID</dt><dd><code>{business.id.slice(0, 12)}…</code></dd></div>
            <div><dt>Your role</dt><dd>{role === "OWNER" ? "Owner" : role}</dd></div>
            <div><dt>Currency</dt><dd>ZAR — South African rand</dd></div>
          </dl>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h2>Account</h2><p>Your sign-in details.</p></div>{user.demo && <Badge tone="info">Demo</Badge>}</div>
          <dl className="detail-list">
            <div><dt>Name</dt><dd>{user.name}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Session</dt><dd>Expires after 8 hours of use</dd></div>
          </dl>
          {user.demo && (
            <p className="inline-note">
              You are exploring a shared-style demo workspace. To keep records you create, sign out and create your own secure account.
            </p>
          )}
          <button className="button secondary" type="button" onClick={onSignOut}>
            <Icon name="logout" size={16} /> Sign out
          </button>
        </article>
      </section>

      <section className="panel team-panel">
        <div className="panel-heading">
          <div>
            <h2>Team access</h2>
            <p>Give trusted people their own sign-in — no shared passwords.</p>
          </div>
          {role === "OWNER" && (
            <button className="button primary" type="button" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={16} /> Add person
            </button>
          )}
        </div>
        {role !== "OWNER" ? (
          <p className="inline-note">Only the workspace owner can add or remove team members.</p>
        ) : teamLoading ? (
          <p className="muted">Loading team access…</p>
        ) : teamError ? (
          <p className="alert error">{teamError}</p>
        ) : (
          <ul className="team-list">
            {team.map((member) => (
              <li key={member.id}>
                <Avatar name={member.name} size="sm" />
                <div className="team-identity">
                  <strong>{member.name}</strong>
                  <small>{member.email}</small>
                </div>
                <Badge tone={member.role === "OWNER" ? "info" : "neutral"}>
                  {ROLE_LABEL[member.role] ?? member.role}
                </Badge>
                {member.role === "OWNER" ? (
                  <span className="team-you">You</span>
                ) : (
                  <button className="text-button danger-text" type="button" onClick={() => setRemoveTarget(member)}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="panel-footnote">
          Admins and members work with the same records. Only the owner can manage integrations, team access and
          workspace deletion. Each person can change their own password in this screen.
        </p>
      </section>

      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading"><div><h2>Change password</h2><p>Changing it signs out every other session.</p></div></div>
          <form className="form" onSubmit={changePassword}>
            <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} /></label>
            <label>New password<input name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /><small className="field-hint">12+ characters, including a letter and a number.</small></label>
            <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
            <div className="button-row">
              <button className="button primary" disabled={passwordBusy}>{passwordBusy ? "Updating…" : "Update password"}</button>
            </div>
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h2>Security</h2><p>How POCKET CFO protects this workspace.</p></div><span className="security-mark"><Icon name="shield" size={18} /></span></div>
          <ul className="security-list">
            <li><Icon name="lock" size={16} /><span><strong>Scrypt password hashing</strong><small>Passwords are salted and never stored or shown in plain text.</small></span></li>
            <li><Icon name="clock" size={16} /><span><strong>Expiring, HTTP-only sessions</strong><small>Session cookies cannot be read by scripts and expire after 8 hours.</small></span></li>
            <li><Icon name="shield" size={16} /><span><strong>Origin checks &amp; rate limits</strong><small>Writes are same-origin only and repeated attempts are throttled.</small></span></li>
            <li><Icon name="integrations" size={16} /><span><strong>Encrypted integration secrets</strong><small>Third-party credentials are sealed with AES-256-GCM at rest.</small></span></li>
            <li><Icon name="clock" size={16} /><span><strong>Audit trail</strong><small>Money and document changes are recorded for your records.</small></span></li>
          </ul>
          <p className="panel-footnote">No system can promise absolute security. Keep your password private and use a trusted device.</p>
        </article>
      </section>

      <section className="triple-grid">
        <article className="panel">
          <div className="panel-heading"><div><h2>Your data</h2><p>Download or take it with you.</p></div></div>
          <div className="stack-actions">
            <a className="button secondary" href="/api/export"><Icon name="download" size={16} /> Download full backup (JSON)</a>
            <button className="button secondary" type="button" onClick={() => exportTransactionsCsv(transactions, business.name)}>
              <Icon name="download" size={16} /> Export transactions (CSV)
            </button>
          </div>
          <p className="panel-footnote">Your records belong to you. Exports never include passwords or integration secrets.</p>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h2>Workspace layout</h2><p>Choose what feels comfortable.</p></div></div>
          <div className="layout-options">
            <button type="button" className={orientation === "vertical" ? "layout-card selected" : "layout-card"} onClick={() => onOrientation("vertical")}>
              <Icon name="panelLeft" size={22} /><strong>Side navigation</strong><small>Best on desktop and tablets.</small>
            </button>
            <button type="button" className={orientation === "horizontal" ? "layout-card selected" : "layout-card"} onClick={() => onOrientation("horizontal")}>
              <Icon name="panelTop" size={22} /><strong>Top navigation</strong><small>Gives your numbers more width.</small>
            </button>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h2>Integrations</h2><p>Bank imports, webhooks and payments.</p></div></div>
          <p className="muted">Connect the tools your business already uses. Only the workspace owner can manage credentials.</p>
          {role === "OWNER" ? (
            <button className="button secondary" type="button" onClick={() => onNavigate("integrations")}>
              <Icon name="integrations" size={16} /> Open integrations
            </button>
          ) : (
            <p className="fine-print">Ask the workspace owner when you need a new bank import, webhook or payment connection.</p>
          )}
        </article>
      </section>

      <section className="panel legal-panel">
        <div className="panel-heading"><div><h2>Privacy &amp; important notes</h2><p>Written in plain language.</p></div></div>
        <div className="legal-grid">
          <div>
            <strong>Your records stay yours</strong>
            <p>POCKET CFO stores the information you enter to run your workspace. We do not sell it, and we only share documents when you choose to email them.</p>
          </div>
          <div>
            <strong>POPIA-aware design</strong>
            <p>You can export or permanently delete your workspace at any time. Password and integration secrets are encrypted, and access is limited to your session.</p>
          </div>
          <div>
            <strong>Not a bank or lender</strong>
            <p>POCKET CFO is record-keeping and planning software. Readiness scores are estimates from your own records and are not credit decisions or financial advice.</p>
          </div>
          <div>
            <strong>Keep supporting documents</strong>
            <p>For tax and funding purposes, keep invoices, receipts and bank statements. POCKET CFO helps organise records but does not replace an accountant.</p>
          </div>
        </div>
      </section>

      <section className="panel danger-panel">
        <div>
          <h2>{role === "OWNER" ? "Delete workspace" : "Delete my account"}</h2>
          <p>
            {role === "OWNER"
              ? "Permanently remove your business, transactions, customers, documents and account. This cannot be undone."
              : "Remove your access and delete your sign-in. The business records you added stay with the workspace."}
          </p>
          {role === "OWNER" && team.length > 1 && (
            <p className="inline-note">Remove the other team members first so the workspace is never left without an owner.</p>
          )}
        </div>
        <button className="button danger" type="button" onClick={() => setDeleteOpen(true)}>
          {role === "OWNER" ? "Delete workspace…" : "Delete my account…"}
        </button>
      </section>

      {deleteOpen && (
        <Dialog
          title={role === "OWNER" ? "Delete this workspace permanently?" : "Delete your account?"}
          description={
            role === "OWNER"
              ? "Everything in this business will be erased. Download a backup first if you may need the records."
              : "Your access will end immediately. The workspace and its records stay in place for the owner."
          }
          onClose={() => setDeleteOpen(false)}
          size="sm"
        >
          <form className="form" onSubmit={deleteAccount}>
            <p className="alert error">
              {role === "OWNER" ? (
                <>This deletes <strong>{business.name}</strong> and your account. There is no recovery.</>
              ) : (
                <>This removes <strong>{user.email}</strong> from <strong>{business.name}</strong>.</>
              )}
            </p>
            <label>
              Type <strong>{business.name}</strong> to confirm
              <input name="confirmation" required autoComplete="off" />
            </label>
            <label>
              Your password
              <input name="password" type="password" required autoComplete="current-password" />
            </label>
            <div className="button-row end">
              <button className="button secondary" type="button" onClick={() => setDeleteOpen(false)}>Cancel</button>
              <button className="button danger" disabled={deleteBusy}>{deleteBusy ? "Deleting…" : "Delete everything"}</button>
            </div>
          </form>
        </Dialog>
      )}
      {addOpen && (
        <Dialog
          title="Add someone to your workspace"
          description="They get their own sign-in. Share the temporary password privately and ask them to change it."
          onClose={() => setAddOpen(false)}
          size="sm"
        >
          <form className="form" onSubmit={addMember}>
            <label>Full name<input name="name" required minLength={2} maxLength={100} autoComplete="off" /></label>
            <label>Email<input name="email" type="email" required maxLength={254} autoComplete="off" /></label>
            <label>
              Temporary password
              <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
              <small className="field-hint">At least 12 characters, including a letter and a number.</small>
            </label>
            <label>
              Role
              <select name="role" defaultValue="MEMBER">
                <option value="MEMBER">Member — record day-to-day work</option>
                <option value="ADMIN">Admin — manage records and documents</option>
              </select>
            </label>
            <div className="button-row end">
              <button className="button secondary" type="button" onClick={() => setAddOpen(false)}>Cancel</button>
              <button className="button primary" disabled={addBusy}>{addBusy ? "Adding…" : "Add person"}</button>
            </div>
          </form>
        </Dialog>
      )}

      {removeTarget && (
        <ConfirmDialog
          title="Remove team access?"
          message={`${removeTarget.name} will no longer be able to sign in to ${business.name}. Their past entries stay in the records.`}
          confirmLabel="Remove access"
          busy={removeBusy}
          onConfirm={removeMember}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
