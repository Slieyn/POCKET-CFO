export function parseMoneyToMinorUnits(input: string): bigint {
  if (!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(input)) {
    throw new Error("Enter a non-negative amount with up to two decimal places.");
  }

  const [whole, fraction = ""] = input.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function formatMinorUnits(amountMinor: bigint): string {
  const amount = Number(amountMinor) / 100;
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
  }).format(amount);
}

export function calculateBankabilityGuide(input: {
  incomeEntries: number;
  revenueMonths: number;
  cashMinor: bigint;
  budgetConfigured: boolean;
}): { score: number; label: string; nextStep: string } {
  const score = Math.min(
    Math.min(input.incomeEntries * 4, 24) +
      Math.min(input.revenueMonths * 8, 24) +
      (input.cashMinor > 0n ? 27 : 0) +
      (input.budgetConfigured ? 25 : 0),
    100,
  );

  if (input.cashMinor <= 0n) {
    return { score, label: "Cash position needs attention", nextStep: "Review expenses and upcoming commitments before taking an owner draw." };
  }
  if (input.revenueMonths < 3) {
    return { score, label: "Building a consistent record", nextStep: "Record business income regularly to build a clearer cash-flow history." };
  }
  if (!input.budgetConfigured) {
    return { score, label: "Budget plan needed", nextStep: "Set an operations, emergency reserve, and owner-draw budget." };
  }
  return { score, label: score >= 75 ? "Strong record-keeping habits" : "Keep building your business records", nextStep: "Keep financial records current and review your plan regularly." };
}
