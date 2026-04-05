/**
 * Full Record Analysis Engine
 * 
 * Analyzes a defendant's entire criminal history across multiple cases
 * to determine which cases are eligible for expungement and which are
 * blocked by the "new conviction during waiting period" rule (CP § 10-110(d)(1)).
 *
 * Also identifies the optimal filing order when one case's eligibility
 * depends on another case being expunged first.
 */

import { lookupStatute, type OffenseInfo } from "./eligibility";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaseRecord {
  caseNumber: string;
  charges: Array<{
    description: string;
    statute: string;
    disposition: string;
    dispositionDate: string;
  }>;
  defendant?: string;
  courtType?: string;
  county?: string;
  filingDate?: string;
  status?: string;
}

export interface ChargeAnalysis {
  caseNumber: string;
  chargeIndex: number;
  description: string;
  statute: string;
  disposition: string;
  dispositionDate: string;
  mappedDisposition: string; // our internal type
  isConviction: boolean;
  isEligibleOffense: boolean;
  offenseInfo: OffenseInfo | null;
  isCannabis: boolean;
  waitYears: number | null;
  waitStart: Date | null;    // when the waiting period starts
  waitEnd: Date | null;      // when the waiting period ends
  eligibleDate: Date | null;
  isPending: boolean;        // case still pending
}

export interface CaseAnalysis {
  caseNumber: string;
  defendant: string;
  courtType: string;
  county: string;
  charges: ChargeAnalysis[];
  overallEligible: boolean;
  overallStatus: "eligible" | "not_eligible" | "blocked_by_other" | "needs_review" | "auto_expunged";
  statusReason: string;
  blockedBy: string[];     // case numbers that block this case
  blocks: string[];        // case numbers this case blocks
  recommendedForm: string;
  filingFee: string;
  filingOrder: number;     // suggested order to file (1 = file first)
}

export interface RecordAnalysisResult {
  defendant: string;
  totalCases: number;
  cases: CaseAnalysis[];
  timeline: TimelineEvent[];
  summary: {
    eligible: number;
    notEligible: number;
    blocked: number;
    needsReview: number;
    autoExpunged: number;
  };
  filingPlan: FilingStep[];
  warnings: string[];
}

export interface TimelineEvent {
  date: Date;
  dateStr: string;
  type: "disposition" | "eligible_date" | "wait_start" | "wait_end" | "blocking";
  caseNumber: string;
  description: string;
  color: "green" | "red" | "amber" | "blue" | "gray";
}

