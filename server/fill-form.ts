import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";
import type { ExpungementCase } from "@shared/schema";

const FORMS_DIR = path.join(process.cwd(), "server", "forms");

// Firm details — pre-filled on every petition
const FIRM_NAME = "Innovate Legal Group";
const ATTORNEY_NAME = "Nirav Babu, Esq.";
const ATTORNEY_SIGNATURE = "/s/ Nirav Babu";
const ATTORNEY_NUMBER = "0606130009";
const FIRM_ADDRESS = "3030 Greenmount Ave, Suite 320";
const FIRM_CITY_STATE_ZIP = "Baltimore, MD 21218";
const ATTORNEY_PHONE = "301-971-4880";
const ATTORNEY_EMAIL = "nirav@innovatelegalgroup.com";

// Maryland Court Directory — all 24 jurisdictions (23 counties + Baltimore City)
const COURT_DIRECTORY: Record<string, { district: { address: string; phone: string }; circuit: { address: string; phone: string } }> = {
  "Allegany": {
    district: { address: "3 Pershing St, 2nd Floor, Cumberland, MD 21502", phone: "301-722-0600" },
    circuit: { address: "30 Washington St, Cumberland, MD 21502", phone: "301-777-5922" },
  },
  "Anne Arundel": {
    district: { address: "251 Rowe Blvd, Annapolis, MD 21401", phone: "410-260-1370" },
    circuit: { address: "8 Church Circle, Annapolis, MD 21401", phone: "410-222-1397" },
  },
  "Baltimore City": {
    district: { address: "5800 Wabash Ave, Baltimore, MD 21215", phone: "410-878-8000" },
    circuit: { address: "111 N Calvert St, Baltimore, MD 21202", phone: "410-333-3722" },
  },
  "Baltimore County": {
    district: { address: "120 E Chesapeake Ave, Towson, MD 21286", phone: "410-512-2000" },
    circuit: { address: "401 Bosley Ave, Towson, MD 21204", phone: "410-887-2601" },
  },
  "Calvert": {
    district: { address: "200 Duke St, Prince Frederick, MD 20678", phone: "410-535-1600" },
    circuit: { address: "175 Main St, Prince Frederick, MD 20678", phone: "410-535-1600" },
  },
  "Caroline": {
    district: { address: "207 S Third St, Denton, MD 21629", phone: "410-819-4075" },
    circuit: { address: "109 Market St, Denton, MD 21629", phone: "410-479-1811" },
  },
  "Carroll": {
    district: { address: "101 N Court St, Westminster, MD 21157", phone: "410-871-3820" },
    circuit: { address: "55 N Court St, Westminster, MD 21157", phone: "410-386-2020" },
  },
  "Cecil": {
    district: { address: "170 E Main St, Elkton, MD 21921", phone: "410-996-1022" },
    circuit: { address: "129 E Main St, Elkton, MD 21921", phone: "410-996-5370" },
  },
  "Charles": {
    district: { address: "200 Charles St, La Plata, MD 20646", phone: "301-638-4300" },
    circuit: { address: "200 Charles St, La Plata, MD 20646", phone: "301-932-3202" },
  },
  "Dorchester": {
    district: { address: "310 Gay St, Cambridge, MD 21613", phone: "410-901-1460" },
    circuit: { address: "206 High St, Cambridge, MD 21613", phone: "410-228-0481" },
  },
  "Frederick": {
    district: { address: "100 W Patrick St, Frederick, MD 21701", phone: "301-600-1995" },
    circuit: { address: "100 W Patrick St, Frederick, MD 21701", phone: "301-600-1976" },
  },
  "Garrett": {
    district: { address: "205 S Third St, Oakland, MD 21550", phone: "301-334-8198" },
    circuit: { address: "203 S Fourth St, Room 209, Oakland, MD 21550", phone: "301-334-1937" },
  },
  "Harford": {
    district: { address: "2 S Bond St, Bel Air, MD 21014", phone: "410-836-4545" },
    circuit: { address: "20 W Courtland St, Bel Air, MD 21014", phone: "410-638-3426" },
  },
  "Howard": {
    district: { address: "3451 Courthouse Dr, Ellicott City, MD 21043", phone: "410-480-7700" },
    circuit: { address: "8360 Court Ave, Ellicott City, MD 21043", phone: "410-313-2111" },
  },
  "Kent": {
    district: { address: "103 N Cross St, Chestertown, MD 21620", phone: "410-810-2242" },
    circuit: { address: "103 N Cross St, Chestertown, MD 21620", phone: "410-778-7460" },
  },
  "Montgomery": {
    district: { address: "27 Courthouse Square, Rockville, MD 20850", phone: "301-563-8500" },
    circuit: { address: "50 Maryland Ave, Rockville, MD 20850", phone: "240-777-9400" },
  },
  "Prince George's": {
    district: { address: "14735 Main St, Suite 173B, Upper Marlboro, MD 20772", phone: "301-952-4080" },
    circuit: { address: "14735 Main St, Upper Marlboro, MD 20772", phone: "301-952-3318" },
  },
  "Queen Anne's": {
    district: { address: "120 Broadway, Centreville, MD 21617", phone: "410-819-4075" },
    circuit: { address: "100 Courthouse Square, Centreville, MD 21617", phone: "410-758-1773" },
  },
  "St. Mary's": {
    district: { address: "23110 Leonard Hall Dr, Leonardtown, MD 20650", phone: "301-475-4567" },
    circuit: { address: "41605 Courthouse Dr, Leonardtown, MD 20650", phone: "301-475-7844" },
  },
  "Somerset": {
    district: { address: "12155 Elm St, Suite C, Princess Anne, MD 21853", phone: "410-713-3550" },
    circuit: { address: "30512 Prince William St, Princess Anne, MD 21853", phone: "410-845-4840" },
  },
  "Talbot": {
    district: { address: "108 W Dover St, Easton, MD 21601", phone: "410-819-4075" },
    circuit: { address: "11 N Washington St, Easton, MD 21601", phone: "410-822-2611" },
  },
  "Washington": {
    district: { address: "36 W Antietam St, Hagerstown, MD 21740", phone: "301-791-3086" },
    circuit: { address: "95 W Washington St, Hagerstown, MD 21740", phone: "301-733-8660" },
  },
  "Wicomico": {
    district: { address: "201 Baptist St, Salisbury, MD 21801", phone: "410-713-3550" },
    circuit: { address: "101 N Division St, Salisbury, MD 21801", phone: "410-543-6551" },
  },
  "Worcester": {
    district: { address: "301 Commerce St, Snow Hill, MD 21863", phone: "410-632-5630" },
    circuit: { address: "1 W Market St, Room 104, Snow Hill, MD 21863", phone: "410-632-5500" },
  },
};

