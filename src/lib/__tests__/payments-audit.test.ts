import { describe, it, expect } from "vitest";
import {
  calculateStudentBilling,
  getSessionBlockProgress,
  computePaymentStatus,
  DEFAULT_PACK_DISCOUNTS,
  SIBLING_DISCOUNT_PERCENT,
} from "../pricing";
import {
  calculateDailyCashSummary,
  getExpensesForDate,
  addLocalExpense,
  getLocalExpenses,
} from "../cash-register";

describe("Pricing: calculateStudentBilling", () => {
  it("calculates 1 module at full price", () => {
    const res = calculateStudentBilling([
      { id: "mod-math", name: "Mathématiques", monthlyPrice: 3000 },
    ]);
    expect(res.baseAmount).toBe(3000);
    expect(res.packDiscountPercent).toBe(0);
    expect(res.discountAmount).toBe(0);
    expect(res.netDue).toBe(3000);
    expect(res.itemCount).toBe(1);
    expect(res.ruleLabel).toContain("Plein tarif");
  });

  it("applies Pack Duo (-10%) for 2 modules", () => {
    const res = calculateStudentBilling([
      { id: "mod-math", name: "Maths", monthlyPrice: 3000 },
      { id: "mod-phys", name: "Physique", monthlyPrice: 3000 },
    ]);
    expect(res.baseAmount).toBe(6000);
    expect(res.packDiscountPercent).toBe(10);
    expect(res.packDiscountAmount).toBe(600);
    expect(res.netDue).toBe(5400);
    expect(res.itemCount).toBe(2);
    expect(res.ruleLabel).toContain("Pack Duo");
  });

  it("applies Pack Trio / Scientifique (-20%) for 3 modules", () => {
    const res = calculateStudentBilling([
      { id: "mod-math", name: "Maths", monthlyPrice: 3000 },
      { id: "mod-phys", name: "Physique", monthlyPrice: 3000 },
      { id: "mod-sci", name: "Sciences", monthlyPrice: 3000 },
    ]);
    expect(res.baseAmount).toBe(9000);
    expect(res.packDiscountPercent).toBe(20);
    expect(res.packDiscountAmount).toBe(1800);
    expect(res.netDue).toBe(7200);
    expect(res.itemCount).toBe(3);
    expect(res.ruleLabel).toContain("Pack Trio");
  });

  it("applies Multi-cours (-25%) for 4 or more modules", () => {
    const res = calculateStudentBilling([
      { id: "mod-1", name: "M1", monthlyPrice: 2500 },
      { id: "mod-2", name: "M2", monthlyPrice: 2500 },
      { id: "mod-3", name: "M3", monthlyPrice: 2500 },
      { id: "mod-4", name: "M4", monthlyPrice: 2500 },
    ]);
    expect(res.baseAmount).toBe(10000);
    expect(res.packDiscountPercent).toBe(25);
    expect(res.packDiscountAmount).toBe(2500);
    expect(res.netDue).toBe(7500);
    expect(res.itemCount).toBe(4);
  });

  it("applies Sibling discount (-10%) stacked after pack discount", () => {
    const res = calculateStudentBilling({
      enrolledModules: [
        { id: "mod-1", name: "Maths", monthlyPrice: 3000 },
        { id: "mod-2", name: "Physique", monthlyPrice: 3000 },
      ],
      isSibling: true,
    });
    // Base: 6000
    // Pack 10%: -600 => 5400
    // Sibling 10%: -540 => 4860
    expect(res.baseAmount).toBe(6000);
    expect(res.packDiscountAmount).toBe(600);
    expect(res.siblingDiscountAmount).toBe(540);
    expect(res.netDue).toBe(4860);
  });

  it("applies custom discount correctly", () => {
    const res = calculateStudentBilling({
      enrolledModules: [{ id: "mod-1", name: "Maths", monthlyPrice: 3000 }],
      customDiscount: 500,
    });
    expect(res.baseAmount).toBe(3000);
    expect(res.customDiscountAmount).toBe(500);
    expect(res.netDue).toBe(2500);
  });

  it("caps custom discount at total amount (never negative)", () => {
    const res = calculateStudentBilling({
      enrolledModules: [{ id: "mod-1", name: "Maths", monthlyPrice: 3000 }],
      customDiscount: 99999,
    });
    expect(res.customDiscountAmount).toBe(3000);
    expect(res.netDue).toBe(0);
  });

  it("calculates prorata for mid-cycle entries (1/4, 2/4, 3/4)", () => {
    const p1 = calculateStudentBilling({
      enrolledModules: [{ id: "mod-1", name: "Maths", monthlyPrice: 4000 }],
      sessionsCount: 1,
    });
    expect(p1.baseAmount).toBe(1000);
    expect(p1.netDue).toBe(1000);
    expect(p1.ruleLabel).toContain("Prorata 1/4");

    const p2 = calculateStudentBilling({
      enrolledModules: [{ id: "mod-1", name: "Maths", monthlyPrice: 4000 }],
      sessionsCount: 2,
    });
    expect(p2.baseAmount).toBe(2000);
    expect(p2.netDue).toBe(2000);

    const p3 = calculateStudentBilling({
      enrolledModules: [{ id: "mod-1", name: "Maths", monthlyPrice: 4000 }],
      sessionsCount: 3,
    });
    expect(p3.baseAmount).toBe(3000);
    expect(p3.netDue).toBe(3000);
  });

  it("handles sessionsCount = 0 cleanly (bills 0 DA, not full 4 sessions)", () => {
    const res = calculateStudentBilling({
      enrolledModules: [{ id: "mod-1", name: "Maths", monthlyPrice: 4000 }],
      sessionsCount: 0,
    });
    expect(res.baseAmount).toBe(0);
    expect(res.netDue).toBe(0);
    expect(res.ruleLabel).toContain("0 séance facturée");
  });

  it("handles negative sessionsCount cleanly (clamped to 0)", () => {
    const res = calculateStudentBilling({
      enrolledModules: [{ id: "mod-1", name: "Maths", monthlyPrice: 4000 }],
      sessionsCount: -2,
    });
    expect(res.baseAmount).toBe(0);
    expect(res.netDue).toBe(0);
  });

  it("handles empty module list cleanly", () => {
    const res = calculateStudentBilling([]);
    expect(res.baseAmount).toBe(0);
    expect(res.netDue).toBe(0);
    expect(res.itemCount).toBe(0);
  });

  it("supports per_session billingType", () => {
    const res = calculateStudentBilling({
      enrolledModules: [{ id: "mod-1", name: "Maths", sessionPrice: 900 }],
      billingType: "per_session",
      sessionsCount: 3,
    });
    expect(res.baseAmount).toBe(2700); // 900 * 3
    expect(res.netDue).toBe(2700);
  });

  it("handles NaN or negative customDiscount safely", () => {
    const res = calculateStudentBilling({
      enrolledModules: [{ id: "mod-1", name: "Maths", monthlyPrice: 3000 }],
      customDiscount: -500,
    });
    expect(res.customDiscountAmount).toBe(0);
    expect(res.netDue).toBe(3000);
  });
});

