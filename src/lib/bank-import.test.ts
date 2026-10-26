import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseAmountMinor, parseBankRows, parseCsv, parseStatementDate, suggestMapping } from "./bank-import";

const STATEMENT = [
  "Transaction Date,Description,Amount,Balance,Category",
  "2026-10-02,Card settlement - Yoco,9650.00,48250.00,Card settlements",
  "2026-10-03,City Deep produce stock,-4285.50,43964.50,Stock & supplies",
  "2026-10-02,Card settlement - Yoco,9650.00,48250.00,Card settlements",
].join("\n");

describe("bank statement import", () => {
  it("reads amounts written the ways South African banks write them", () => {
    expect(parseAmountMinor("R 1 234,56")).toBe(123456n);
    expect(parseAmountMinor("1,234.56")).toBe(123456n);
    expect(parseAmountMinor("-4285.50")).toBe(-428550n);
    expect(parseAmountMinor("(4285.50)")).toBe(-428550n);
    expect(parseAmountMinor("4285.50-")).toBe(-428550n);
    expect(parseAmountMinor("not money")).toBeNull();
  });

  it("reads statement dates without silently rolling them over", () => {
    expect(parseStatementDate("2026-10-02")?.getDate()).toBe(2);
    expect(parseStatementDate("02/10/2026")?.getMonth()).toBe(9);
    expect(parseStatementDate("2 October 2026")?.getFullYear()).toBe(2026);
    expect(parseStatementDate("31/02/2026")).toBeNull();
  });

  it("detects columns and fingerprints rows on the statement's own calendar date", () => {
    const table = parseCsv(STATEMENT);
    const mapping = suggestMapping(table.headers);
    expect(mapping).toMatchObject({ date: "Transaction Date", description: "Description", amount: "Amount" });

    const [first] = parseBankRows(table, mapping);
    const expected = createHash("sha256").update("2026-10-02|Card settlement - Yoco|965000|INCOME").digest("hex");
    expect(first.type).toBe("INCOME");
    expect(first.amountMinor).toBe("965000");
    expect(first.externalId).toBe(expected);
  });

  it("flags a repeated row in the same file instead of importing it twice", () => {
    const table = parseCsv(STATEMENT);
    const rows = parseBankRows(table, suggestMapping(table.headers));
    expect(rows).toHaveLength(3);
    expect(rows[2].error).toBe("Duplicate row in this file.");
  });

  it("turns debit and credit columns into expenses and income", () => {
    const table = parseCsv(
      ["Date,Details,Debit,Credit", "2026-10-04,Fuel,780.00,", "2026-10-05,Deposit,,5000.00"].join("\n"),
    );
    const rows = parseBankRows(table, suggestMapping(table.headers));
    expect(rows.map((row) => [row.type, row.amountMinor])).toEqual([
      ["EXPENSE", "78000"],
      ["INCOME", "500000"],
    ]);
  });
});