function getCourtInfo(county: string | null | undefined, courtType: string | null | undefined): { address: string; phone: string } {
  if (!county) return { address: "", phone: "" };
  const entry = COURT_DIRECTORY[county];
  if (!entry) return { address: "", phone: "" };
  return courtType?.toLowerCase() === "circuit" ? entry.circuit : entry.district;
}

function todayDate(): string {
  return new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

/** Fill court header fields (address, phone) based on county */
function fillCourtHeader(form: any, county: string | null | undefined, courtType: string | null | undefined, incidentLocation?: string | null) {
  const court = getCourtInfo(county, courtType);
  const trySet = (name: string, val: string) => { try { form.getTextField(name).setText(val); } catch {} };
  
  // "Located at" = the physical street address of the court from the directory
  const courtAddr = court.address || "";
  if (courtAddr) {
    trySet("Located at", courtAddr);
    trySet("Court Address", courtAddr);
    trySet("Court's Address", courtAddr);
  }
  if (court.phone) {
    trySet("Court's Telephone Number", court.phone);
    trySet("Court Telephone", court.phone);
  }
}

/** Fill attorney block on any form — tries every known field name variant */
function fillAttorneyBlock(form: any) {
  const trySet = (name: string, val: string) => { try { form.getTextField(name).setText(val); } catch {} };
  
  // Signature line
  trySet("Signature of Attorney", ATTORNEY_SIGNATURE);
  trySet("Attorney Signature", ATTORNEY_SIGNATURE);
  trySet("Signature", ATTORNEY_SIGNATURE);
  trySet("Text28", ATTORNEY_SIGNATURE);  // 072B signature field
  
  // Attorney number
  trySet("Attorney Number", ATTORNEY_NUMBER);
  trySet("Attorney No", ATTORNEY_NUMBER);
  trySet("Atty Number", ATTORNEY_NUMBER);
  trySet("CPF ID No", ATTORNEY_NUMBER);  // 072B attorney number field
  
  // Date (today's date)
  trySet("Date", todayDate());
  trySet("Attorney Date", todayDate());
  trySet("Date Attorney Signed", todayDate());
  trySet("Date_2", todayDate());
  trySet("Date_3", todayDate());  // 072B/072C attorney date field
  trySet("Date_1", todayDate());  // 072D attorney date field
  
  // Printed name
  trySet("Printed Name", ATTORNEY_NAME);
  trySet("Attorney Printed Name", ATTORNEY_NAME);
  trySet("Printed Name of Attorney", ATTORNEY_NAME);
  trySet("Attorney Name", ATTORNEY_NAME);
  
  // Firm
  trySet("Firm", FIRM_NAME);
  trySet("Attorney Firm", FIRM_NAME);
  trySet("Law Firm", FIRM_NAME);
  
  // Address
  trySet("Address", FIRM_ADDRESS);
  trySet("Attorney Address", FIRM_ADDRESS);
  trySet("Address_1", FIRM_ADDRESS);
  
  // City State Zip
  trySet("City, State, Zip", FIRM_CITY_STATE_ZIP);
  trySet("Attorney City, State, Zip", FIRM_CITY_STATE_ZIP);
  trySet("City State Zip", FIRM_CITY_STATE_ZIP);
  trySet("City, State, Zip_1", FIRM_CITY_STATE_ZIP);
  
  // Phone
  trySet("Telephone", ATTORNEY_PHONE);
  trySet("Attorney Telephone", ATTORNEY_PHONE);
  trySet("Telephone Number", ATTORNEY_PHONE);
  trySet("Telephone_1", ATTORNEY_PHONE);
  trySet("Phone", ATTORNEY_PHONE);
  
  // Email
  trySet("E-mail", ATTORNEY_EMAIL);
  trySet("Attorney E-mail", ATTORNEY_EMAIL);
  trySet("Email", ATTORNEY_EMAIL);
  trySet("Attorney Email", ATTORNEY_EMAIL);
  trySet("E-mail_1", ATTORNEY_EMAIL);
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  // If already MM/DD/YYYY, return as-is
  if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) return dateStr;
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return dateStr || "";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

/** Convert "LAST, FIRST MIDDLE" to "First Middle Last" */
function fmtDefendantName(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = name.trim();
  // Check if name is in "LAST, FIRST MIDDLE" format
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map(s => s.trim());
    const lastName = parts[0];
    const firstMiddle = parts.slice(1).join(" ").trim();
    if (firstMiddle && lastName) {
      // Title case each part
      const titleCase = (s: string) => s.split(/\s+/).map(w => 
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      ).join(" ");
      return `${titleCase(firstMiddle)} ${titleCase(lastName)}`;
    }
  }
  return trimmed;
}

