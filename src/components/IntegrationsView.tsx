"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Icon, type IconName } from "./icons";
import { Badge, Dialog, EmptyState, Skeleton } from "./ui";
import { api, ApiError } from "@/lib/api";
import { downloadCsv } from "@/lib/csv-export";
import { formatDate, formatMinor, relativeTime } from "@/lib/format";
import { SECRET_MASK_CLIENT } from "@/lib/constants";
import type {
  BankMapping,
  BankPreview,
  ImportBatch,
  Integration,
  IntegrationField,
} from "@/lib/types";

const CATEGORY_ICON: Record<Integration["category"], IconName> = {
  Money: "bank",
  Payments: "card",
  Automation: "zap",
  Accounting: "reports",
};

const CATEGORY_TONE: Record<Integration["category"], "info" | "success" | "warning" | "neutral"> = {
  Money: "success",
  Payments: "info",
  Automation: "warning",
  Accounting: "neutral",
};

const MAPPING_FIELDS: { key: keyof BankMapping; label: string; required: boolean; hint: string }[] = [
  { key: "date", label: "Date", required: true, hint: "Transaction date" },
  { key: "description", label: "Description", required: true, hint: "Details or narrative" },
  { key: "amount", label: "Amount", required: false, hint: "Single signed amount" },
  { key: "debit", label: "Debit / money out", required: false, hint: "Optional separate column" },
  { key: "credit", label: "Credit / money in", required: false, hint: "Optional separate column" },
  { key: "type", label: "Type", required: false, hint: "Optional debit/credit column" },
  { key: "category", label: "Category", required: false, hint: "Optional category column" },
];