export interface FilingStep {
  order: number;
  caseNumber: string;
  action: string;
  reason: string;
  dependsOn: string[]; // case numbers that must be filed first
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(s: string): Date | null {
  if (!s) return null;
  // Handle YYYY-MM-DD
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return new Date(s + "T12:00:00");
  // Handle MM/DD/YYYY
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}T12:00:00`);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function mapDisposition(raw: string): string {
  const d = raw.toLowerCase();
  if (d.includes("not guilty") || d.includes("acquit")) return "acquittal";
  if (d.includes("nolle prosequi") || d.includes("nol pros")) return "nolle_prosequi";
  if (d.includes("stet")) return "stet";
  if (d.includes("dismiss")) return "dismissal";
  if (d.includes("probation before judgment") || d.includes("pbj") || d.includes("p.b.j")) return "pbj";
  if (d.includes("not criminally responsible")) return "ncr";
  if (d.includes("guilty") || d.includes("convicted") || d.includes("plea")) return "guilty";
  if (d.includes("compromise")) return "compromise";
  return "unknown";
}

function isNonConviction(disp: string): boolean {
  return ["acquittal", "dismissal", "nolle_prosequi", "stet", "pbj", "ncr", "compromise"].includes(disp);
}

function isCannabisCharge(desc: string, statute: string): boolean {
  const d = desc.toLowerCase();
  const s = statute.toLowerCase();
  return d.includes("cannabis") || d.includes("marijuana") ||
    s.includes("5-601") || s.includes("5.601");
}

// ---------------------------------------------------------------------------
// Main Analysis
// ---------------------------------------------------------------------------

export function analyzeFullRecord(cases: CaseRecord[]): RecordAnalysisResult {
  const today = new Date();
  const warnings: string[] = [];

  // Filter out cases with no charges
  cases = cases.filter(c => c.charges && c.charges.length > 0);
  if (cases.length === 0) {
    return {
      defendant: "Unknown",
      totalCases: 0,
      cases: [],
      timeline: [],
      summary: { eligible: 0, notEligible: 0, blocked: 0, needsReview: 0, autoExpunged: 0 },
      filingPlan: [],
      warnings: ["No cases with charge data were found. Check the case numbers and try again."],
    };
  }

  // Step 1: Analyze each charge individually
  const allCharges: ChargeAnalysis[] = [];

  for (const cas of cases) {
    if (!cas.charges || !Array.isArray(cas.charges)) continue;
    for (let i = 0; i < cas.charges.length; i++) {
      const ch = cas.charges[i];
      if (!ch) continue;
      const mapped = ch.disposition ? mapDisposition(ch.disposition) : "unknown";
      const isConv = mapped === "guilty";
      const cannabis = isCannabisCharge(ch.description || '', ch.statute || '');
      let offenseInfo: OffenseInfo | null = null;
      try {
        offenseInfo = isConv ? lookupStatute(ch.statute || '', ch.description || '') : null;
      } catch { offenseInfo = null; }
      const dispDate = parseDate(ch.dispositionDate || '');

      let waitYears: number | null = null;
      let waitStart: Date | null = null;
      let waitEnd: Date | null = null;

      if (isConv && offenseInfo && dispDate) {
        waitYears = offenseInfo.waitYears;
        // Wait period starts from sentence completion — we use disposition date as proxy
        waitStart = dispDate;
        waitEnd = addYears(dispDate, waitYears);
      } else if (isNonConviction(mapped) && dispDate) {
        // Non-convictions have 3-year wait (or 0 for early filing)
        waitYears = 3;
        waitStart = dispDate;
        waitEnd = addYears(dispDate, 3);
      }

      allCharges.push({
        caseNumber: cas.caseNumber,
        chargeIndex: i,
        description: ch.description,
        statute: ch.statute,
        disposition: ch.disposition,
        dispositionDate: ch.dispositionDate,
        mappedDisposition: mapped,
        isConviction: isConv,
        isEligibleOffense: isConv ? offenseInfo !== null : true,
        offenseInfo,
        isCannabis: cannabis,
        waitYears,
        waitStart,
        waitEnd,
        eligibleDate: waitEnd && today >= waitEnd ? waitEnd : waitEnd,
        isPending: mapped === "unknown" && !ch.disposition,
      });
    }
  }

  // Step 2: Build case-level analysis
  const caseAnalyses: CaseAnalysis[] = [];

  for (const cas of cases) {
    const caseCharges = allCharges.filter(c => c.caseNumber === cas.caseNumber);
    const firstCharge = caseCharges[0];

    // Determine overall case eligibility based on charges
    let overallEligible = true;
    let overallStatus: CaseAnalysis["overallStatus"] = "eligible";
    let statusReason = "";
    let form = "072A";
    let fee = "$0";

    // Check if all charges are non-conviction (might be auto-expunged)
    const allNonConviction = caseCharges.every(c => isNonConviction(c.mappedDisposition));
    const anyConviction = caseCharges.some(c => c.isConviction);
    const dispDate = firstCharge ? parseDate(firstCharge.dispositionDate) : null;

    // Auto-expungement check (§ 10-105.1)
    if (allNonConviction && dispDate) {
      const oct2021 = new Date("2021-10-01T12:00:00");
      const allQualify = caseCharges.every(c =>
        ["acquittal", "dismissal", "nolle_prosequi"].includes(c.mappedDisposition));
      if (allQualify && dispDate >= oct2021) {
        const threeYearsLater = addYears(dispDate, 3);
        if (today >= threeYearsLater) {
          overallStatus = "auto_expunged";
          statusReason = `This case may have been automatically expunged under CP § 10-105.1. All charges resulted in acquittal/dismissal/nolle prosequi after Oct 1, 2021, and 3+ years have passed.`;
          form = "N/A";
          fee = "$0";
        }
      }
    }

    if (overallStatus !== "auto_expunged") {
      if (anyConviction) {
        // Check if all convictions are eligible offenses
        const convictionCharges = caseCharges.filter(c => c.isConviction);
        const ineligibleConvictions = convictionCharges.filter(c => !c.isEligibleOffense && !c.isCannabis);

        if (ineligibleConvictions.length > 0) {
          overallEligible = false;
          overallStatus = "not_eligible";
          statusReason = `Charge "${ineligibleConvictions[0].description}" is a guilty conviction that is NOT on the eligible offense list under CP § 10-110(a). This blocks expungement of the entire case under the unit rule.`;
        } else {
          // All convictions are eligible — find the longest wait
          const waitArr = convictionCharges.map(c => c.waitYears || 5);
          const maxWait = waitArr.length > 0 ? Math.max(...waitArr) : 5;
          const latestDispDate = convictionCharges.reduce((latest, c) => {
            const d = parseDate(c.dispositionDate);
            return d && (!latest || d > latest) ? d : latest;
          }, null as Date | null);

          if (latestDispDate) {
            const eligDate = addYears(latestDispDate, maxWait);
            if (today >= eligDate) {
              overallStatus = "eligible";
              statusReason = `All charges eligible. ${maxWait}-year waiting period has passed.`;
            } else {
              overallStatus = "not_eligible";
              overallEligible = false;
              statusReason = `Waiting period not met. Eligible after ${fmtDate(eligDate)} (${maxWait}-year wait from sentence completion).`;
            }
          }
          form = "072B";
          fee = "$30";
        }
      } else if (allNonConviction) {
        // All non-conviction — check waiting period
        if (dispDate) {
          const threeYears = addYears(dispDate, 3);
          if (today >= threeYears) {
            overallStatus = "eligible";
            statusReason = "All charges are non-conviction dispositions. 3+ years have passed.";
            form = "072A";
          } else {
            overallStatus = "eligible";
            statusReason = `All charges are non-conviction dispositions. Less than 3 years — eligible for early filing with General Waiver (Form 072C).`;
            form = "072C";
          }
        }
        fee = "$0";
      }

      // Check for unknown dispositions
      if (caseCharges.some(c => c.mappedDisposition === "unknown")) {
        overallStatus = "needs_review";
        statusReason += " Some charges have unknown dispositions — attorney must review.";
      }
    }

    caseAnalyses.push({
      caseNumber: cas.caseNumber,
      defendant: cas.defendant || "",
      courtType: cas.courtType || "",
      county: cas.county || "",
      charges: caseCharges,
      overallEligible,
      overallStatus,
      statusReason,
      blockedBy: [],
      blocks: [],
      recommendedForm: form,
      filingFee: fee,
      filingOrder: 0,
    });
  }

  // Step 3: Cross-case blocking analysis (§ 10-110(d)(1))
  // "If the person is convicted of a new crime during the applicable time period,
  //  the original conviction is not eligible unless the new conviction becomes eligible."
  for (const targetCase of caseAnalyses) {
    if (targetCase.overallStatus === "auto_expunged") continue;
    if (targetCase.overallStatus === "not_eligible") continue;

    // Find the waiting period window for this case
    const targetCharges = targetCase.charges || [];
    if (targetCharges.length === 0) continue;
    const targetDispDate = targetCharges[0]?.dispositionDate ? parseDate(targetCharges[0].dispositionDate) : null;
    if (!targetDispDate) continue;

    const waits = targetCharges.map(c => c.waitYears || 3).filter(w => w > 0);
    const maxWait = waits.length > 0 ? Math.max(...waits) : 3;
    const waitEnd = addYears(targetDispDate, maxWait);

    // Check if any OTHER case has a conviction that falls within this waiting period
    for (const otherCase of caseAnalyses) {
      if (otherCase.caseNumber === targetCase.caseNumber) continue;

      const otherConvictions = otherCase.charges.filter(c => c.isConviction);
      for (const conv of otherConvictions) {
        const convDate = parseDate(conv.dispositionDate);
        if (!convDate) continue;

        // Does this conviction fall within the target case's waiting period?
        if (convDate > targetDispDate && convDate <= waitEnd) {
          // This conviction blocks the target case
          // UNLESS the blocking conviction itself is eligible for expungement
          if (otherCase.overallEligible && otherCase.overallStatus === "eligible") {
            // The blocker is eligible — target becomes eligible IF blocker is expunged first
            if (!targetCase.blockedBy.includes(otherCase.caseNumber)) {
              targetCase.blockedBy.push(otherCase.caseNumber);
            }
            if (!otherCase.blocks.includes(targetCase.caseNumber)) {
              otherCase.blocks.push(targetCase.caseNumber);
            }
            if (targetCase.overallStatus === "eligible") {
              targetCase.overallStatus = "blocked_by_other";
              targetCase.statusReason = `BLOCKED by Case ${otherCase.caseNumber}: conviction on ${fmtShort(convDate)} for "${conv.description}" falls within this case's ${maxWait}-year waiting period (${fmtShort(targetDispDate)} to ${fmtShort(waitEnd)}). However, Case ${otherCase.caseNumber} is itself eligible for expungement — file that case FIRST, then this case becomes eligible.`;
            }
          } else {
            // The blocker is NOT eligible — target is permanently blocked
            if (!targetCase.blockedBy.includes(otherCase.caseNumber)) {
              targetCase.blockedBy.push(otherCase.caseNumber);
            }
            targetCase.overallStatus = "not_eligible";
            targetCase.overallEligible = false;
            targetCase.statusReason = `BLOCKED by Case ${otherCase.caseNumber}: conviction on ${fmtShort(convDate)} for "${conv.description}" falls within this case's ${maxWait}-year waiting period. The blocking conviction is NOT eligible for expungement, so this case cannot be expunged under CP § 10-110(d)(1).`;
          }
        }
      }
    }
  }

  // Step 4: Determine filing order
  const filingPlan: FilingStep[] = [];
  let order = 1;

  // First: cases that block others (file these first to unblock)
  const blockers = caseAnalyses.filter(c =>
    c.blocks.length > 0 && (c.overallStatus === "eligible" || c.overallStatus === "auto_expunged"));
  for (const cas of blockers) {
    cas.filingOrder = order;
    filingPlan.push({
      order,
      caseNumber: cas.caseNumber,
      action: `File expungement petition (Form ${cas.recommendedForm})`,
      reason: `This case blocks ${cas.blocks.join(", ")}. File first to unblock those cases.`,
      dependsOn: [],
    });
    order++;
  }

  // Second: cases that are eligible and don't block/aren't blocked
  const independent = caseAnalyses.filter(c =>
    c.overallStatus === "eligible" && c.blocks.length === 0 && c.blockedBy.length === 0);
  for (const cas of independent) {
    cas.filingOrder = order;
    filingPlan.push({
      order,
      caseNumber: cas.caseNumber,
      action: `File expungement petition (Form ${cas.recommendedForm})`,
      reason: "No blocking issues — can file anytime.",
      dependsOn: [],
    });
    order++;
  }

  // Third: cases that are blocked but become eligible after blockers are expunged
  const blocked = caseAnalyses.filter(c => c.overallStatus === "blocked_by_other");
  for (const cas of blocked) {
    cas.filingOrder = order;
    filingPlan.push({
      order,
      caseNumber: cas.caseNumber,
      action: `File AFTER ${cas.blockedBy.join(", ")} are expunged (Form ${cas.recommendedForm})`,
      reason: `Blocked by ${cas.blockedBy.join(", ")}. Once those are expunged, this case becomes eligible.`,
      dependsOn: cas.blockedBy,
    });
    order++;
  }

  // Build timeline
  const timeline: TimelineEvent[] = [];
  for (const cas of caseAnalyses) {
    for (const ch of cas.charges) {
      const d = parseDate(ch.dispositionDate);
      if (d) {
        timeline.push({
          date: d,
          dateStr: fmtShort(d),
          type: "disposition",
          caseNumber: cas.caseNumber,
          description: `${ch.description} — ${ch.disposition}`,
          color: ch.isConviction ? "red" : "green",
        });

        if (ch.waitEnd) {
          const eligColor = today >= ch.waitEnd ? "green" : "gray";
          timeline.push({
            date: ch.waitEnd,
            dateStr: fmtShort(ch.waitEnd),
            type: "eligible_date",
            caseNumber: cas.caseNumber,
            description: `Waiting period ends for ${ch.description}`,
            color: eligColor,
          });
        }
      }
    }

    // Add blocking events
    for (const blockerNum of cas.blockedBy) {
      const blocker = caseAnalyses.find(c => c.caseNumber === blockerNum);
      if (blocker) {
        const blockerConv = blocker.charges.find(c => c.isConviction);
        const d = blockerConv ? parseDate(blockerConv.dispositionDate) : null;
        if (d) {
          timeline.push({
            date: d,
            dateStr: fmtShort(d),
            type: "blocking",
            caseNumber: cas.caseNumber,
            description: `Case ${blockerNum} conviction BLOCKS this case`,
            color: "red",
          });
        }
      }
    }
  }

  // Sort timeline chronologically
  timeline.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Summary
  const summary = {
    eligible: caseAnalyses.filter(c => c.overallStatus === "eligible").length,
    notEligible: caseAnalyses.filter(c => c.overallStatus === "not_eligible").length,
    blocked: caseAnalyses.filter(c => c.overallStatus === "blocked_by_other").length,
    needsReview: caseAnalyses.filter(c => c.overallStatus === "needs_review").length,
    autoExpunged: caseAnalyses.filter(c => c.overallStatus === "auto_expunged").length,
  };

  // Warnings
  if (summary.blocked > 0) {
    warnings.push(`${summary.blocked} case(s) are blocked by convictions in other cases during their waiting period. See the filing plan for the recommended order.`);
  }
  if (summary.autoExpunged > 0) {
    warnings.push(`${summary.autoExpunged} case(s) may have been automatically expunged under CP § 10-105.1. Verify on Case Search.`);
  }

  return {
    defendant: cases[0]?.defendant || caseAnalyses[0]?.defendant || "Unknown",
    totalCases: cases.length,
    cases: caseAnalyses,
    timeline,
    summary,
    filingPlan,
    warnings,
  };
}
