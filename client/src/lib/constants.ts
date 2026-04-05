export const MD_COUNTIES = [
  "Allegany", "Anne Arundel", "Baltimore City", "Baltimore County",
  "Calvert", "Caroline", "Carroll", "Cecil", "Charles",
  "Dorchester", "Frederick", "Garrett", "Harford", "Howard",
  "Kent", "Montgomery", "Prince George's", "Queen Anne's",
  "St. Mary's", "Somerset", "Talbot", "Washington",
  "Wicomico", "Worcester",
];

export const DISPOSITION_OPTIONS = [
  { value: "acquittal", label: "Acquittal / Not Guilty" },
  { value: "dismissal", label: "Dismissal" },
  { value: "nolle_prosequi", label: "Nolle Prosequi" },
  { value: "stet", label: "Stet" },
  { value: "pbj_no_longer_crime", label: "PBJ — conduct no longer a crime" },
  { value: "pbj", label: "PBJ — conduct still a crime" },
  { value: "pbj_dui", label: "PBJ — DUI/DWI (Transportation § 21-902)" },
  { value: "not_criminally_responsible", label: "Not Criminally Responsible" },
  { value: "guilty_no_longer_crime", label: "Guilty — conduct no longer a crime" },
  { value: "guilty_nuisance", label: "Guilty — nuisance crime" },
  { value: "guilty_cannabis", label: "Guilty — cannabis possession (CL § 5-601)" },
  { value: "guilty_misdemeanor", label: "Guilty — eligible misdemeanor (§ 10-110)" },
  { value: "guilty_felony", label: "Guilty — eligible felony / assault 2nd / battery" },
  { value: "guilty_burglary_theft", label: "Guilty — burglary 1st/2nd or felony theft" },
  { value: "guilty_domestic", label: "Guilty — domestically related crime" },
  { value: "guilty_pardon", label: "Guilty — Governor's pardon" },
  { value: "compromise", label: "Compromise / dismissed (CL § 3-207)" },
];

export const STATUS_LABELS: Record<string, string> = {
  intake: "Intake",
  screening: "Screening",
  eligible: "Eligible",
  petition_drafted: "Petition Drafted",
  filed: "Filed",
  complete: "Complete",
  pending: "Pending",
};

export const ELIGIBILITY_LABELS: Record<string, string> = {
  eligible: "Eligible",
  not_eligible: "Not Eligible",
  needs_review: "Needs Review",
  pending: "Pending",
};
