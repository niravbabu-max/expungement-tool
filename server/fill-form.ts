import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";
import type { ExpungementCase } from "@shared/schema";

const FORMS_DIR = path.join(process.cwd(), "server", "forms");

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return dateStr || "";
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
  set("Defendant's Name", c.defendantName || "");
  set("Defendant's Date of Birth", c.defendantDOB || "");
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
  set("Defendant Printed Name", c.defendantName || "");
  set("Defendant Address", c.defendantAddress || "");
  set("Defendant City, State, Zip", cityStateZip(c.defendantCity, c.defendantState, c.defendantZip));
  set("Defendant Telephone Number", c.defendantPhone || "");
  set("Defendant E-mail", c.defendantEmail || "");

  // Attorney block (leave mostly blank for manual fill)
  set("Attorney Printed Name", "");

  form.flatten();
  return await pdf.save();
}

async function fill072B(c: ExpungementCase): Promise<Uint8Array> {
  const pdfBytes = fs.readFileSync(path.join(FORMS_DIR, "072B.pdf"));
  const pdf = await PDFDocument.load(pdfBytes);
  const form = pdf.getForm();

  const set = (name: string, val: string) => { try { form.getTextField(name).setText(val); } catch {} };
  const check = (name: string) => { try { form.getCheckBox(name).check(); } catch {} };

  // Court type
  if (c.courtType === "Circuit") check("Check Box32");
  if (c.courtType === "District") check("Check Box33");

  try { form.getDropdown("Court's City/County").select(c.county || ""); } catch {}

  set("Case No", c.caseNumber || "");
  set("Text24", c.defendantName || ""); // Defendant name
  set("Text25", c.defendantDOB || ""); // DOB
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
  set("Printed Name_2", c.defendantName || "");
  set("Address_2", c.defendantAddress || "");
  set("City State Zip_2", cityStateZip(c.defendantCity, c.defendantState, c.defendantZip));
  set("Telephone_2", c.defendantPhone || "");
  set("Email_2", c.defendantEmail || "");

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
  set("Defendant Name", c.defendantName || "");
  set("Date of Birth", c.defendantDOB || "");
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
  set("Printed Name of Defendant", c.defendantName || "");
  set("Defendant Address", c.defendantAddress || "");
  set("City State Zip_2", cityStateZip(c.defendantCity, c.defendantState, c.defendantZip));
  set("Defendant Telephone", c.defendantPhone || "");
  set("Defendant Email Address", c.defendantEmail || "");

  // General Waiver section (built into 072C)
  set("Name of Person Signing Waiver", c.defendantName || "");
  set("Law Enforcement Agency Name", c.lawEnforcementAgency || "");
  set("date of arrest, detention or confinement", fmtDate(c.dispositionDate));

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
  set("Defendant Name", c.defendantName || "");
  set("DOB", c.defendantDOB || "");
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

  set("Printed Name of Defendant", c.defendantName || "");
  set("Address of Defendant", c.defendantAddress || "");
  set("City, State, Zip_1", cityStateZip(c.defendantCity, c.defendantState, c.defendantZip));
  set("Defendant Telephone No", c.defendantPhone || "");
  set("Defendant Email Address", c.defendantEmail || "");

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
  set("Defendant name", c.defendantName || "");
  set("Defendant Address", c.defendantAddress || "");
  set("City, State, Zip", cityStateZip(c.defendantCity, c.defendantState, c.defendantZip));
  set("Defendant Home Telephone", c.defendantPhone || "");
  set("Name Of Petitioner", c.defendantName || "");
  set("Law Enforcement Agency", c.lawEnforcementAgency || "");
  set("Date of arrest, detention or confinement", fmtDate(c.dispositionDate));

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