describe("Cycle Tracking: getSessionBlockProgress", () => {
  it("returns session 0 and no renewal for 0 sessions", () => {
    const p = getSessionBlockProgress(0);
    expect(p.currentSessionInBlock).toBe(0);
    expect(p.completedBlocks).toBe(0);
    expect(p.isRenewalNeeded).toBe(false);
    expect(p.label).toContain("Bloc #1");
  });

  it("tracks session 1 in block 1", () => {
    const p = getSessionBlockProgress(1);
    expect(p.currentSessionInBlock).toBe(1);
    expect(p.completedBlocks).toBe(0);
    expect(p.isRenewalNeeded).toBe(false);
    expect(p.label).toBe("Séance 1 sur 4 (Bloc #1)");
  });

  it("tracks session 3 in block 1", () => {
    const p = getSessionBlockProgress(3);
    expect(p.currentSessionInBlock).toBe(3);
    expect(p.completedBlocks).toBe(0);
    expect(p.isRenewalNeeded).toBe(false);
    expect(p.label).toBe("Séance 3 sur 4 (Bloc #1)");
  });

  it("triggers renewal needed when block 1 is completed at 4 sessions", () => {
    const p = getSessionBlockProgress(4);
    expect(p.currentSessionInBlock).toBe(4);
    expect(p.completedBlocks).toBe(1);
    expect(p.isRenewalNeeded).toBe(true);
    expect(p.label).toContain("Bloc #1");
    expect(p.label).toContain("Renouvellement requis");
  });

  it("tracks session 1 of block 2 on 5th session", () => {
    const p = getSessionBlockProgress(5);
    expect(p.currentSessionInBlock).toBe(1);
    expect(p.completedBlocks).toBe(1);
    expect(p.isRenewalNeeded).toBe(false);
    expect(p.label).toBe("Séance 1 sur 4 (Bloc #2)");
  });

  it("handles negative count safely without crashing", () => {
    const p = getSessionBlockProgress(-5);
    expect(p.currentSessionInBlock).toBe(0);
    expect(p.completedBlocks).toBe(0);
    expect(p.isRenewalNeeded).toBe(false);
  });
});

