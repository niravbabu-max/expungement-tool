/**
 * Maryland Expungement Eligibility Engine
 *
 * Implements Maryland Criminal Procedure Article § 10-105 and § 10-110,
 * including the 2025 Reform Act amendments.
 *
 * Sources:
 *  - CP § 10-105  — Non-conviction expungement
 *  - CP § 10-105.1 — Automatic expungement (effective Oct 1, 2021)
 *  - CP § 10-110  — Conviction-based expungement (eligible offense list)
 *  - CP § 6-233   — Domestically related crimes (15-year tier)
 *  - 2025 Reform Act (HB 814 / SB 827) — new offenses, probation-violation rule
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EligibilityResult {
  status: "eligible" | "not_eligible" | "needs_review";
  form: "072A" | "072B" | "072C" | "072D" | null;
  fee: string;
  reason: string;
  eligibleDate?: string;
}

/** Full metadata for a single eligible offense entry. */
export interface OffenseInfo {
  /** Canonical statute reference, e.g. "CL § 3-203" */
  statute: string;
  /** Human-readable name */
  description: string;
  /**
   * Wait years from sentence completion:
   *  3  → nuisance crime or cannabis PWID (§ 5-602 cannabis)
   *  4  → cannabis possession (§ 5-601 cannabis)
   *  5  → default eligible misdemeanor
   *  7  → assault 2nd / battery / eligible felony (except 10yr offenses)
   * 10  → burglary 1st/2nd, felony theft
   * 15  → domestically related (§ 6-233)
   */
  waitYears: 3 | 4 | 5 | 7 | 10 | 15;
  tier: "misdemeanor" | "felony";
  /**
   * True if the offense can be classified as "domestically related" under
   * CP § 6-233, which raises the wait to 15 years.
   */
  domestic: boolean;
  /** True if added to the eligible list by the 2025 Reform Act. */
  new2025: boolean;
  /** Whether this is a cannabis-related offense (exempt from the unit rule). */
  isCannabis?: boolean;
  /** Whether this is a nuisance crime under CP § 10-105(a)(9). */
  isNuisance?: boolean;
}

export interface UnitRuleResult {
  status: "all_eligible" | "blocked" | "needs_review";
  summary: string;
  charges: Array<{
    chargeNumber: number;
    description: string;
    statute: string;
    disposition: string;
    eligible: boolean;
    reason: string;
    isCannabis: boolean;
    waitYears?: number;
  }>;
}

// ---------------------------------------------------------------------------
// ELIGIBLE_OFFENSES lookup table
//
// Key: canonical statute string (lowercase, no spaces) so both
//   "CL § 3-203" and "cl§3-203" normalise the same way.
// We also add CJIS dot-notation aliases in the CJIS_ALIAS map below.
// ---------------------------------------------------------------------------

/**
 * Map of canonical statute key → OffenseInfo.
 * The key is produced by normalizeStatuteKey() — see that function for format.
 *
 * Article prefixes used in keys:
 *   cl  = Criminal Law Article
 *   cp  = Criminal Procedure Article
 *   tr  = Transportation Article
 *   fl  = Family Law Article
 *   bo  = Business Occupations and Professions Article
 *   br  = Business Regulation Article
 *   ca  = Courts Article (formerly Court & Judicial Proceedings)
 *   com = Commercial Law Article
 *   el  = Election Law Article
 *   hg  = Health – General Article
 *   hcd = Housing and Community Development Article
 *   in  = Insurance Article
 *   nr  = Natural Resources Article
 *   ps  = Public Safety Article
 *   rp  = Real Property Article
 *   sg  = State Government Article
 *   tg  = Tax – General Article
 *   abc = Alcoholic Beverages and Cannabis Article
 */