export function IntegrationsView({
  isOwner,
  onWorkspaceRefresh,
  notify,
}: {
  isOwner: boolean;
  onWorkspaceRefresh: () => Promise<void>;
  notify: (tone: "success" | "error" | "info", message: string) => void;
}) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [imports, setImports] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<Integration | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.integrations.list();
      setIntegrations(result.integrations);
      setImports(result.imports);
      setLoadError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load integrations.";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.integrations
      .list()
      .then((result) => {
        if (!active) return;
        setIntegrations(result.integrations);
        setImports(result.imports);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Could not load integrations.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function openConfigure(integration: Integration) {
    setEditing(integration);
    const values: Record<string, string> = {};
    for (const field of integration.fields) {
      values[field.key] = integration.configured[field.key] ?? "";
    }
    setConfig(values);
  }

  async function saveIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await api.integrations.save(editing.id, config);
      setEditing(null);
      await load();
      notify("success", `${editing.name} saved securely. Test it when you are ready.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not save this integration.");
    } finally {
      setSaving(false);
    }
  }

  async function testIntegration(integration: Integration) {
    setTesting(integration.id);
    try {
      const result = await api.integrations.test(integration.id);
      await load();
      notify(result.ok ? "success" : "error", result.message);
    } catch (error) {
      await load();
      notify("error", error instanceof Error ? error.message : "The test could not be completed.");
    } finally {
      setTesting(null);
    }
  }

  async function disconnect(integration: Integration) {
    setDisconnecting(integration.id);
    try {
      await api.integrations.disconnect(integration.id);
      await load();
      notify("info", `${integration.name} disconnected and stored credentials removed.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not disconnect this integration.");
    } finally {
      setDisconnecting(null);
    }
  }

  const webhook = integrations.find((integration) => integration.id === "webhook");

  return (
    <div className="view-stack integrations-view">
      <section className="integration-intro">
        <div>
          <span className="eyebrow">Admin · owner only</span>
          <h2>Connect once. Keep your records in sync.</h2>
          <p>
            Bring your bank statements in, send signed updates to the tools you already use, and keep payment
            details in one protected place.
          </p>
        </div>
        <div className="security-panel">
          <Icon name="shield" size={22} />
          <div>
            <strong>Credentials are encrypted</strong>
            <span>AES-256-GCM at rest · never returned to the browser · every change is audited.</span>
          </div>
        </div>
      </section>

      {!isOwner && (
        <p className="alert info">Only the workspace owner can connect or change integrations. You can still view what is available.</p>
      )}

      {loadError && <p className="alert error" role="alert">{loadError}</p>}

      {loading ? (
        <section className="integration-grid">
          {[0, 1, 2].map((index) => (
            <article className="integration-card" key={index}>
              <Skeleton height="2.4rem" width="2.4rem" />
              <Skeleton height="1.1rem" width="55%" />
              <Skeleton height="3rem" />
              <Skeleton height="2.5rem" width="45%" />
            </article>
          ))}
        </section>
      ) : (
        <section className="integration-grid" aria-label="Available integrations">
          {integrations.map((integration) => (
            <article className={`integration-card ${integration.connected ? "connected" : ""}`} key={integration.id}>
              <div className="integration-card-top">
                <span className={`integration-icon cat-${integration.category.toLowerCase()}`}>
                  <Icon name={CATEGORY_ICON[integration.category]} size={22} />
                </span>
                <div className="integration-title">
                  <strong>{integration.name}</strong>
                  <Badge tone={CATEGORY_TONE[integration.category]}>{integration.category}</Badge>
                </div>
                <span className={`status-dot ${integration.builtIn ? "available" : integration.connected ? "on" : "off"}`} title={integration.builtIn ? "Always available" : integration.connected ? "Connected" : "Not connected"} />
              </div>

              <p>{integration.description}</p>
              {integration.note && <small className="integration-note">{integration.note}</small>}

              <div className="integration-meta">
                <span>
                  {integration.builtIn
                    ? "Built in · ready"
                    : integration.connected
                      ? `Connected · ${integration.status === "ERROR" ? "needs attention" : "healthy"}`
                      : "Not connected"}
                </span>
                {integration.lastSyncedAt && <span>Last sync {relativeTime(integration.lastSyncedAt)}</span>}
                {!integration.lastSyncedAt && integration.lastTestedAt && <span>Tested {relativeTime(integration.lastTestedAt)}</span>}
              </div>

              {integration.id === "webhook" && integration.events && (
                <div className="event-chips">
                  {integration.events.slice(0, 4).map((event) => <code key={event}>{event}</code>)}
                </div>
              )}

              <div className="integration-actions">
                {integration.builtIn ? (
                  <button className="button primary" type="button" onClick={() => setCsvOpen(true)}>
                    <Icon name="upload" size={16} /> Import statement
                  </button>
                ) : integration.connected ? (
                  <>
                    <button className="button primary" type="button" onClick={() => openConfigure(integration)} disabled={!isOwner}>
                      Manage
                    </button>
                    <button className="button secondary" type="button" onClick={() => testIntegration(integration)} disabled={!isOwner || testing === integration.id}>
                      {testing === integration.id ? <span className="spinner" aria-hidden="true" /> : <Icon name="zap" size={16} />}
                      Test
                    </button>
                    <button className="text-button danger-text" type="button" onClick={() => disconnect(integration)} disabled={!isOwner || disconnecting === integration.id}>
                      {disconnecting === integration.id ? "Disconnecting…" : "Disconnect"}
                    </button>
                  </>
                ) : (
                  <button className="button primary" type="button" onClick={() => openConfigure(integration)} disabled={!isOwner}>
                    <Icon name="link" size={16} /> Connect
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <div><h2>Recent bank imports</h2><p>Every import is checked for duplicates.</p></div>
            <button className="button secondary small" type="button" onClick={() => setCsvOpen(true)}>
              <Icon name="upload" size={15} /> New import
            </button>
          </div>
          {imports.length === 0 ? (
            <EmptyState
              icon="bank"
              title="No statements imported yet"
              text="Download a CSV statement from your bank and import it here. POCKET CFO reads the columns for you."
              action={<button className="button primary" type="button" onClick={() => setCsvOpen(true)}>Import a statement</button>}
            />
          ) : (
            <div className="import-list">
              {imports.map((batch) => (
                <div className="import-row" key={batch.id}>
                  <span className="import-icon"><Icon name="file" size={17} /></span>
                  <div><strong>{batch.fileName}</strong><small>{formatDate(batch.createdAt)} · {batch.rowsRead} rows read</small></div>
                  <div className="import-counts">
                    <Badge tone="success">{batch.rowsImported} imported</Badge>
                    {batch.rowsSkipped > 0 && <Badge tone="warning">{batch.rowsSkipped} skipped</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h2>How bank import works</h2><p>Works with any CSV statement.</p></div></div>
          <ol className="steps-list">
            <li><span>1</span><div><strong>Download a CSV</strong><small>Use internet banking → statements → export as CSV.</small></div></li>
            <li><span>2</span><div><strong>Quick check</strong><small>POCKET CFO detects the date, description and amount columns. Adjust if needed.</small></div></li>
            <li><span>3</span><div><strong>Import safely</strong><small>Rows are fingerprinted, so re-importing the same statement will not double-count money.</small></div></li>
          </ol>
          <button
            className="text-button"
            type="button"
            onClick={() =>
              downloadCsv("pocketcfo-bank-import-template.csv", [
                ["Date", "Description", "Amount", "Category"],
                ["2026-10-01", "Example: customer payment", "1250.00", "Sales"],
                ["2026-10-02", "Example: supplier payment", "-480.50", "Stock"],
              ])
            }
          >
            <Icon name="download" size={15} /> Download a sample CSV
          </button>
        </article>
      </section>

      {webhook && (
        <section className="panel">
          <div className="panel-heading"><div><h2>Webhook delivery</h2><p>Signed notifications for your automation tools.</p></div><Badge tone={webhook.connected ? "success" : "neutral"}>{webhook.connected ? "Active" : "Not connected"}</Badge></div>
          <div className="webhook-detail">
            <div>
              <strong>Signature verification</strong>
              <p>Each request includes <code>X-PocketCFO-Signature: sha256=…</code>. Compute an HMAC-SHA256 of the raw body with your signing secret and compare it before trusting the event.</p>
            </div>
            <div>
              <strong>Event payload</strong>
              <pre>{`{
  "event": "transaction.created",
  "occurredAt": "2026-10-23T12:00:00.000Z",
  "businessId": "…",
  "data": { "id": "…", "amountMinor": "125000" }
}`}</pre>
            </div>
          </div>
        </section>
      )}

      {editing && (
        <Dialog
          title={`${editing.connected ? "Manage" : "Connect"} ${editing.name}`}
          description={editing.note}
          onClose={() => setEditing(null)}
          size="md"
        >
          <form className="form" onSubmit={saveIntegration}>
            {editing.fields.map((field) => (
              <ConfigField
                key={field.key}
                field={field}
                value={config[field.key] ?? ""}
                onChange={(value) => setConfig({ ...config, [field.key]: value })}
              />
            ))}
            <p className="inline-note">
              <Icon name="shield" size={15} /> Secrets are encrypted before they are stored. Saved secret values are shown masked.
            </p>
            <div className="button-row end">
              <button className="button secondary" type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button className="button primary" disabled={saving}>{saving ? "Saving securely…" : "Save connection"}</button>
            </div>
          </form>
        </Dialog>
      )}

      {csvOpen && (
        <BankImportDialog
          onClose={() => setCsvOpen(false)}
          onImported={async (result) => {
            setCsvOpen(false);
            await Promise.all([load(), onWorkspaceRefresh()]);
            notify("success", `Imported ${result.imported} transaction${result.imported === 1 ? "" : "s"}${result.skipped > 0 ? `, skipped ${result.skipped}` : ""}.`);
          }}
        />
      )}
    </div>
  );
}

function ConfigField({
  field,
  value,
  onChange,
}: {
  field: IntegrationField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "select") {
    return (
      <label>
        {field.label}{field.required && <span className="required-mark"> *</span>}
        <select value={value} onChange={(event) => onChange(event.target.value)} required={field.required}>
          <option value="" disabled>Choose an option</option>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {field.help && <small className="field-hint">{field.help}</small>}
      </label>
    );
  }
  return (
    <label>
      {field.label}{field.required && <span className="required-mark"> *</span>}
      <input
        type={field.type === "password" ? "password" : field.type === "url" ? "url" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        required={field.required && value !== SECRET_MASK_CLIENT}
        autoComplete="off"
        spellCheck={false}
      />
      {field.help && <small className="field-hint">{field.help}</small>}
      {field.secret && value === SECRET_MASK_CLIENT && (
        <small className="field-hint">A secret is saved. Leave it masked to keep it unchanged.</small>
      )}
    </label>
  );
}

function BankImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (result: { imported: number; skipped: number }) => Promise<void>;
}) {
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<BankPreview | null>(null);
  const [mapping, setMapping] = useState<BankMapping | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const canImport = Boolean(preview && preview.totals.valid > 0 && mapping && !importing);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    if (file.size > 2_000_000) {
      setError("That file is larger than 2 MB. Split it into smaller statements.");
      return;
    }
    setReading(true);
    setPreview(null);
    try {
      const text = await file.text();
      setFileName(file.name);
      setCsv(text);
      const result = await api.integrations.previewCsv({ csv: text });
      setPreview(result);
      setMapping(result.mapping);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That file could not be read.");
    } finally {
      setReading(false);
    }
  }

  async function refreshPreview(nextMapping: BankMapping) {
    setMapping(nextMapping);
    setError("");
    try {
      const result = await api.integrations.previewCsv({ csv, mapping: nextMapping });
      setPreview(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh the preview.");
    }
  }

  async function importRows() {
    if (!mapping) return;
    setImporting(true);
    setError("");
    try {
      const result = await api.integrations.importCsv({ csv, fileName: fileName || "bank-statement.csv", mapping });
      await onImported({ imported: result.imported, skipped: result.skipped });
    } catch (caught) {
      if (caught instanceof ApiError) setError(caught.message);
      else setError(caught instanceof Error ? caught.message : "The import failed.");
    } finally {
      setImporting(false);
    }
  }

  const headerOptions = useMemo(() => preview?.headers ?? [], [preview]);

  return (
    <Dialog
      title="Import a bank statement"
      description="Upload a CSV from your bank. Nothing is saved until you confirm the preview."
      onClose={onClose}
      size="lg"
      footer={
        preview ? (
          <div className="button-row end">
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button primary" type="button" onClick={importRows} disabled={!canImport}>
              {importing ? "Importing…" : `Import ${preview.totals.valid} transaction${preview.totals.valid === 1 ? "" : "s"}`}
            </button>
          </div>
        ) : undefined
      }
    >
      {!preview ? (
        <div className="upload-area">
          <span className="upload-icon"><Icon name="upload" size={26} /></span>
          <strong>Choose your bank CSV</strong>
          <p>Most South African banks export CSV from internet banking under Statements or Transaction history.</p>
          <label className="button primary file-button">
            {reading ? <span className="spinner spinner-light" aria-hidden="true" /> : <Icon name="file" size={16} />}
            {reading ? "Reading and checking…" : "Choose CSV file"}
            <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={reading} />
          </label>
          <small>Maximum 2 MB · up to 2,000 rows per file</small>
          {error && <p className="alert error" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="csv-preview">
          <div className="csv-file-row">
            <span><Icon name="file" size={16} />{fileName || "statement.csv"}</span>
            <button className="text-button" type="button" onClick={() => { setPreview(null); setCsv(""); setFileName(""); }}>Choose another file</button>
          </div>

          <div className="mapping-grid">
            {MAPPING_FIELDS.map((field) => (
              <label key={field.key}>
                {field.label}{field.required && <span className="required-mark"> *</span>}
                <select
                  value={mapping?.[field.key] ?? ""}
                  onChange={(event) => {
                    if (!mapping) return;
                    const next = { ...mapping, [field.key]: event.target.value };
                    void refreshPreview(next);
                  }}
                >
                  <option value="">{field.required ? "Choose column" : "Not used"}</option>
                  {headerOptions.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
                <small className="field-hint">{field.hint}</small>
              </label>
            ))}
          </div>

          <div className="preview-totals">
            <Badge tone="success">{preview.totals.valid} ready</Badge>
            {preview.totals.duplicates > 0 && <Badge tone="warning">{preview.totals.duplicates} already imported</Badge>}
            {preview.totals.invalid > 0 && <Badge tone="danger">{preview.totals.invalid} need attention</Badge>}
            <span>{preview.totals.rows} rows in file</span>
          </div>

          {error && <p className="alert error" role="alert">{error}</p>}

          <div className="table-scroll">
            <table className="data-table preview-table">
              <thead><tr><th>Row</th><th>Date</th><th>Description</th><th>Type</th><th className="align-right">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {preview.preview.map((row) => (
                  <tr key={row.rowNumber} className={row.error ? "row-invalid" : ""}>
                    <td>{row.rowNumber}</td>
                    <td>{row.date ? formatDate(row.date) : "—"}</td>
                    <td>{row.description}</td>
                    <td>{row.type ? row.type.replace("_", " ").toLowerCase() : "—"}</td>
                    <td className="align-right">{row.amountMinor ? formatMinor(row.amountMinor) : "—"}</td>
                    <td>{row.error ? <span className="row-error">{row.error}</span> : <Badge tone="success">Ready</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.totals.rows > preview.preview.length && (
            <p className="panel-footnote">Showing the first {preview.preview.length} rows. All {preview.totals.rows} rows are checked when you import.</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