/** Format DOB as MM/DD/YYYY */
function fmtDOB(dob: string | null | undefined): string {
  if (!dob) return "";
  // If already MM/DD/YYYY
  if (dob.match(/^\d{2}\/\d{2}\/\d{4}$/)) return dob;
  // Convert YYYY-MM-DD
  const d = new Date(dob + "T12:00:00");
  if (isNaN(d.getTime())) return dob;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function cityStateZip(city?: string | null, state?: string | null, zip?: string | null): string {
  const parts = [city, state, zip].filter(Boolean);
  if (city && state) return `${city}, ${state} ${zip || ""}`.trim();
  return parts.join(" ");
}

async function fill072A(c: ExpungementCase): Promise<Uint8Array> {
  const pdfBytes = fs.readFileSync(path.join(FORMS_DIR, "072A.pdf"));
  const pdf = await PDFDocument.load(pdfBytes);
  const form = pdf.getForm();

  const set = (name: string, val: string) => { try { form.getTextField(name).setText(val); } catch {} };
  const check = (name: string) => { try { form.getCheckBox(name).check(); } catch {} };

  // Court type
  if (c.courtType === "Circuit") check("Circuit Court");
  if (c.courtType === "District") check("District Court");

  // Dropdown for county
  try { form.getDropdown("Court's City/County").select(c.county || ""); } catch {}

  set("Case Number", c.caseNumber || "");
  set("Defendant's Name", fmtDefendantName(c.defendantName));
  set("Defendant's Date of Birth", fmtDOB(c.defendantDOB));
  set("Date Arrested or Served", fmtDate(c.dispositionDate));
  set("Law Enforcement Agency", c.lawEnforcementAgency || "");
  set("City/County", c.county || "");
  set("List the Incident", c.incidentDescription || "");
  set("List the Offense you were charged with", c.offenseDescription || "");
  set("Date the charge was Disposed of", fmtDate(c.dispositionDate));

  // Arrest type
  if (c.arrestType === "arrested") check("Arrested");
  if (c.arrestType === "summons") check("Served with a Summons");
  if (c.arrestType === "citation") check("Served with a Citation by an Officer");

  // Disposition checkboxes
  switch (c.dispositionType) {
    case "acquittal": check("I was Acquitted/found not guilty of the charge"); break;
    case "dismissal": check("The charge was otherwise dismissed"); break;
    case "pbj_no_longer_crime": check("A Probation before Judgment was entered on the charge but the conduct on which the charge was based is no longer a crime"); break;
    case "pbj": check("A Probation before Judgment was entered on the charge and the conduct on which the charge was based is still a crime. Either three years have passed or I have been discharged from probation, whichever is later"); break;
    case "pbj_dui": check("A Probation before Judgment was entered on the violation and it has been fifteen years since being discharged from probation and more"); break;
    case "nolle_prosequi": check("Nolle Prosequi was entered"); break;
    case "stet": check("A Stet was entered"); break;
    case "not_criminally_responsible": check("I was found not criminally responsible"); break;
    case "compromise": check("The case was compromised or dismissed"); break;
    case "guilty_nuisance": check("I was Acquitted/found not guilty of the charge"); break; // nuisance uses 072A
  }

  // Defendant info
  set("Defendant Printed Name", fmtDefendantName(c.defendantName));
  set("Defendant Address", c.defendantAddress || "");
  set("Defendant City, State, Zip", cityStateZip(c.defendantCity, c.defendantState, c.defendantZip));
  set("Defendant Telephone Number", c.defendantPhone || "");
  set("Defendant E-mail", c.defendantEmail || "");

  // Attorney block
  fillCourtHeader(form, c.county, c.courtType, c.incidentLocation);
  fillAttorneyBlock(form);

  form.flatten();
  return await pdf.save();
}

async function fill072B(c: ExpungementCase): Promise<Uint8Array> {
  const pdfBytes = fs.readFileSync(path.join(FORMS_DIR, "072B.pdf"));
  const pdf = await PDFDocument.load(pdfBytes);
  const form = pdf.getForm();

  const set = (name: string, val: string) => { try { form.getTextField(name).setText(val); } catch {} };
  const check = (name: string) => { try { form.getCheckBox(name).check(); } catch {} };

  // Log all field names on first use to help diagnose missing fields (check Railway logs)
  if (process.env.DEBUG_PDF_FIELDS === "true") {
    const fields = form.getFields();
    console.log("[072B PDF fields]", fields.map((f: any) => `${f.constructor.name}: "${f.getName()}"`));
  }

  // Court type — try multiple checkbox name variants since PDF field names can vary
  if (c.courtType === "Circuit") {
    check("Check Box32"); check("Circuit Court"); check("Circuit"); check("CB_Circuit");
    check("Check Box1"); check("CheckBox1"); check("court_circuit");
  }
  if (c.courtType === "District") {
    check("Check Box33"); check("District Court"); check("District"); check("CB_District");
    check("Check Box2"); check("CheckBox2"); check("court_district");
  }

  try { form.getDropdown("Court's City/County").select(c.county || ""); } catch {}

  set("Case No", c.caseNumber || "");
  set("Text24", fmtDefendantName(c.defendantName)); // Defendant name
  set("Text25", fmtDOB(c.defendantDOB)); // DOB
  set("Text30", fmtDate(c.dispositionDate)); // Date arrested/served
  set("Law Enforcement Agency", c.lawEnforcementAgency || "");

  set("Maryland as a result of the following incident", c.incidentDescription || "");
  set("2 I was charged with the offense of", c.offenseDescription || "");
  set("I was convicted found guilty of check all that apply making sure that the statement is true and", fmtDate(c.dispositionDate));

  // Arrest type
  if (c.arrestType === "arrested") check("Check Box36");
  if (c.arrestType === "summons") check("Check Box37");
  if (c.arrestType === "citation") check("Check Box38");

  // Guilty disposition checkboxes
  switch (c.dispositionType) {
    case "guilty_no_longer_crime": check("the charge but the conduct on which the charge is based is no longer a crime"); break;
    case "guilty_nuisance": check("a crime specified in Criminal Procedure Article  10105a9 Three 3 years have passed since the later of the conviction or"); break;
    case "guilty_misdemeanor": check("a misdemeanor crime specified in Criminal Procedure Article  10110 Ten years have passed since the satisfactory completion of"); break;
    case "guilty_felony": check("a felony crime specified in Criminal Procedure Article  10110 Fifteen years have passed since the satisfactory completion of the"); break;
    case "guilty_domestic": check("a crime specified in Criminal Law Article  3203 common law battery or for an offense classified as a domestically related crime"); break;
    case "guilty_burglary_theft": check("Check Box1"); break;
    case "guilty_pardon": check("one criminal act which is not a crime of violence as defined in Criminal Law Article  14101a and on or about"); break;
  }

  // Defendant info
  set("Printed Name_2", fmtDefendantName(c.defendantName));
  set("Address_2", c.defendantAddress || "");
  set("City State Zip_2", cityStateZip(c.defendantCity, c.defendantState, c.defendantZip));
  set("Telephone_2", c.defendantPhone || "");
  set("Email_2", c.defendantEmail || "");

  // Attorney block + court header (sets court address)
  fillCourtHeader(form, c.county, c.courtType, c.incidentLocation);
  fillAttorneyBlock(form);

  // "at _____, Maryland" — incident location (city/county where arrest occurred)
  // Set AFTER fillCourtHeader so we override any conflicting field it may have set.
  // Try all plausible PDF field name variants for the 072B form.
  const incLoc = c.incidentLocation || c.county || "";
  set("Text31", incLoc);
  set("Text32", incLoc);
  set("at", incLoc);
  set("at 1", incLoc);
  set("Located at", incLoc);
  set("Incident Location", incLoc);
  set("City County of Incident", incLoc);
  set("City/County of Incident", incLoc);
  set("location", incLoc);
  set("Location", incLoc);

  form.flatten();
  return await pdf.save();
}

async function fill072C(c: ExpungementCase): Promise<Uint8Array> {
  const pdfBytes = fs.readFileSync(path.join(FORMS_DIR, "072C.pdf"));
  const pdf = await PDFDocument.load(pdfBytes);
  const form = pdf.getForm();

  const set = (name: string, val: string) => { try { form.getTextField(name).setText(val); } catch {} };
  const check = (name: string) => { try { form.getCheckBox(name).check(); } catch {} };

  // Court type
  if (c.courtType === "Circuit") check("Circuit Court");
  if (c.courtType === "District") check("District Court");

  try { form.getDropdown("Court's City/County").select(c.county || ""); } catch {}

  set("Case No", c.caseNumber || "");
  set("Defendant Name", fmtDefendantName(c.defendantName));
  set("Date of Birth", fmtDOB(c.defendantDOB));
  set("Date", fmtDate(c.dispositionDate)); // Date arrested/served
  set("Law Enforcement Agency", c.lawEnforcementAgency || "");
  set("City/County of Law Enforcement Agency", c.county || "");
  set("as the result of the following incident", c.incidentDescription || "");
  set("charged with the offense of", c.offenseDescription || "");
  set("Date charge was disposed", fmtDate(c.dispositionDate));

  // Arrest type
  if (c.arrestType === "arrested") check("arrested");
  if (c.arrestType === "summons") check("served with a summons");
  if (c.arrestType === "citation") check("served with citation");

  // Disposition
  switch (c.dispositionType) {
    case "acquittal": check("acquitted"); break;
    case "dismissal": check("the charges was otherwise dismissed"); break;
    case "nolle_prosequi": check("nolle prosequi"); break;
  }

  // Defendant info
  set("Printed Name of Defendant", fmtDefendantName(c.defendantName));
  set("Defendant Address", c.defendantAddress || "");
  set("City State Zip_2", cityStateZip(c.defendantCity, c.defendantState, c.defendantZip));
  set("Defendant Telephone", c.defendantPhone || "");
  set("Defendant Email Address", c.defendantEmail || "");

  // General Waiver section (built into 072C)
  set("Name of Person Signing Waiver", fmtDefendantName(c.defendantName));
  set("Law Enforcement Agency Name", c.lawEnforcementAgency || "");
  set("date of arrest, detention or confinement", fmtDate(c.dispositionDate));

  // Attorney block
  fillCourtHeader(form, c.county, c.courtType, c.incidentLocation);
  fillAttorneyBlock(form);

  form.flatten();
  return await pdf.save();
}

async function fill072D(c: ExpungementCase): Promise<Uint8Array> {
  const pdfBytes = fs.readFileSync(path.join(FORMS_DIR, "072D.pdf"));
  const pdf = await PDFDocument.load(pdfBytes);
  const form = pdf.getForm();

  const set = (name: string, val: string) => { try { form.getTextField(name).setText(val); } catch {} };
  const check = (name: string) => { try { form.getCheckBox(name).check(); } catch {} };

  if (c.courtType === "Circuit") check("Circuit Court");
  if (c.courtType === "District") check("District court");

  try { form.getDropdown("Court's City/County").select(c.county || ""); } catch {}

  set("Case Number", c.caseNumber || "");
  set("Defendant Name", fmtDefendantName(c.defendantName));
  set("DOB", fmtDOB(c.defendantDOB));
  set("Date", fmtDate(c.dispositionDate));
  set("law enforcement agency", c.lawEnforcementAgency || "");
  set("City/County", c.county || "");
  set("as a result of the following incident", c.incidentDescription || "");

  if (c.arrestType === "arrested") check("Arrested");
  if (c.arrestType === "summons") check("served with summons");
  if (c.arrestType === "citation") check("served with citation");

  // Cannabis-specific checkboxes
  if (c.dispositionType === "guilty_cannabis") {
    check("possession of cannabis");
  }

  set("Printed Name of Defendant", fmtDefendantName(c.defendantName));
  set("Address of Defendant", c.defendantAddress || "");
  set("City, State, Zip_1", cityStateZip(c.defendantCity, c.defendantState, c.defendantZip));
  set("Defendant Telephone No", c.defendantPhone || "");
  set("Defendant Email Address", c.defendantEmail || "");

  // Attorney block
  fillCourtHeader(form, c.county, c.courtType, c.incidentLocation);
  fillAttorneyBlock(form);

  form.flatten();
  return await pdf.save();
}

async function fill078(c: ExpungementCase): Promise<Uint8Array> {
  const pdfBytes = fs.readFileSync(path.join(FORMS_DIR, "078.pdf"));
  const pdf = await PDFDocument.load(pdfBytes);
  const form = pdf.getForm();

  const set = (name: string, val: string) => { try { form.getTextField(name).setText(val); } catch {} };
  const check = (name: string) => { try { form.getCheckBox(name).check(); } catch {} };

  if (c.courtType === "Circuit") check("Circuit Court");
  if (c.courtType === "District") check("District Court");

  try { form.getDropdown("Court's City/County").select(c.county || ""); } catch {}

  set("Case No", c.caseNumber || "");
  set("Defendant name", fmtDefendantName(c.defendantName));
  set("Defendant Address", c.defendantAddress || "");
  set("City, State, Zip", cityStateZip(c.defendantCity, c.defendantState, c.defendantZip));
  set("Defendant Home Telephone", c.defendantPhone || "");
  set("Name Of Petitioner", fmtDefendantName(c.defendantName));
  set("Law Enforcement Agency", c.lawEnforcementAgency || "");
  set("Date of arrest, detention or confinement", fmtDate(c.dispositionDate));

  // Attorney block
  fillCourtHeader(form, c.county, c.courtType, c.incidentLocation);
  fillAttorneyBlock(form);

  form.flatten();
  return await pdf.save();
}

export async function fillForm(c: ExpungementCase, formType: string): Promise<Uint8Array> {
  switch (formType) {
    case "072A": return fill072A(c);
    case "072B": return fill072B(c);
    case "072C": return fill072C(c);
    case "072D": return fill072D(c);
    case "078": return fill078(c);
    default: throw new Error(`Unknown form type: ${formType}`);
  }
}
