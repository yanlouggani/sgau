import { describe, it, expect } from "vitest";
import { calculateStudentBilling } from "../pricing";
import { generateQRToken, verifyQRToken, isQRTokenFormat } from "../qr-token";
import { todayLocal, currentMonthLocal } from "../dates";

describe("Dates & Timezone Algiers", () => {
  it("generates date in YYYY-MM-DD format", () => {
    const today = todayLocal();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("generates month in YYYY-MM format", () => {
    const month = currentMonthLocal();
    expect(month).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("QR Token Security", () => {
  it("generates and verifies a valid token", () => {
    const studentId = "student-12345";
    const token = generateQRToken(studentId);

    expect(isQRTokenFormat(token)).toBe(true);

    const verified = verifyQRToken(token);
    expect(verified.valid).toBe(true);
    expect(verified.studentId).toBe(studentId);
  });

  it("rejects an invalid signature or tampered token", () => {
    const token = generateQRToken("student-abc");
    const parts = token.split(":");
    // Tamper with payload
    const tamperedToken = `SGAU:hacker:${parts[2]}:${parts[3]}`;

    const verified = verifyQRToken(tamperedToken);
    expect(verified.valid).toBe(false);
  });
});

describe("Student Pricing & Discounts", () => {
  it("calculates 1 module at full price", () => {
    const breakdown = calculateStudentBilling([
      { id: "mod-1", name: "Mathématiques", monthlyPrice: 3000 },
    ]);
    expect(breakdown.baseAmount).toBe(3000);
    expect(breakdown.netDue).toBe(3000);
    expect(breakdown.discountPercentage).toBe(0);
  });

  it("applies Pack Duo (-10%) for 2 modules", () => {
    const breakdown = calculateStudentBilling([
      { id: "mod-1", name: "Maths", monthlyPrice: 3000 },
      { id: "mod-2", name: "Physique", monthlyPrice: 3000 },
    ]);
    expect(breakdown.baseAmount).toBe(6000);
    expect(breakdown.discountPercentage).toBe(10);
    expect(breakdown.netDue).toBe(5400); // 6000 - 600
  });

  it("applies Sibling discount (-10%)", () => {
    const breakdown = calculateStudentBilling({
      enrolledModules: [{ id: "mod-1", name: "Maths", monthlyPrice: 3000 }],
      isSibling: true,
    });
    expect(breakdown.baseAmount).toBe(3000);
    expect(breakdown.netDue).toBe(2700); // 3000 - 300
  });

  it("applies Prorata when joining mid-cycle (2 sessions out of 4)", () => {
    const breakdown = calculateStudentBilling({
      enrolledModules: [{ id: "mod-1", name: "Maths", monthlyPrice: 4000 }],
      sessionsCount: 2,
    });
    expect(breakdown.baseAmount).toBe(2000); // 4000 * 2/4
    expect(breakdown.netDue).toBe(2000);
  });
});