describe("Payment Status Calculation: computePaymentStatus", () => {
  it("returns 'paid' when amount due is 0", () => {
    expect(computePaymentStatus(0, 0, "2026-01-01")).toBe("paid");
  });

  it("returns 'paid' when fully paid", () => {
    expect(computePaymentStatus(3000, 3000, "2026-01-01")).toBe("paid");
    expect(computePaymentStatus(3000, 3500, "2026-01-01")).toBe("paid");
  });

  it("returns 'partial' when partially paid before due date", () => {
    expect(computePaymentStatus(3000, 1500, "2099-12-31")).toBe("partial");
  });

  it("returns 'late' when partially paid after due date", () => {
    expect(computePaymentStatus(3000, 1500, "2020-01-01")).toBe("late");
  });

  it("returns 'unpaid' when unpaid before due date", () => {
    expect(computePaymentStatus(3000, 0, "2099-12-31")).toBe("unpaid");
  });

  it("returns 'late' when unpaid after due date", () => {
    expect(computePaymentStatus(3000, 0, "2020-01-01")).toBe("late");
  });

  it("handles NaN and negative values gracefully", () => {
    expect(computePaymentStatus(NaN, 0, "2099-01-01")).toBe("paid"); // due defaults to 0
    expect(computePaymentStatus(3000, -50, "2099-01-01")).toBe("unpaid");
  });
});

describe("Cash Register: calculateDailyCashSummary", () => {
  it("accurately computes cash in, out, and net balance", () => {
    const receipts = [{ amount_paid: 3000 }, { amount_paid: 5400 }, { amount_paid: 2000 }];
    const expenses = [{ amount: 500 }, { amount: 1200 }];

    const summary = calculateDailyCashSummary(receipts, expenses);
    expect(summary.totalIn).toBe(10400);
    expect(summary.totalOut).toBe(1700);
    expect(summary.netBalance).toBe(8700);
  });

  it("handles empty arrays", () => {
    const summary = calculateDailyCashSummary([], []);
    expect(summary.totalIn).toBe(0);
    expect(summary.totalOut).toBe(0);
    expect(summary.netBalance).toBe(0);
  });

  it("handles undefined, null, and NaN entries safely", () => {
    const receipts = [{ amount_paid: 3000 }, { amount_paid: undefined }, { amount_paid: null }];
    const expenses = [{ amount: 400 }, { amount: NaN }];

    const summary = calculateDailyCashSummary(receipts as any, expenses as any);
    expect(summary.totalIn).toBe(3000);
    expect(summary.totalOut).toBe(400);
    expect(summary.netBalance).toBe(2600);
  });
});
