export interface EligibilityResult {
  status: "eligible" | "not_eligible" | "needs_review";
  form: "072A" | "072B" | "072C" | "072D" | null;
  fee: string;
  reason: string;
  eligibleDate?: string;
}

function yearsBetween(d1: Date, d2: Date): number {
  const ms = d2.getTime() - d1.getTime();
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function fmt(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function laterDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

export function analyzeEligibility(caseData: {
  dispositionType?: string | null;
  dispositionDate?: string | null;
  hasPendingCases?: string | null;
  sentenceCompleted?: string | null;
  sentenceCompletionDate?: string | null;
  probationDischarged?: string | null;
  probationDischargeDate?: string | null;
}): EligibilityResult {
  const {
    dispositionType,
    dispositionDate,
    hasPendingCases,
    sentenceCompleted,
    sentenceCompletionDate,
    probationDischarged,
    probationDischargeDate,
  } = caseData;

  if (!dispositionType) {
    return { status: "needs_review", form: null, fee: "N/A", reason: "Disposition type not specified. Please select a disposition type." };
  }
  if (!dispositionDate) {
    return { status: "needs_review", form: null, fee: "N/A", reason: "Disposition date not specified. Please enter the disposition date." };
  }

  const today = new Date();
  const dispDate = new Date(dispositionDate);
  if (isNaN(dispDate.getTime())) {
    return { status: "needs_review", form: null, fee: "N/A", reason: "Invalid disposition date." };
  }

  const elapsed = yearsBetween(dispDate, today);

  // Pending cases check — required for most dispositions except acquittal and dismissal
  const pendingExempt = ["acquittal", "dismissal"];
  if (hasPendingCases === "yes" && !pendingExempt.includes(dispositionType)) {
    return {
      status: "not_eligible",
      form: null,
      fee: "N/A",
      reason: "Cannot file for expungement while the defendant has pending criminal cases. All pending matters must be resolved first.",
    };
  }

  switch (dispositionType) {
    case "acquittal":
    case "dismissal": {
      const label = dispositionType === "acquittal" ? "Acquittal/Not Guilty" : "Dismissal";
      if (elapsed >= 3) {
        return { status: "eligible", form: "072A", fee: "$0", reason: `${label} — more than 3 years have passed since disposition. Eligible for expungement using Form CC-DC-CR-072A. No filing fee. No General Waiver and Release required.` };
      } else {
        return { status: "eligible", form: "072C", fee: "$0", reason: `${label} — less than 3 years since disposition. Eligible for early filing using Form CC-DC-CR-072C with attached General Waiver and Release (CC-DC-CR-078). No filing fee.` };
      }
    }

    case "nolle_prosequi": {
      if (elapsed >= 3) {
        return { status: "eligible", form: "072A", fee: "$0", reason: "Nolle Prosequi — more than 3 years have passed since disposition. Eligible for expungement using Form CC-DC-CR-072A. No filing fee." };
      } else {
        return { status: "eligible", form: "072C", fee: "$0", reason: "Nolle Prosequi — less than 3 years since disposition. Eligible for early filing using Form CC-DC-CR-072C with attached General Waiver and Release (CC-DC-CR-078). No filing fee." };
      }
    }

    case "stet": {
      if (elapsed >= 3) {
        return { status: "eligible", form: "072A", fee: "$0", reason: "Stet — more than 3 years have passed since the stet was entered. Eligible for expungement using Form CC-DC-CR-072A. No filing fee." };
      } else {
        const eligDate = addYears(dispDate, 3);
        return { status: "not_eligible", form: null, fee: "N/A", reason: `Stet — the 3-year waiting period has not elapsed. There is no early filing option for stets. This case will become eligible on ${fmt(eligDate)}.`, eligibleDate: eligDate.toISOString() };
      }
    }

    case "pbj_no_longer_crime": {
      return { status: "eligible", form: "072A", fee: "$0", reason: "Probation Before Judgment — the conduct on which the charge was based is no longer a crime. Eligible for expungement immediately using Form CC-DC-CR-072A. No filing fee." };
    }

    case "pbj": {
      if (probationDischarged === "yes" && probationDischargeDate) {
        const dischDate = new Date(probationDischargeDate);
        const threeFromDisp = addYears(dispDate, 3);
        const eligDate = laterDate(threeFromDisp, dischDate);
        if (today >= eligDate) {
          return { status: "eligible", form: "072A", fee: "$0", reason: "Probation Before Judgment — 3+ years have passed since disposition and probation has been discharged. Eligible for expungement using Form CC-DC-CR-072A. No filing fee. NOTE: Defendant must not have been convicted of any crime during the 3-year period following the PBJ." };
        } else {
          return { status: "not_eligible", form: null, fee: "N/A", reason: `PBJ — the waiting period has not been met. Must wait 3 years from disposition date or until probation is discharged, whichever is later. Eligible after ${fmt(eligDate)}.`, eligibleDate: eligDate.toISOString() };
        }
      } else if (elapsed >= 3) {
        return { status: "needs_review", form: "072A", fee: "$0", reason: "PBJ — 3+ years have passed since disposition, but probation discharge date is unknown. Attorney should verify that probation has been completed. If confirmed, eligible using Form CC-DC-CR-072A." };
      } else {
        const eligDate = addYears(dispDate, 3);
        return { status: "not_eligible", form: null, fee: "N/A", reason: `PBJ — must wait 3 years from disposition or discharge from probation, whichever is later. Earliest possible eligibility: ${fmt(eligDate)}.`, eligibleDate: eligDate.toISOString() };
      }
    }

    case "pbj_dui": {
      if (probationDischarged === "yes" && probationDischargeDate) {
        const dischDate = new Date(probationDischargeDate);
        const eligDate = addYears(dischDate, 15);
        if (today >= eligDate) {
          return { status: "eligible", form: "072A", fee: "$0", reason: "PBJ for DUI (Transportation § 21-902) — 15+ years have passed since probation discharge. Eligible for expungement using Form CC-DC-CR-072A. No filing fee. NOTE: Defendant must not have received another PBJ for § 21-902 or been convicted of any crime (other than minor traffic) during the 15-year period." };
        } else {
          return { status: "not_eligible", form: null, fee: "N/A", reason: `PBJ DUI — the 15-year waiting period from probation discharge has not elapsed. Eligible after ${fmt(eligDate)}.`, eligibleDate: eligDate.toISOString() };
        }
      } else {
        return { status: "needs_review", form: "072A", fee: "$0", reason: "PBJ DUI (Transportation § 21-902) — requires 15 years from probation discharge. Probation discharge date is needed to calculate eligibility." };
      }
    }

    case "not_criminally_responsible": {
      if (elapsed >= 3) {
        return { status: "eligible", form: "072A", fee: "$0", reason: "Not Criminally Responsible — 3+ years have passed since the finding. Eligible for expungement using Form CC-DC-CR-072A. No filing fee." };
      } else {
        const eligDate = addYears(dispDate, 3);
        return { status: "not_eligible", form: null, fee: "N/A", reason: `Not Criminally Responsible — must wait 3 years from the finding date. Eligible after ${fmt(eligDate)}.`, eligibleDate: eligDate.toISOString() };
      }
    }

    case "guilty_no_longer_crime": {
      return { status: "eligible", form: "072B", fee: "$30", reason: "Guilty Disposition — the conduct on which the conviction was based is no longer a crime. Eligible for expungement immediately using Form CC-DC-CR-072B. Filing fee: $30." };
    }

    case "guilty_nuisance": {
      if (sentenceCompleted !== "yes") {
        return { status: "needs_review", form: "072B", fee: "$30", reason: "Guilty (nuisance crime) — sentence must be completed before filing. Confirm sentence completion, then the 3-year waiting period applies from the conviction date." };
      }
      if (elapsed >= 3) {
        return { status: "eligible", form: "072B", fee: "$30", reason: "Guilty (nuisance crime, CP § 10-105(a)(9)) — 3+ years since conviction and sentence completed. Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30." };
      } else {
        const eligDate = addYears(dispDate, 3);
        return { status: "not_eligible", form: null, fee: "N/A", reason: `Guilty (nuisance) — must wait 3 years from conviction. Eligible after ${fmt(eligDate)}.`, eligibleDate: eligDate.toISOString() };
      }
    }

    case "guilty_cannabis": {
      if (sentenceCompleted !== "yes") {
        return { status: "needs_review", form: "072B", fee: "$30", reason: "Guilty (cannabis possession, CL § 5-601) — sentence must be completed before filing. 4-year waiting period from the later of conviction or sentence completion." };
      }
      const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
      const base = laterDate(dispDate, compDate);
      const eligDate = addYears(base, 4);
      if (today >= eligDate) {
        return { status: "eligible", form: "072B", fee: "$30", reason: "Guilty (cannabis possession, CL § 5-601) — 4+ years since conviction/sentence completion. Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30." };
      } else {
        return { status: "not_eligible", form: null, fee: "N/A", reason: `Guilty (cannabis) — 4-year waiting period from later of conviction or sentence completion. Eligible after ${fmt(eligDate)}.`, eligibleDate: eligDate.toISOString() };
      }
    }

    case "guilty_misdemeanor": {
      if (sentenceCompleted !== "yes") {
        return { status: "needs_review", form: "072B", fee: "$30", reason: "Guilty (eligible misdemeanor, § 10-110) — sentence must be fully completed (including probation and supervision) before the 5-year waiting period begins." };
      }
      const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
      const eligDate = addYears(compDate, 5);
      if (today >= eligDate) {
        return { status: "eligible", form: "072B", fee: "$30", reason: "Guilty (eligible misdemeanor, CP § 10-110) — 5+ years since sentence completion. Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30. NOTE: Defendant must not have been convicted of a crime not eligible for expungement during the waiting period." };
      } else {
        return { status: "not_eligible", form: null, fee: "N/A", reason: `Eligible misdemeanor (§ 10-110) — 5-year waiting period from sentence completion. Eligible after ${fmt(eligDate)}.`, eligibleDate: eligDate.toISOString() };
      }
    }

    case "guilty_felony": {
      if (sentenceCompleted !== "yes") {
        return { status: "needs_review", form: "072B", fee: "$30", reason: "Guilty (eligible felony / assault 2nd / battery) — sentence must be fully completed before the 7-year waiting period begins." };
      }
      const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
      const eligDate = addYears(compDate, 7);
      if (today >= eligDate) {
        return { status: "eligible", form: "072B", fee: "$30", reason: "Guilty (eligible felony, assault in the second degree, or common law battery) — 7+ years since sentence completion. Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30." };
      } else {
        return { status: "not_eligible", form: null, fee: "N/A", reason: `Eligible felony / assault 2nd / battery — 7-year waiting period from sentence completion. Eligible after ${fmt(eligDate)}.`, eligibleDate: eligDate.toISOString() };
      }
    }

    case "guilty_burglary_theft": {
      if (sentenceCompleted !== "yes") {
        return { status: "needs_review", form: "072B", fee: "$30", reason: "Guilty (burglary 1st/2nd or felony theft) — sentence must be fully completed before the 10-year waiting period begins." };
      }
      const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
      const eligDate = addYears(compDate, 10);
      if (today >= eligDate) {
        return { status: "eligible", form: "072B", fee: "$30", reason: "Guilty (first or second degree burglary, or felony theft) — 10+ years since sentence completion. Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30." };
      } else {
        return { status: "not_eligible", form: null, fee: "N/A", reason: `Burglary/felony theft — 10-year waiting period from sentence completion. Eligible after ${fmt(eligDate)}.`, eligibleDate: eligDate.toISOString() };
      }
    }

    case "guilty_domestic": {
      if (sentenceCompleted !== "yes") {
        return { status: "needs_review", form: "072B", fee: "$30", reason: "Guilty (domestically related crime, CP § 6-233) — sentence must be fully completed before the 15-year waiting period begins." };
      }
      const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
      const eligDate = addYears(compDate, 15);
      if (today >= eligDate) {
        return { status: "eligible", form: "072B", fee: "$30", reason: "Guilty (domestically related crime, CP § 6-233) — 15+ years since sentence completion. Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30." };
      } else {
        return { status: "not_eligible", form: null, fee: "N/A", reason: `Domestically related crime — 15-year waiting period from sentence completion. Eligible after ${fmt(eligDate)}.`, eligibleDate: eligDate.toISOString() };
      }
    }

    case "guilty_pardon": {
      return { status: "needs_review", form: "072B", fee: "$30", reason: "Governor's Pardon — eligible if the defendant received a full and unconditional pardon from the Governor. The petition must be filed within 10 years of the Governor signing the pardon. Attorney should verify pardon details before filing. Form CC-DC-CR-072B. Filing fee: $30." };
    }

    case "compromise": {
      if (elapsed >= 3) {
        return { status: "eligible", form: "072A", fee: "$0", reason: "Compromise/Dismissal (CL § 3-207) — 3+ years have passed since disposition. Eligible for expungement using Form CC-DC-CR-072A. No filing fee." };
      } else {
        const eligDate = addYears(dispDate, 3);
        return { status: "not_eligible", form: null, fee: "N/A", reason: `Compromise — must wait 3 years from disposition. Eligible after ${fmt(eligDate)}.`, eligibleDate: eligDate.toISOString() };
      }
    }

    default:
      return { status: "needs_review", form: null, fee: "N/A", reason: "Unknown disposition type. Attorney review required." };
  }
}