export const ELIGIBLE_OFFENSES: Map<string, OffenseInfo> = new Map([

  // =========================================================================
  // ALCOHOLIC BEVERAGES AND CANNABIS ARTICLE
  // =========================================================================

  ["abc§6-320", {
    statute: "ABC § 6-320",
    description: "Disorderly intoxication",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: true,
  }],

  // =========================================================================
  // BUSINESS OCCUPATIONS AND PROFESSIONS ARTICLE
  // =========================================================================

  ["bo§17-613", {
    statute: "BO § 17-613(a)",
    description: "Real estate license violations",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // BUSINESS REGULATION ARTICLE
  // =========================================================================

  ["br§5-712", {
    statute: "BR § 5-712",
    description: "Business regulation violation (§ 5-712)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["br§19-304", {
    statute: "BR § 19-304",
    description: "Business regulation violation (§ 19-304)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["br§19-308", {
    statute: "BR § 19-308",
    description: "Business regulation violation (§ 19-308)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  // Title 5 Subtitle 6 and Subtitle 9 — represented generically
  ["br§5-6", {
    statute: "BR Title 5 Subtitle 6",
    description: "Business regulation violation (Title 5 Subtitle 6)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["br§5-9", {
    statute: "BR Title 5 Subtitle 9",
    description: "Business regulation violation (Title 5 Subtitle 9)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // COURTS ARTICLE (formerly Court & Judicial Proceedings)
  // =========================================================================

  ["ca§3-1508", {
    statute: "CA § 3-1508",
    description: "Courts Article violation (§ 3-1508)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["ca§10-402", {
    statute: "CA § 10-402",
    description: "Wiretapping / Courts Article (§ 10-402)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // COMMERCIAL LAW ARTICLE
  // =========================================================================

  ["com§14-1915", {
    statute: "COM § 14-1915",
    description: "Commercial law violation (§ 14-1915)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["com§14-2902", {
    statute: "COM § 14-2902",
    description: "Commercial law violation (§ 14-2902)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["com§14-2903", {
    statute: "COM § 14-2903",
    description: "Commercial law violation (§ 14-2903)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // CRIMINAL PROCEDURE ARTICLE
  // =========================================================================

  ["cp§5-211", {
    statute: "CP § 5-211",
    description: "Criminal procedure violation (§ 5-211)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // CRIMINAL LAW ARTICLE — MISDEMEANORS
  // =========================================================================

  // § 3-203 — Assault in the second degree — 7yr (§ 10-110(c)(2))
  ["cl§3-203", {
    statute: "CL § 3-203",
    description: "Assault in the second degree",
    waitYears: 7,
    tier: "misdemeanor",
    domestic: true,  // can be classified as domestically related → 15yr
    new2025: false,
  }],

  // § 3-808 — Stalking
  ["cl§3-808", {
    statute: "CL § 3-808",
    description: "Stalking",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: true,
    new2025: false,
  }],

  // § 5-601 — CDS Possession (NOT cannabis) — 5yr
  ["cl§5-601", {
    statute: "CL § 5-601",
    description: "CDS possession (non-cannabis)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 5-601 cannabis — cannabis possession — 4yr (special cannabis form)
  ["cl§5-601-cannabis", {
    statute: "CL § 5-601 (cannabis)",
    description: "Cannabis possession (CL § 5-601)",
    waitYears: 4,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
    isCannabis: true,
  }],

  // § 5-602 — PWID CDS — 7yr (felony); BUT cannabis PWID → 3yr (§ 10-110(c)(5))
  ["cl§5-602", {
    statute: "CL § 5-602",
    description: "Possession with intent to distribute CDS (non-cannabis)",
    waitYears: 7,
    tier: "felony",
    domestic: false,
    new2025: false,
  }],
  ["cl§5-602-cannabis", {
    statute: "CL § 5-602 (cannabis)",
    description: "Possession with intent to distribute cannabis (CL § 5-602)",
    waitYears: 3,
    tier: "felony",
    domestic: false,
    new2025: false,
    isCannabis: true,
  }],

  // § 5-602(b)(1) — CDS manufacture/distribute by authorized providers
  ["cl§5-602b1", {
    statute: "CL § 5-602(b)(1)",
    description: "CDS manufacture/distribute — authorized providers",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  ["cl§5-618", {
    statute: "CL § 5-618",
    description: "CDS false prescription",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§5-619", {
    statute: "CL § 5-619",
    description: "Drug paraphernalia",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§5-620", {
    statute: "CL § 5-620",
    description: "CDS counterfeit substance",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§5-703", {
    statute: "CL § 5-703",
    description: "CDS — use of property for manufacturing",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§5-708", {
    statute: "CL § 5-708",
    description: "CDS records violations",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§5-902", {
    statute: "CL § 5-902",
    description: "CDS — administering without prescription",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 6-105 — Threat of arson
  ["cl§6-105", {
    statute: "CL § 6-105",
    description: "Threat of arson",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 6-108 — Burning trash container
  ["cl§6-108", {
    statute: "CL § 6-108",
    description: "Burning trash container",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 6-202(a) — 1st degree burglary — 10yr (§ 10-110(c)(6))
  ["cl§6-202", {
    statute: "CL § 6-202(a)",
    description: "Burglary in the first degree",
    waitYears: 10,
    tier: "felony",
    domestic: false,
    new2025: false,
  }],

  // § 6-203 — 2nd degree burglary — 10yr
  ["cl§6-203", {
    statute: "CL § 6-203",
    description: "Burglary in the second degree",
    waitYears: 10,
    tier: "felony",
    domestic: false,
    new2025: false,
  }],

  // § 6-204 — 3rd degree burglary — 7yr (§ 10-110(c)(4))
  ["cl§6-204", {
    statute: "CL § 6-204",
    description: "Burglary in the third degree",
    waitYears: 7,
    tier: "felony",
    domestic: false,
    new2025: false,
  }],

  // § 6-205 — 4th degree burglary — 5yr (misdemeanor)
  ["cl§6-205", {
    statute: "CL § 6-205",
    description: "Burglary in the fourth degree",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 6-206 — Breaking into motor vehicle
  ["cl§6-206", {
    statute: "CL § 6-206",
    description: "Breaking into a motor vehicle",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 6-301 — Malicious destruction under $1000
  ["cl§6-301", {
    statute: "CL § 6-301",
    description: "Malicious destruction of property (under $1,000)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 6-303 — Malicious destruction — utility
  ["cl§6-303", {
    statute: "CL § 6-303",
    description: "Malicious destruction of utility property",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 6-306 — Cutting/injuring tree
  ["cl§6-306", {
    statute: "CL § 6-306",
    description: "Cutting or injuring a tree",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 6-307 — Malicious destruction — tombstone
  ["cl§6-307", {
    statute: "CL § 6-307",
    description: "Malicious destruction of a tombstone",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 6-402 — Trespass (posted property)
  ["cl§6-402", {
    statute: "CL § 6-402",
    description: "Trespass on posted property",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 6-503 — Unauthorized taking of motor vehicle
  ["cl§6-503", {
    statute: "CL § 6-503",
    description: "Unauthorized taking of a motor vehicle",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 7-104 — Theft (misdemeanor = 5yr; felony = 10yr)
  ["cl§7-104", {
    statute: "CL § 7-104",
    description: "Theft (misdemeanor)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§7-104-felony", {
    statute: "CL § 7-104 (felony)",
    description: "Theft (felony)",
    waitYears: 10,
    tier: "felony",
    domestic: false,
    new2025: false,
  }],

  // § 7-203 — Deception in obtaining electric service
  ["cl§7-203", {
    statute: "CL § 7-203",
    description: "Deception in obtaining electric service",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 7-205 — Unauthorized use of livestock
  ["cl§7-205", {
    statute: "CL § 7-205",
    description: "Unauthorized use of livestock",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 7-304 — Receiving stolen property
  ["cl§7-304", {
    statute: "CL § 7-304",
    description: "Receiving stolen property",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 7-308 — Removal of property with fraudulent intent
  ["cl§7-308", {
    statute: "CL § 7-308",
    description: "Removal of property with fraudulent intent",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 7-309 — Theft scheme
  ["cl§7-309", {
    statute: "CL § 7-309",
    description: "Theft scheme",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 8-103 — Bad check [NEW 2025]
  ["cl§8-103", {
    statute: "CL § 8-103",
    description: "Bad check",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: true,
  }],

  // § 8-206 — Credit card theft [NEW 2025]
  ["cl§8-206", {
    statute: "CL § 8-206",
    description: "Credit card theft",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: true,
  }],

  // § 8-401 through § 8-408 — Identity fraud / counterfeit
  ["cl§8-401", {
    statute: "CL § 8-401",
    description: "Identity fraud (§ 8-401)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§8-402", {
    statute: "CL § 8-402",
    description: "Identity fraud (§ 8-402)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§8-404", {
    statute: "CL § 8-404",
    description: "Identity fraud (§ 8-404)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§8-406", {
    statute: "CL § 8-406",
    description: "Identity fraud / counterfeit (§ 8-406)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§8-408", {
    statute: "CL § 8-408",
    description: "Identity fraud / counterfeit (§ 8-408)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 8-503 — Counterfeiting coins
  ["cl§8-503", {
    statute: "CL § 8-503",
    description: "Counterfeiting coins",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 8-521 — Slugs
  ["cl§8-521", {
    statute: "CL § 8-521",
    description: "Use of slugs",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 8-523 — Counterfeit public transportation token
  ["cl§8-523", {
    statute: "CL § 8-523",
    description: "Counterfeit public transportation token",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 8-904 — Securities fraud
  ["cl§8-904", {
    statute: "CL § 8-904",
    description: "Securities fraud",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 9-204 — Perjury subornation
  ["cl§9-204", {
    statute: "CL § 9-204",
    description: "Subornation of perjury",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 9-205 — Unsworn false statement
  ["cl§9-205", {
    statute: "CL § 9-205",
    description: "Unsworn false statement",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 9-503 — Compounding crimes
  ["cl§9-503", {
    statute: "CL § 9-503",
    description: "Compounding a crime",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 9-506 — Obstructing justice
  ["cl§9-506", {
    statute: "CL § 9-506",
    description: "Obstruction of justice",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 10-110 — Phone misuse (note: same number as the expungement statute, different article context)
  ["cl§10-110", {
    statute: "CL § 10-110",
    description: "Misuse of telephone facilities and equipment",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 10-201 — Disorderly conduct
  ["cl§10-201", {
    statute: "CL § 10-201",
    description: "Disorderly conduct",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
    isNuisance: false,
  }],

  // § 10-402 — Wiretapping (CL)
  ["cl§10-402", {
    statute: "CL § 10-402",
    description: "Wiretapping (CL § 10-402)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 10-404 — Divulging telephone contents
  ["cl§10-404", {
    statute: "CL § 10-404",
    description: "Divulging contents of telephone message",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 10-502 — Visual surveillance
  ["cl§10-502", {
    statute: "CL § 10-502",
    description: "Visual surveillance",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 11-303 — Human trafficking (certain)
  ["cl§11-303", {
    statute: "CL § 11-303",
    description: "Human trafficking (certain offenses)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 11-306 — Prostitution
  ["cl§11-306", {
    statute: "CL § 11-306",
    description: "Prostitution",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 11-307 — Assignation
  ["cl§11-307", {
    statute: "CL § 11-307",
    description: "Assignation",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 12-102 through § 12-105 — Gambling
  ["cl§12-102", {
    statute: "CL § 12-102",
    description: "Gambling (§ 12-102)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§12-103", {
    statute: "CL § 12-103",
    description: "Gambling (§ 12-103)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§12-104", {
    statute: "CL § 12-104",
    description: "Gambling (§ 12-104)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§12-105", {
    statute: "CL § 12-105",
    description: "Gambling (§ 12-105)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 12-109 — Gambling (slot machines)
  ["cl§12-109", {
    statute: "CL § 12-109",
    description: "Gambling — slot machines",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 12-203 through § 12-205 — Gambling machines
  ["cl§12-203", {
    statute: "CL § 12-203",
    description: "Gambling machines (§ 12-203)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§12-204", {
    statute: "CL § 12-204",
    description: "Gambling machines (§ 12-204)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§12-205", {
    statute: "CL § 12-205",
    description: "Gambling machines (§ 12-205)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 12-302 — Lottery violations
  ["cl§12-302", {
    statute: "CL § 12-302",
    description: "Lottery violations",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // § 13-401, § 13-602, § 16-201 — Election law violations (listed under CL in spec)
  ["cl§13-401", {
    statute: "CL § 13-401",
    description: "Election law violation (§ 13-401)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§13-602", {
    statute: "CL § 13-602",
    description: "Election law violation (§ 13-602)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["cl§16-201", {
    statute: "CL § 16-201",
    description: "Election law violation (§ 16-201)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // ELECTION LAW ARTICLE (standalone)
  // =========================================================================

  ["el§13-401", {
    statute: "EL § 13-401",
    description: "Election law violation (§ 13-401)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["el§13-602", {
    statute: "EL § 13-602",
    description: "Election law violation (§ 13-602)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["el§16-201", {
    statute: "EL § 16-201",
    description: "Election law violation (§ 16-201)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // FAMILY LAW ARTICLE
  // =========================================================================

  // § 4-509 — Failure to comply with protective order [NEW 2025]
  ["fl§4-509", {
    statute: "FL § 4-509",
    description: "Failure to comply with protective order",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: true,
    new2025: true,
  }],

  // =========================================================================
  // HEALTH – GENERAL ARTICLE
  // =========================================================================

  ["hg§18-215", {
    statute: "HG § 18-215",
    description: "Health – General violation (§ 18-215)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // HOUSING AND COMMUNITY DEVELOPMENT ARTICLE
  // =========================================================================

  ["hcd§4-411", {
    statute: "HCD § 4-411",
    description: "Housing and community development violation (§ 4-411)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["hcd§4-2005", {
    statute: "HCD § 4-2005",
    description: "Housing and community development violation (§ 4-2005)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // INSURANCE ARTICLE
  // =========================================================================

  ["in§27-403", {
    statute: "IN § 27-403",
    description: "Insurance fraud (§ 27-403)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["in§27-404", {
    statute: "IN § 27-404",
    description: "Insurance fraud (§ 27-404)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["in§27-405", {
    statute: "IN § 27-405",
    description: "Insurance fraud (§ 27-405)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["in§27-406", {
    statute: "IN § 27-406",
    description: "Insurance fraud (§ 27-406)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["in§27-407", {
    statute: "IN § 27-407",
    description: "Insurance fraud (§ 27-407)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["in§27-407.2", {
    statute: "IN § 27-407.2",
    description: "Insurance fraud (§ 27-407.2)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // NATURAL RESOURCES ARTICLE
  // =========================================================================

  ["nr§8-725.4", {
    statute: "NR § 8-725.4",
    description: "Personal watercraft violation (§ 8-725.4)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["nr§10-301", {
    statute: "NR § 10-301",
    description: "Natural resources violation (§ 10-301)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["nr§10-306", {
    statute: "NR § 10-306",
    description: "Natural resources violation (§ 10-306)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["nr§10-308.1", {
    statute: "NR § 10-308.1",
    description: "Natural resources violation (§ 10-308.1)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["nr§10-413", {
    statute: "NR § 10-413(e)(1)",
    description: "Natural resources violation (§ 10-413(e)(1))",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["nr§10-418", {
    statute: "NR § 10-418",
    description: "Natural resources violation (§ 10-418)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["nr§10-502", {
    statute: "NR § 10-502",
    description: "Natural resources violation (§ 10-502)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["nr§10-611", {
    statute: "NR § 10-611",
    description: "Natural resources violation (§ 10-611)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["nr§10-907", {
    statute: "NR § 10-907(a)",
    description: "Natural resources violation (§ 10-907(a))",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // PUBLIC SAFETY ARTICLE
  // =========================================================================

  ["ps§5-307", {
    statute: "PS § 5-307",
    description: "Public safety violation (§ 5-307)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["ps§5-308", {
    statute: "PS § 5-308",
    description: "Public safety violation (§ 5-308)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["ps§6-602", {
    statute: "PS § 6-602",
    description: "Public safety violation (§ 6-602)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["ps§7-402", {
    statute: "PS § 7-402",
    description: "Public safety violation (§ 7-402)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["ps§14-114", {
    statute: "PS § 14-114",
    description: "Public safety violation (§ 14-114)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // REAL PROPERTY ARTICLE
  // =========================================================================

  ["rp§7-318.1", {
    statute: "RP § 7-318.1",
    description: "Real property violation (§ 7-318.1)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["rp§7-509", {
    statute: "RP § 7-509",
    description: "Real property violation (§ 7-509)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["rp§10-507", {
    statute: "RP § 10-507",
    description: "Real property violation (§ 10-507)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // STATE GOVERNMENT ARTICLE
  // =========================================================================

  ["sg§9-124", {
    statute: "SG § 9-124",
    description: "State government violation (§ 9-124)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // TAX – GENERAL ARTICLE
  // =========================================================================

  ["tg§13-1001", {
    statute: "TG § 13-1001",
    description: "Tax fraud / evasion (§ 13-1001)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["tg§13-1004", {
    statute: "TG § 13-1004",
    description: "Tax fraud / evasion (§ 13-1004)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["tg§13-1007", {
    statute: "TG § 13-1007",
    description: "Tax fraud / evasion (§ 13-1007)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["tg§13-1024", {
    statute: "TG § 13-1024",
    description: "Tax fraud / evasion (§ 13-1024)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // TRANSPORTATION ARTICLE
  // =========================================================================

  // § 16-303 — Driving without license [NEW 2025] (was formerly § 16-101)
  ["tr§16-303", {
    statute: "TR § 16-303",
    description: "Driving without a license (§ 16-303)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: true,
  }],
  // Old statute reference kept for backward compat
  ["tr§16-101", {
    statute: "TR § 16-101",
    description: "Driving without a license (§ 16-101, now § 16-303)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: true,
  }],

  // Nuisance — Transportation § 7-705 (transit offense)
  ["tr§7-705", {
    statute: "TR § 7-705",
    description: "Transit offense (nuisance crime)",
    waitYears: 3,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
    isNuisance: true,
  }],

  // =========================================================================
  // COMMON LAW OFFENSES
  // =========================================================================

  ["common-law-affray", {
    statute: "Common Law — Affray",
    description: "Affray (common law)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["common-law-rioting", {
    statute: "Common Law — Rioting",
    description: "Rioting (common law)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  ["common-law-contempt", {
    statute: "Common Law — Criminal Contempt",
    description: "Criminal contempt (common law)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],
  // Battery — 7yr (same tier as § 3-203, per § 10-110(c)(2))
  ["common-law-battery", {
    statute: "Common Law — Battery",
    description: "Battery (common law)",
    waitYears: 7,
    tier: "misdemeanor",
    domestic: true,
    new2025: false,
  }],
  ["common-law-hindering", {
    statute: "Common Law — Hindering",
    description: "Hindering (common law)",
    waitYears: 5,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
  }],

  // =========================================================================
  // NUISANCE CRIMES — CP § 10-105(a)(9)
  // Form 072A, $0 fee, 3-year wait
  // =========================================================================

  ["nuisance-public-urination", {
    statute: "CP § 10-105(a)(9)",
    description: "Public urination/defecation (nuisance crime)",
    waitYears: 3,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
    isNuisance: true,
  }],
  ["nuisance-panhandling", {
    statute: "CP § 10-105(a)(9)",
    description: "Panhandling (nuisance crime)",
    waitYears: 3,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
    isNuisance: true,
  }],
  ["nuisance-public-drinking", {
    statute: "CP § 10-105(a)(9)",
    description: "Public drinking (nuisance crime)",
    waitYears: 3,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
    isNuisance: true,
  }],
  ["nuisance-obstructing-passage", {
    statute: "CP § 10-105(a)(9)",
    description: "Obstructing passage (nuisance crime)",
    waitYears: 3,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
    isNuisance: true,
  }],
  ["nuisance-sleeping-parks", {
    statute: "CP § 10-105(a)(9)",
    description: "Sleeping in parks (nuisance crime)",
    waitYears: 3,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
    isNuisance: true,
  }],
  ["nuisance-loitering", {
    statute: "CP § 10-105(a)(9)",
    description: "Loitering (nuisance crime)",
    waitYears: 3,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
    isNuisance: true,
  }],
  ["nuisance-vagrancy", {
    statute: "CP § 10-105(a)(9)",
    description: "Vagrancy (nuisance crime)",
    waitYears: 3,
    tier: "misdemeanor",
    domestic: false,
    new2025: false,
    isNuisance: true,
  }],
]);

// ---------------------------------------------------------------------------
// CJIS Code → canonical key mapping
//
// Maryland Case Search uses dot-notation CJIS codes, e.g.:
//   "CR.3.203"  → CL § 3-203  (CR = Criminal Law Article)
//   "CR.5.601"  → CL § 5-601
//   "CR.5.602"  → CL § 5-602
//   "TR.16.303" → TR § 16-303
//   "FL.4.509"  → FL § 4-509
//   etc.
//
// Article prefix mappings (CJIS → canonical article abbreviation used in our keys):
//   CR  → cl  (Criminal Law)
//   CP  → cp  (Criminal Procedure)
//   TR  → tr  (Transportation)
//   FL  → fl  (Family Law)
//   BO  → bo  (Business Occupations)
//   BR  → br  (Business Regulation)
//   CA  → ca  (Courts Article)
//   COM → com (Commercial Law)
//   EL  → el  (Election Law)
//   HG  → hg  (Health – General)
//   HCD → hcd (Housing and Community Development)
//   IN  → in  (Insurance)
//   NR  → nr  (Natural Resources)
//   PS  → ps  (Public Safety)
//   RP  → rp  (Real Property)
//   SG  → sg  (State Government)
//   TG  → tg  (Tax – General)
//   ABC → abc (Alcoholic Beverages and Cannabis)
// ---------------------------------------------------------------------------

const CJIS_ARTICLE_MAP: Record<string, string> = {
  cr:  "cl",
  cp:  "cp",
  tr:  "tr",
  fl:  "fl",
  bo:  "bo",
  br:  "br",
  ca:  "ca",
  com: "com",
  el:  "el",
  hg:  "hg",
  hcd: "hcd",
  in:  "in",
  nr:  "nr",
  ps:  "ps",
  rp:  "rp",
  sg:  "sg",
  tg:  "tg",
  abc: "abc",
};

/**
 * Normalize a statute string to a canonical lookup key.
 *
 * Accepts formats such as:
 *  - CJIS dot notation: "CR.3.203", "TR.16.303"
 *  - Section symbol:    "CL § 3-203", "§ 3-203"
 *  - Plain:             "3-203", "5-601"
 *  - Common law:        "common law battery"
 *
 * Returns null if the input cannot be meaningfully parsed.
 */
function normalizeStatuteKey(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();

  // ── CJIS dot notation: "cr.3.203", "tr.16.303" ──
  const cjisMatch = s.match(/^([a-z]+)\.(\d+)\.(\d+(?:\.\d+)?)/);
  if (cjisMatch) {
    const artCjis = cjisMatch[1];
    const subtitle = cjisMatch[2];
    const section  = cjisMatch[3];
    const artKey = CJIS_ARTICLE_MAP[artCjis] ?? artCjis;
    return `${artKey}§${subtitle}-${section}`;
  }

  // ── Strip common law prefix and return key ──
  if (s.includes("common law") || s.includes("common-law")) {
    if (s.includes("battery"))   return "common-law-battery";
    if (s.includes("affray"))    return "common-law-affray";
    if (s.includes("riot"))      return "common-law-rioting";
    if (s.includes("contempt"))  return "common-law-contempt";
    if (s.includes("hinder"))    return "common-law-hindering";
  }

  // ── Section symbol notation: "cl § 3-203", "§ 3-203" ──
  // Try to extract article prefix + section number
  const secSymMatch = s.match(/^([a-z]+)\s*[§§]\s*(\d+[-‑]\d+(?:\.\d+)?)/);
  if (secSymMatch) {
    const art = secSymMatch[1].replace(/\s+/g, "");
    const num = secSymMatch[2];
    return `${art}§${num}`;
  }

  // Section symbol without explicit article (e.g. "§ 3-203")
  const noArtMatch = s.match(/^§\s*(\d+[-‑]\d+(?:\.\d+)?)/);
  if (noArtMatch) {
    return `cl§${noArtMatch[1]}`;
  }

  // ── Plain section number: "3-203", "5-601" ──
  const plainMatch = s.match(/^(\d+[-‑]\d+(?:\.\d+)?)$/);
  if (plainMatch) {
    return `cl§${plainMatch[1]}`;
  }

  // ── Loose "§ 3-203" anywhere in the string ──
  const anySecMatch = s.match(/[§§]\s*(\d+[-‑]\d+(?:\.\d+)?)/);
  if (anySecMatch) {
    // Look for a preceding article abbreviation
    const before = s.slice(0, s.indexOf(anySecMatch[0])).trim();
    const artMatch2 = before.match(/([a-z]+)[\s.]*$/);
    const art = artMatch2 ? (CJIS_ARTICLE_MAP[artMatch2[1]] ?? artMatch2[1]) : "cl";
    return `${art}§${anySecMatch[1]}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Keyword-to-key fallback table
//
// Maps uppercase charge description fragments (as they appear in Case Search)
// to canonical statute keys.  Checked only when the statute code lookup fails.
// ---------------------------------------------------------------------------

const DESCRIPTION_KEYWORD_MAP: Array<[RegExp, string]> = [
  // Assault 2nd degree
  [/assault.{0,10}(2nd|second|sec)/i,              "cl§3-203"],
  // Stalking
  [/stalk/i,                                        "cl§3-808"],
  // Cannabis possession
  [/(cannabis|marijuana).{0,20}(poss|possess)/i,   "cl§5-601-cannabis"],
  [/(poss|possess).{0,20}(cannabis|marijuana)/i,   "cl§5-601-cannabis"],
  // Cannabis PWID
  [/(cannabis|marijuana).{0,20}(pwid|distribut|intent)/i, "cl§5-602-cannabis"],
  [/(pwid|distribut|intent).{0,20}(cannabis|marijuana)/i, "cl§5-602-cannabis"],
  // CDS possession (non-cannabis)
  [/cds.{0,20}(poss|possess)/i,                   "cl§5-601"],
  [/(poss|possess).{0,20}cds/i,                   "cl§5-601"],
  // Drug paraphernalia
  [/paraphernalia/i,                               "cl§5-619"],
  // Disorderly conduct
  [/disorderly.{0,10}conduct/i,                    "cl§10-201"],
  // Disorderly intoxication
  [/disorderly.{0,10}intox/i,                      "abc§6-320"],
  // Malicious destruction
  [/malicious.{0,10}destruct/i,                    "cl§6-301"],
  // Theft (misdemeanor default)
  [/theft/i,                                       "cl§7-104"],
  // Receiving stolen property
  [/(receiv|stolen).{0,15}property/i,              "cl§7-304"],
  // Trespass
  [/trespass/i,                                    "cl§6-402"],
  // Burglary 1st
  [/burg.{0,10}(1st|first)/i,                     "cl§6-202"],
  // Burglary 2nd
  [/burg.{0,10}(2nd|second)/i,                    "cl§6-203"],
  // Burglary 3rd
  [/burg.{0,10}(3rd|third)/i,                     "cl§6-204"],
  // Burglary 4th
  [/burg.{0,10}(4th|fourth)/i,                    "cl§6-205"],
  // Breaking into vehicle
  [/break.{0,10}(motor|vehicle|car)/i,             "cl§6-206"],
  // Unauthorized taking motor vehicle
  [/(unauthoriz|unauth).{0,20}(motor|vehicle)/i,   "cl§6-503"],
  // Prostitution
  [/prostitut/i,                                   "cl§11-306"],
  // Driving without license
  [/driv.{0,20}(without|no).{0,10}licen/i,        "tr§16-303"],
  // Failure to comply with protective order
  [/(fail|violat).{0,20}(protective|protect).{0,10}order/i, "fl§4-509"],
  // Bad check
  [/bad.{0,10}check/i,                             "cl§8-103"],
  // Credit card theft/fraud
  [/credit.{0,10}card/i,                           "cl§8-206"],
  // Obstruction of justice
  [/obstruct.{0,10}(justice|just)/i,               "cl§9-506"],
  // Threat of arson
  [/threat.{0,10}arson/i,                          "cl§6-105"],
  // Common law battery
  [/\bbattery\b/i,                                 "common-law-battery"],
  // Nuisance: loitering
  [/loiter/i,                                      "nuisance-loitering"],
  // Nuisance: vagrancy
  [/vagrancy|vagrant/i,                            "nuisance-vagrancy"],
  // Nuisance: panhandling
  [/panhandl/i,                                    "nuisance-panhandling"],
  // Nuisance: public urination
  [/public.{0,15}(urinat|defecation)/i,            "nuisance-public-urination"],
  // Nuisance: public drinking
  [/public.{0,15}drink/i,                          "nuisance-public-drinking"],
  // Nuisance: obstructing passage
  [/obstruct.{0,15}passage/i,                      "nuisance-obstructing-passage"],
];

// ---------------------------------------------------------------------------
// lookupStatute
// ---------------------------------------------------------------------------

/**
 * Look up an offense in the ELIGIBLE_OFFENSES table.
 *
 * @param statuteCode      CJIS code (e.g. "CR.3.203") or statute reference
 *                         (e.g. "§ 3-203", "CL § 3-203", "3-203").
 * @param chargeDescription  Charge description as it appears in Case Search
 *                           (typically ALL CAPS, e.g. "ASSAULT-SEC DEGREE").
 *                           Used as a keyword-match fallback if the statute
 *                           code lookup fails.
 * @returns OffenseInfo if found, null otherwise.
 */
export function lookupStatute(
  statuteCode: string,
  chargeDescription: string
): OffenseInfo | null {
  // 1. Try direct key lookup from the statute code
  if (statuteCode) {
    const key = normalizeStatuteKey(statuteCode);
    if (key) {
      const hit = ELIGIBLE_OFFENSES.get(key);
      if (hit) return hit;

      // Also try stripping subsection qualifiers for a broader match
      // e.g. "cl§5-602b1" → try "cl§5-602"
      const baseKey = key.replace(/[a-z]+\d*$/, "");
      const baseHit = ELIGIBLE_OFFENSES.get(baseKey);
      if (baseHit) return baseHit;
    }
  }

  // 2. Fall back to keyword matching on the charge description
  if (chargeDescription) {
    for (const [pattern, mappedKey] of DESCRIPTION_KEYWORD_MAP) {
      if (pattern.test(chargeDescription)) {
        const hit = ELIGIBLE_OFFENSES.get(mappedKey);
        if (hit) return hit;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers (shared by analyzeEligibility and analyzeUnit)
// ---------------------------------------------------------------------------

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

/** Returns true if the disposition string indicates a non-conviction outcome. */
function isNonConviction(disposition: string): boolean {
  const d = disposition.trim().toLowerCase();
  return (
    d === "acquittal" ||
    d === "not guilty" ||
    d === "dismissal" ||
    d === "dismissed" ||
    d === "nolle prosequi" ||
    d === "nolle_prosequi" ||
    d === "nol pros" ||
    d === "stet" ||
    d === "pbj" ||
    d === "probation before judgment" ||
    d === "not criminally responsible" ||
    d === "ncr" ||
    d === "compromise"
  );
}

// ---------------------------------------------------------------------------
// checkAutoExpungement  (§ 10-105.1)
// ---------------------------------------------------------------------------

/**
 * Determine whether a case may have been automatically expunged under
 * CP § 10-105.1 (effective October 1, 2021).
 *
 * Conditions:
 *  1. Disposition is acquittal, dismissal, not guilty, or nolle prosequi
 *     (excluding nolle prosequi entered with drug/alcohol treatment condition).
 *  2. Disposition date is on or after October 1, 2021.
 *  3. At least 3 years have passed since the disposition date.
 *
 * @param dispositionDate  ISO date string or parseable date of the disposition.
 * @param dispositionType  Disposition type (case-insensitive string).
 */
export function checkAutoExpungement(
  dispositionDate: string,
  dispositionType: string
): { autoExpunged: boolean; message: string } {
  const AUTO_EXP_CUTOFF = new Date("2021-10-01");

  if (!dispositionDate || !dispositionType) {
    return { autoExpunged: false, message: "Insufficient information to determine automatic expungement." };
  }

  const dispDate = new Date(dispositionDate);
  if (isNaN(dispDate.getTime())) {
    return { autoExpunged: false, message: "Invalid disposition date — cannot determine automatic expungement." };
  }

  const d = dispositionType.trim().toLowerCase();
  const qualifyingTypes = [
    "acquittal", "not guilty", "dismissal", "dismissed",
    "nolle prosequi", "nolle_prosequi", "nol pros",
  ];

  const isQualifying = qualifyingTypes.some((t) => d.includes(t));
  if (!isQualifying) {
    return {
      autoExpunged: false,
      message: `Disposition type "${dispositionType}" does not qualify for automatic expungement under § 10-105.1.`,
    };
  }

  if (dispDate < AUTO_EXP_CUTOFF) {
    return {
      autoExpunged: false,
      message: `Disposition pre-dates October 1, 2021 — automatic expungement under § 10-105.1 does not apply. A petition may still be filed manually.`,
    };
  }

  const today = new Date();
  const elapsed = yearsBetween(dispDate, today);

  if (elapsed >= 3) {
    return {
      autoExpunged: true,
      message:
        `This case may have been automatically expunged under CP § 10-105.1. ` +
        `The disposition (${dispositionType}) occurred on or after October 1, 2021, ` +
        `and more than 3 years have passed. No petition is required. ` +
        `The defendant should confirm with the court or the Maryland Judiciary that ` +
        `the record has been cleared.`,
    };
  } else {
    const eligDate = addYears(dispDate, 3);
    return {
      autoExpunged: false,
      message:
        `This case qualifies for automatic expungement under CP § 10-105.1 ` +
        `(disposition after October 1, 2021) but the 3-year waiting period has not yet ` +
        `elapsed. Automatic expungement will occur around ${fmt(eligDate)}.`,
    };
  }
}

// ---------------------------------------------------------------------------
// analyzeUnit  (Unit Rule)
// ---------------------------------------------------------------------------

/**
 * Apply the Maryland unit rule to a set of charges from the same case.
 *
 * Under the unit rule (CP § 10-110(d)(3)), if any non-cannabis conviction in a
 * case unit is not eligible for expungement, ALL convictions in that unit are
 * blocked.  Cannabis charges are explicitly exempt from the unit rule.
 *
 * Non-conviction dispositions (acquittal, dismissal, nolle prosequi, stet,
 * PBJ, NCR, compromise) are individually eligible regardless of other charges.
 */
export function analyzeUnit(
  charges: Array<{
    description: string;
    statute: string;
    disposition: string;
    dispositionDate: string;
  }>
): UnitRuleResult {
  if (!charges || charges.length === 0) {
    return {
      status: "needs_review",
      summary: "No charges provided.",
      charges: [],
    };
  }

  type ChargeResult = UnitRuleResult["charges"][number];

  const results: ChargeResult[] = charges.map((charge, idx) => {
    const isCannabis = isCannabisCharge(charge.description, charge.statute);
    const disp = charge.disposition?.trim() ?? "";

    // Non-conviction dispositions → individually eligible
    if (isNonConviction(disp)) {
      return {
        chargeNumber: idx + 1,
        description: charge.description,
        statute: charge.statute,
        disposition: charge.disposition,
        eligible: true,
        isCannabis,
        reason: `Non-conviction disposition (${charge.disposition}) — individually eligible regardless of other charges.`,
      };
    }

    // Guilty / convicted dispositions — look up statute
    if (isGuiltyDisposition(disp)) {
      const offense = lookupStatute(charge.statute, charge.description);
      if (offense) {
        return {
          chargeNumber: idx + 1,
          description: charge.description,
          statute: charge.statute,
          disposition: charge.disposition,
          eligible: true,
          isCannabis: isCannabis || !!(offense.isCannabis),
          waitYears: offense.waitYears,
          reason:
            `Guilty — statute ${offense.statute} (${offense.description}) is on the § 10-110 eligible list. ` +
            `Wait period: ${offense.waitYears} year(s) from sentence completion.` +
            (offense.new2025 ? " [Added by 2025 Reform Act]" : "") +
            (offense.domestic ? " Note: 15-year wait applies if classified as domestically related." : ""),
        };
      } else {
        return {
          chargeNumber: idx + 1,
          description: charge.description,
          statute: charge.statute,
          disposition: charge.disposition,
          eligible: false,
          isCannabis,
          reason: `Guilty — statute "${charge.statute || charge.description}" was not found on the § 10-110 eligible offense list. This conviction blocks the entire unit (unit rule).`,
        };
      }
    }

    // Unknown or ambiguous disposition
    return {
      chargeNumber: idx + 1,
      description: charge.description,
      statute: charge.statute,
      disposition: charge.disposition,
      eligible: false,
      isCannabis,
      reason: `Unknown or unrecognized disposition "${charge.disposition}" — attorney review required.`,
    };
  });

  // Apply unit rule:
  //   Cannabis charges are excluded from the unit rule analysis.
  //   If ANY non-cannabis charge is ineligible → blocked.
  //   If any charge has an unknown/needs-review disposition → needs_review.
  const nonCannabisResults = results.filter((r) => !r.isCannabis);
  const hasUnknown = results.some((r) => r.reason.includes("attorney review required"));

  if (hasUnknown) {
    return {
      status: "needs_review",
      summary:
        "One or more charges have unrecognized dispositions. Attorney review is required before determining unit eligibility.",
      charges: results,
    };
  }

  const anyBlocked = nonCannabisResults.some((r) => !r.eligible);

  if (anyBlocked) {
    // Mark all non-cannabis guilty charges as blocked due to unit rule
    const updatedResults = results.map((r) => {
      if (!r.isCannabis && r.eligible && isGuiltyDisposition(r.disposition)) {
        return {
          ...r,
          eligible: false,
          reason:
            r.reason +
            " However, this charge is blocked by the unit rule because another conviction in this case is not eligible for expungement.",
        };
      }
      return r;
    });
    return {
      status: "blocked",
      summary:
        "One or more convictions in this case are NOT eligible for expungement. Under the Maryland unit rule (CP § 10-110(d)(3)), all convictions in this case are blocked. Only non-conviction charges (dismissals, acquittals, etc.) may still be expunged individually. Cannabis charges remain exempt.",
      charges: updatedResults,
    };
  }

  return {
    status: "all_eligible",
    summary:
      "All charges in this case are eligible for expungement (or are cannabis charges exempt from the unit rule). Individual waiting periods still apply.",
    charges: results,
  };
}

/** Returns true if the disposition string indicates a guilty/convicted outcome. */
function isGuiltyDisposition(disposition: string): boolean {
  const d = disposition.trim().toLowerCase();
  return (
    d === "guilty" ||
    d === "convicted" ||
    d === "guilty plea" ||
    d === "plea of guilty" ||
    d === "nolo contendere" ||
    d === "alford plea"
  );
}

/**
 * Returns true if a charge relates to cannabis, based on the statute code
 * or description text.
 */
function isCannabisCharge(description: string, statute: string): boolean {
  const desc = (description ?? "").toLowerCase();
  const stat = (statute ?? "").toLowerCase();

  if (/cannabis|marijuana/i.test(desc)) return true;
  if (/5-601-cannabis|5-602-cannabis/i.test(stat)) return true;

  // CJIS cannabis — we cannot determine from the code alone without context,
  // so we rely on the description keyword check above.
  return false;
}

// ---------------------------------------------------------------------------
// analyzeEligibility  (main entry point — existing interface preserved)
// ---------------------------------------------------------------------------

/**
 * Determine whether a Maryland criminal case is eligible for expungement
 * and return the appropriate form, fee, and guidance.
 *
 * The function signature is backward-compatible with the original implementation.
 * Two new optional fields are accepted:
 *   - `statuteCode`  (CJIS code or statute reference, e.g. "CR.3.203")
 *   - `chargeDescription` (ALL-CAPS description from Case Search)
 *
 * When `statuteCode` or `chargeDescription` is provided for a guilty
 * disposition, the exact waiting period is derived from the § 10-110 statute
 * table rather than requiring the caller to select the correct subcategory.
 *
 * 2025 Reform Act note (§ 10-110 amendment):
 *   Probation violations no longer automatically block expungement eligibility.
 *   Courts must consider overall success on probation and ability to pay
 *   restitution. This is reflected in the guidance text returned for conviction-
 *   based dispositions.
 */
export function analyzeEligibility(caseData: {
  dispositionType?: string | null;
  dispositionDate?: string | null;
  hasPendingCases?: string | null;
  sentenceCompleted?: string | null;
  sentenceCompletionDate?: string | null;
  probationDischarged?: string | null;
  probationDischargeDate?: string | null;
  // New optional fields (backward-compatible)
  statuteCode?: string | null;
  chargeDescription?: string | null;
}): EligibilityResult {
  const {
    dispositionType,
    dispositionDate,
    hasPendingCases,
    sentenceCompleted,
    sentenceCompletionDate,
    probationDischarged,
    probationDischargeDate,
    statuteCode,
    chargeDescription,
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

  // 2025 Reform Act note appended to conviction-based results
  const reform2025Note =
    " NOTE (2025 Reform Act): Probation violations no longer automatically block eligibility. " +
    "Courts must consider the defendant's overall success on probation and ability to pay restitution.";

  switch (dispositionType) {

    // ── Non-conviction dispositions ──────────────────────────────────────────

    case "acquittal":
    case "dismissal": {
      const label = dispositionType === "acquittal" ? "Acquittal/Not Guilty" : "Dismissal";

      // Check for automatic expungement under § 10-105.1
      const autoCheck = checkAutoExpungement(dispositionDate, dispositionType);
      const autoNote = autoCheck.autoExpunged
        ? ` IMPORTANT: ${autoCheck.message}`
        : "";

      if (elapsed >= 3) {
        return {
          status: "eligible",
          form: "072A",
          fee: "$0",
          reason:
            `${label} — more than 3 years have passed since disposition. ` +
            `Eligible for expungement using Form CC-DC-CR-072A. No filing fee. ` +
            `No General Waiver and Release required.${autoNote}`,
        };
      } else {
        return {
          status: "eligible",
          form: "072C",
          fee: "$0",
          reason:
            `${label} — less than 3 years since disposition. ` +
            `Eligible for early filing using Form CC-DC-CR-072C with attached ` +
            `General Waiver and Release (CC-DC-CR-078). No filing fee.${autoNote}`,
        };
      }
    }

    case "nolle_prosequi": {
      const autoCheck = checkAutoExpungement(dispositionDate, "nolle prosequi");
      const autoNote = autoCheck.autoExpunged
        ? ` IMPORTANT: ${autoCheck.message}`
        : "";

      if (elapsed >= 3) {
        return {
          status: "eligible",
          form: "072A",
          fee: "$0",
          reason:
            `Nolle Prosequi — more than 3 years have passed since disposition. ` +
            `Eligible for expungement using Form CC-DC-CR-072A. No filing fee.${autoNote}`,
        };
      } else {
        return {
          status: "eligible",
          form: "072C",
          fee: "$0",
          reason:
            `Nolle Prosequi — less than 3 years since disposition. ` +
            `Eligible for early filing using Form CC-DC-CR-072C with attached ` +
            `General Waiver and Release (CC-DC-CR-078). No filing fee.${autoNote}`,
        };
      }
    }

    case "stet": {
      if (elapsed >= 3) {
        return {
          status: "eligible",
          form: "072A",
          fee: "$0",
          reason:
            "Stet — more than 3 years have passed since the stet was entered. " +
            "Eligible for expungement using Form CC-DC-CR-072A. No filing fee. " +
            "NOTE: Under the 2025 Reform Act, Case Search no longer shows stets that are 3+ years old.",
        };
      } else {
        const eligDate = addYears(dispDate, 3);
        return {
          status: "not_eligible",
          form: null,
          fee: "N/A",
          reason: `Stet — the 3-year waiting period has not elapsed. There is no early filing option for stets. This case will become eligible on ${fmt(eligDate)}.`,
          eligibleDate: eligDate.toISOString(),
        };
      }
    }

    case "pbj_no_longer_crime": {
      return {
        status: "eligible",
        form: "072A",
        fee: "$0",
        reason:
          "Probation Before Judgment — the conduct on which the charge was based is no longer a crime. " +
          "Eligible for expungement immediately using Form CC-DC-CR-072A. No filing fee.",
      };
    }

    case "pbj": {
      if (probationDischarged === "yes" && probationDischargeDate) {
        const dischDate = new Date(probationDischargeDate);
        const threeFromDisp = addYears(dispDate, 3);
        const eligDate = laterDate(threeFromDisp, dischDate);
        if (today >= eligDate) {
          return {
            status: "eligible",
            form: "072A",
            fee: "$0",
            reason:
              "Probation Before Judgment — 3+ years have passed since disposition and probation has been discharged. " +
              "Eligible for expungement using Form CC-DC-CR-072A. No filing fee. " +
              "NOTE: Defendant must not have been convicted of any crime during the 3-year period following the PBJ." +
              reform2025Note,
          };
        } else {
          return {
            status: "not_eligible",
            form: null,
            fee: "N/A",
            reason: `PBJ — the waiting period has not been met. Must wait 3 years from disposition date or until probation is discharged, whichever is later. Eligible after ${fmt(eligDate)}.`,
            eligibleDate: eligDate.toISOString(),
          };
        }
      } else if (elapsed >= 3) {
        return {
          status: "needs_review",
          form: "072A",
          fee: "$0",
          reason:
            "PBJ — 3+ years have passed since disposition, but probation discharge date is unknown. " +
            "Attorney should verify that probation has been completed. If confirmed, eligible using Form CC-DC-CR-072A." +
            reform2025Note,
        };
      } else {
        const eligDate = addYears(dispDate, 3);
        return {
          status: "not_eligible",
          form: null,
          fee: "N/A",
          reason: `PBJ — must wait 3 years from disposition or discharge from probation, whichever is later. Earliest possible eligibility: ${fmt(eligDate)}.`,
          eligibleDate: eligDate.toISOString(),
        };
      }
    }

    case "pbj_dui": {
      if (probationDischarged === "yes" && probationDischargeDate) {
        const dischDate = new Date(probationDischargeDate);
        const eligDate = addYears(dischDate, 15);
        if (today >= eligDate) {
          return {
            status: "eligible",
            form: "072A",
            fee: "$0",
            reason:
              "PBJ for DUI (Transportation § 21-902) — 15+ years have passed since probation discharge. " +
              "Eligible for expungement using Form CC-DC-CR-072A. No filing fee. " +
              "NOTE: Defendant must not have received another PBJ for § 21-902 or been convicted of any crime " +
              "(other than minor traffic) during the 15-year period.",
          };
        } else {
          return {
            status: "not_eligible",
            form: null,
            fee: "N/A",
            reason: `PBJ DUI — the 15-year waiting period from probation discharge has not elapsed. Eligible after ${fmt(eligDate)}.`,
            eligibleDate: eligDate.toISOString(),
          };
        }
      } else {
        return {
          status: "needs_review",
          form: "072A",
          fee: "$0",
          reason:
            "PBJ DUI (Transportation § 21-902) — requires 15 years from probation discharge. " +
            "Probation discharge date is needed to calculate eligibility.",
        };
      }
    }

    case "not_criminally_responsible": {
      if (elapsed >= 3) {
        return {
          status: "eligible",
          form: "072A",
          fee: "$0",
          reason:
            "Not Criminally Responsible — 3+ years have passed since the finding. " +
            "Eligible for expungement using Form CC-DC-CR-072A. No filing fee.",
        };
      } else {
        const eligDate = addYears(dispDate, 3);
        return {
          status: "not_eligible",
          form: null,
          fee: "N/A",
          reason: `Not Criminally Responsible — must wait 3 years from the finding date. Eligible after ${fmt(eligDate)}.`,
          eligibleDate: eligDate.toISOString(),
        };
      }
    }

    // ── Conviction-based dispositions ─────────────────────────────────────────

    case "guilty_no_longer_crime": {
      return {
        status: "eligible",
        form: "072B",
        fee: "$30",
        reason:
          "Guilty Disposition — the conduct on which the conviction was based is no longer a crime. " +
          "Eligible for expungement immediately using Form CC-DC-CR-072B. Filing fee: $30.",
      };
    }

    case "guilty_nuisance": {
      // Nuisance crimes: CP § 10-105(a)(9) — Form 072A, $0 fee, 3yr wait
      if (sentenceCompleted !== "yes") {
        return {
          status: "needs_review",
          form: "072A",
          fee: "$0",
          reason:
            "Guilty (nuisance crime, CP § 10-105(a)(9)) — sentence must be completed before filing. " +
            "Confirm sentence completion; the 3-year waiting period applies from the conviction date. " +
            "Nuisance crimes use Form CC-DC-CR-072A with no filing fee.",
        };
      }
      if (elapsed >= 3) {
        return {
          status: "eligible",
          form: "072A",
          fee: "$0",
          reason:
            "Guilty (nuisance crime, CP § 10-105(a)(9)) — 3+ years since conviction and sentence completed. " +
            "Eligible for expungement using Form CC-DC-CR-072A. No filing fee." +
            reform2025Note,
        };
      } else {
        const eligDate = addYears(dispDate, 3);
        return {
          status: "not_eligible",
          form: null,
          fee: "N/A",
          reason: `Guilty (nuisance crime) — must wait 3 years from conviction. Eligible after ${fmt(eligDate)}.`,
          eligibleDate: eligDate.toISOString(),
        };
      }
    }

    case "guilty_cannabis": {
      // Cannabis possession (§ 5-601): 4yr wait, Form 072B (or 072D), $30
      if (sentenceCompleted !== "yes") {
        return {
          status: "needs_review",
          form: "072B",
          fee: "$30",
          reason:
            "Guilty (cannabis possession, CL § 5-601) — sentence must be completed before filing. " +
            "4-year waiting period from the later of conviction or sentence completion. " +
            "NOTE: Pre-2022 cannabis possession may already be pardoned or auto-expunged.",
        };
      }
      const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
      const base = laterDate(dispDate, compDate);
      const eligDate = addYears(base, 4);
      if (today >= eligDate) {
        return {
          status: "eligible",
          form: "072B",
          fee: "$30",
          reason:
            "Guilty (cannabis possession, CL § 5-601) — 4+ years since conviction/sentence completion. " +
            "Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30. " +
            "NOTE: Pre-2022 cannabis possession may already be pardoned or automatically expunged.",
        };
      } else {
        return {
          status: "not_eligible",
          form: null,
          fee: "N/A",
          reason: `Guilty (cannabis possession) — 4-year waiting period from later of conviction or sentence completion. Eligible after ${fmt(eligDate)}.`,
          eligibleDate: eligDate.toISOString(),
        };
      }
    }

    case "guilty_cannabis_pwid": {
      // Cannabis PWID (§ 5-602 cannabis): 3yr wait per § 10-110(c)(5)
      if (sentenceCompleted !== "yes") {
        return {
          status: "needs_review",
          form: "072B",
          fee: "$30",
          reason:
            "Guilty (cannabis PWID, CL § 5-602 cannabis) — sentence must be completed before filing. " +
            "3-year waiting period from sentence completion per CP § 10-110(c)(5).",
        };
      }
      const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
      const base = laterDate(dispDate, compDate);
      const eligDate = addYears(base, 3);
      if (today >= eligDate) {
        return {
          status: "eligible",
          form: "072B",
          fee: "$30",
          reason:
            "Guilty (cannabis PWID, CL § 5-602 cannabis) — 3+ years since sentence completion. " +
            "Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30. " +
            "Wait period: 3 years per CP § 10-110(c)(5)." +
            reform2025Note,
        };
      } else {
        return {
          status: "not_eligible",
          form: null,
          fee: "N/A",
          reason: `Guilty (cannabis PWID) — 3-year waiting period from sentence completion per § 10-110(c)(5). Eligible after ${fmt(eligDate)}.`,
          eligibleDate: eligDate.toISOString(),
        };
      }
    }

    case "guilty_misdemeanor": {
      // Use statute lookup to determine exact wait period when available
      const offense = (statuteCode || chargeDescription)
        ? lookupStatute(statuteCode ?? "", chargeDescription ?? "")
        : null;

      if (sentenceCompleted !== "yes") {
        const waitDesc = offense ? `${offense.waitYears}-year` : "5-year";
        return {
          status: "needs_review",
          form: "072B",
          fee: "$30",
          reason:
            `Guilty (eligible misdemeanor, § 10-110) — sentence must be fully completed ` +
            `(including probation and supervision) before the ${waitDesc} waiting period begins.` +
            (offense ? ` Offense: ${offense.description} (${offense.statute}).` : "") +
            reform2025Note,
        };
      }

      const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
      const waitYears = offense ? offense.waitYears : 5;
      const eligDate = addYears(compDate, waitYears);
      const offenseNote = offense
        ? ` Offense: ${offense.description} (${offense.statute}).` +
          (offense.new2025 ? " [Added by 2025 Reform Act]" : "") +
          (offense.domestic ? " NOTE: 15-year wait applies if classified as domestically related (CP § 6-233)." : "")
        : "";

      if (today >= eligDate) {
        return {
          status: "eligible",
          form: "072B",
          fee: "$30",
          reason:
            `Guilty (eligible misdemeanor, CP § 10-110) — ${waitYears}+ years since sentence completion. ` +
            `Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30.${offenseNote} ` +
            `NOTE: Defendant must not have been convicted of a crime not eligible for expungement during the waiting period.` +
            reform2025Note,
        };
      } else {
        return {
          status: "not_eligible",
          form: null,
          fee: "N/A",
          reason: `Eligible misdemeanor (§ 10-110) — ${waitYears}-year waiting period from sentence completion.${offenseNote} Eligible after ${fmt(eligDate)}.`,
          eligibleDate: eligDate.toISOString(),
        };
      }
    }

    case "guilty_felony": {
      // Assault 2nd / battery / eligible felony — 7yr default
      // Use statute lookup to refine if possible
      const offense = (statuteCode || chargeDescription)
        ? lookupStatute(statuteCode ?? "", chargeDescription ?? "")
        : null;

      if (sentenceCompleted !== "yes") {
        return {
          status: "needs_review",
          form: "072B",
          fee: "$30",
          reason:
            "Guilty (eligible felony / assault 2nd / battery) — sentence must be fully completed before the 7-year waiting period begins." +
            reform2025Note,
        };
      }
      const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
      const waitYears = offense ? offense.waitYears : 7;
      const eligDate = addYears(compDate, waitYears);
      const offenseNote = offense
        ? ` Offense: ${offense.description} (${offense.statute}).` +
          (offense.new2025 ? " [Added by 2025 Reform Act]" : "") +
          (offense.domestic ? " NOTE: 15-year wait applies if classified as domestically related (CP § 6-233)." : "")
        : "";

      if (today >= eligDate) {
        return {
          status: "eligible",
          form: "072B",
          fee: "$30",
          reason:
            `Guilty (eligible felony, assault in the second degree, or common law battery) — ` +
            `${waitYears}+ years since sentence completion. ` +
            `Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30.${offenseNote}` +
            reform2025Note,
        };
      } else {
        return {
          status: "not_eligible",
          form: null,
          fee: "N/A",
          reason: `Eligible felony / assault 2nd / battery — ${waitYears}-year waiting period from sentence completion.${offenseNote} Eligible after ${fmt(eligDate)}.`,
          eligibleDate: eligDate.toISOString(),
        };
      }
    }

    case "guilty_burglary_theft": {
      if (sentenceCompleted !== "yes") {
        return {
          status: "needs_review",
          form: "072B",
          fee: "$30",
          reason:
            "Guilty (burglary 1st/2nd or felony theft) — sentence must be fully completed before the 10-year waiting period begins." +
            reform2025Note,
        };
      }
      const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
      const eligDate = addYears(compDate, 10);
      if (today >= eligDate) {
        return {
          status: "eligible",
          form: "072B",
          fee: "$30",
          reason:
            "Guilty (first or second degree burglary, or felony theft) — 10+ years since sentence completion. " +
            "Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30." +
            reform2025Note,
        };
      } else {
        return {
          status: "not_eligible",
          form: null,
          fee: "N/A",
          reason: `Burglary/felony theft — 10-year waiting period from sentence completion. Eligible after ${fmt(eligDate)}.`,
          eligibleDate: eligDate.toISOString(),
        };
      }
    }

    case "guilty_domestic": {
      if (sentenceCompleted !== "yes") {
        return {
          status: "needs_review",
          form: "072B",
          fee: "$30",
          reason:
            "Guilty (domestically related crime, CP § 6-233) — sentence must be fully completed before the 15-year waiting period begins." +
            reform2025Note,
        };
      }
      const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
      const eligDate = addYears(compDate, 15);
      if (today >= eligDate) {
        return {
          status: "eligible",
          form: "072B",
          fee: "$30",
          reason:
            "Guilty (domestically related crime, CP § 6-233) — 15+ years since sentence completion. " +
            "Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30." +
            reform2025Note,
        };
      } else {
        return {
          status: "not_eligible",
          form: null,
          fee: "N/A",
          reason: `Domestically related crime — 15-year waiting period from sentence completion. Eligible after ${fmt(eligDate)}.`,
          eligibleDate: eligDate.toISOString(),
        };
      }
    }

    case "guilty_pardon": {
      return {
        status: "needs_review",
        form: "072B",
        fee: "$30",
        reason:
          "Governor's Pardon — eligible if the defendant received a full and unconditional pardon from the Governor. " +
          "The petition must be filed within 10 years of the Governor signing the pardon. " +
          "Attorney should verify pardon details before filing. Form CC-DC-CR-072B. Filing fee: $30.",
      };
    }

    // ── Statute-driven guilty catch-all ────────────────────────────────────
    //
    // When the caller passes dispositionType = "guilty" (without a subcategory)
    // and provides a statuteCode or chargeDescription, we attempt to resolve
    // the correct wait period automatically.
    case "guilty": {
      const offense = (statuteCode || chargeDescription)
        ? lookupStatute(statuteCode ?? "", chargeDescription ?? "")
        : null;

      if (!offense) {
        return {
          status: "needs_review",
          form: "072B",
          fee: "$30",
          reason:
            "Guilty disposition — could not determine the specific offense from the provided statute or description. " +
            "Attorney review is required to confirm whether this offense appears on the § 10-110 eligible list " +
            "and to identify the correct waiting period." +
            reform2025Note,
        };
      }

      // Nuisance crime special path
      if (offense.isNuisance) {
        if (sentenceCompleted !== "yes") {
          return {
            status: "needs_review",
            form: "072A",
            fee: "$0",
            reason: `Guilty (nuisance crime — ${offense.description}, CP § 10-105(a)(9)) — sentence must be completed before filing. 3-year waiting period applies from conviction.`,
          };
        }
        if (elapsed >= 3) {
          return {
            status: "eligible",
            form: "072A",
            fee: "$0",
            reason:
              `Guilty (nuisance crime — ${offense.description}, CP § 10-105(a)(9)) — 3+ years since conviction. ` +
              `Eligible for expungement using Form CC-DC-CR-072A. No filing fee.` +
              reform2025Note,
          };
        } else {
          const eligDate = addYears(dispDate, 3);
          return {
            status: "not_eligible",
            form: null,
            fee: "N/A",
            reason: `Guilty (nuisance crime — ${offense.description}) — 3-year waiting period from conviction. Eligible after ${fmt(eligDate)}.`,
            eligibleDate: eligDate.toISOString(),
          };
        }
      }

      // Cannabis possession special path (4yr, 072B/072D)
      if (offense.isCannabis && offense.waitYears === 4) {
        if (sentenceCompleted !== "yes") {
          return {
            status: "needs_review",
            form: "072B",
            fee: "$30",
            reason: `Guilty (cannabis possession, ${offense.statute}) — sentence must be completed before filing. 4-year waiting period applies.`,
          };
        }
        const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
        const base = laterDate(dispDate, compDate);
        const eligDate = addYears(base, 4);
        if (today >= eligDate) {
          return {
            status: "eligible",
            form: "072B",
            fee: "$30",
            reason:
              `Guilty (cannabis possession, ${offense.statute}) — 4+ years since conviction/sentence completion. ` +
              `Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30.`,
          };
        } else {
          return {
            status: "not_eligible",
            form: null,
            fee: "N/A",
            reason: `Guilty (cannabis possession) — 4-year waiting period. Eligible after ${fmt(eligDate)}.`,
            eligibleDate: eligDate.toISOString(),
          };
        }
      }

      // Cannabis PWID special path (3yr)
      if (offense.isCannabis && offense.waitYears === 3) {
        if (sentenceCompleted !== "yes") {
          return {
            status: "needs_review",
            form: "072B",
            fee: "$30",
            reason: `Guilty (cannabis PWID, ${offense.statute}) — sentence must be completed. 3-year waiting period per § 10-110(c)(5).`,
          };
        }
        const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
        const base = laterDate(dispDate, compDate);
        const eligDate = addYears(base, 3);
        if (today >= eligDate) {
          return {
            status: "eligible",
            form: "072B",
            fee: "$30",
            reason:
              `Guilty (cannabis PWID, ${offense.statute}) — 3+ years since sentence completion. ` +
              `Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30. ` +
              `Wait period: 3 years per CP § 10-110(c)(5).` +
              reform2025Note,
          };
        } else {
          return {
            status: "not_eligible",
            form: null,
            fee: "N/A",
            reason: `Guilty (cannabis PWID) — 3-year wait per § 10-110(c)(5). Eligible after ${fmt(eligDate)}.`,
            eligibleDate: eligDate.toISOString(),
          };
        }
      }

      // General path: use offense.waitYears
      if (sentenceCompleted !== "yes") {
        return {
          status: "needs_review",
          form: "072B",
          fee: "$30",
          reason:
            `Guilty (${offense.description}, ${offense.statute}) — sentence must be fully completed ` +
            `before the ${offense.waitYears}-year waiting period begins.` +
            (offense.new2025 ? " [Added by 2025 Reform Act]" : "") +
            reform2025Note,
        };
      }

      const compDate = sentenceCompletionDate ? new Date(sentenceCompletionDate) : dispDate;
      const eligDate = addYears(compDate, offense.waitYears);
      const new2025Note = offense.new2025 ? " [Added by 2025 Reform Act]" : "";
      const domesticNote = offense.domestic
        ? " NOTE: 15-year wait applies if classified as domestically related (CP § 6-233)."
        : "";

      if (today >= eligDate) {
        return {
          status: "eligible",
          form: "072B",
          fee: "$30",
          reason:
            `Guilty (${offense.description}, ${offense.statute}) — ${offense.waitYears}+ years since sentence completion. ` +
            `Eligible for expungement using Form CC-DC-CR-072B. Filing fee: $30.` +
            new2025Note + domesticNote + reform2025Note,
        };
      } else {
        return {
          status: "not_eligible",
          form: null,
          fee: "N/A",
          reason:
            `Guilty (${offense.description}, ${offense.statute}) — ${offense.waitYears}-year waiting period from sentence completion.` +
            new2025Note + domesticNote +
            ` Eligible after ${fmt(eligDate)}.`,
          eligibleDate: eligDate.toISOString(),
        };
      }
    }

    // ── Compromise ───────────────────────────────────────────────────────────

    case "compromise": {
      if (elapsed >= 3) {
        return {
          status: "eligible",
          form: "072A",
          fee: "$0",
          reason:
            "Compromise/Dismissal (CL § 3-207) — 3+ years have passed since disposition. " +
            "Eligible for expungement using Form CC-DC-CR-072A. No filing fee.",
        };
      } else {
        const eligDate = addYears(dispDate, 3);
        return {
          status: "not_eligible",
          form: null,
          fee: "N/A",
          reason: `Compromise — must wait 3 years from disposition. Eligible after ${fmt(eligDate)}.`,
          eligibleDate: eligDate.toISOString(),
        };
      }
    }

    default:
      return {
        status: "needs_review",
        form: null,
        fee: "N/A",
        reason: "Unknown disposition type. Attorney review required.",
      };
  }
}
