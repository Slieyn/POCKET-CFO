import { describe, expect, it } from "vitest";
import { registerSchema } from "./validation";

describe("registration input", () => {
  const account = {
    name: "Demo Owner",
    businessName: "Demo Business",
    email: "owner@example.com",
    password: "a-secure-demo-password",
  };

  it("defaults sample data off for API clients that omit the option", () => {
    expect(registerSchema.parse(account).includeSampleData).toBe(false);
  });

  it("accepts an explicit sample data choice", () => {
    expect(registerSchema.parse({ ...account, includeSampleData: true }).includeSampleData).toBe(true);
    expect(registerSchema.parse({ ...account, includeSampleData: false }).includeSampleData).toBe(false);
  });
});
