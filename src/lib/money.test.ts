import { describe, expect, it } from "vitest";
import { calculateBankabilityGuide, formatMinorUnits, parseMoneyToMinorUnits } from "./money";

describe("money helpers", () => {
  it("uses integer minor units and formats ZAR", () => {
    expect(parseMoneyToMinorUnits("1200.45")).toBe(120045n);
    expect(formatMinorUnits(120045n)).toContain("1 200,45");
  });

  it("rejects invalid precision and negative values", () => {
    expect(() => parseMoneyToMinorUnits("2.999")).toThrow();
    expect(() => parseMoneyToMinorUnits("-2")).toThrow();
  });

  it("keeps the readiness guide advisory, not a credit approval", () => {
    const guide = calculateBankabilityGuide({
      incomeEntries: 30,
      revenueMonths: 3,
      cashMinor: 10_000n,
      budgetConfigured: true,
    });

    expect(guide.score).toBe(100);
    expect(guide.label).toBe("Strong record-keeping habits");
    expect(guide.label.toLowerCase()).not.toContain("approved");
  });
});
