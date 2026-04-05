import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const expungementCases = sqliteTable("expungement_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  caseNumber: text("case_number").notNull(),
  courtType: text("court_type"),
  county: text("county"),
  defendantName: text("defendant_name").notNull(),
  defendantDOB: text("defendant_dob"),
  defendantAddress: text("defendant_address"),
  defendantCity: text("defendant_city"),
  defendantState: text("defendant_state").default("MD"),
  defendantZip: text("defendant_zip"),
  defendantPhone: text("defendant_phone"),
  defendantEmail: text("defendant_email"),
  dispositionType: text("disposition_type"),
  dispositionDate: text("disposition_date"),
  offenseDescription: text("offense_description"),
  lawEnforcementAgency: text("law_enforcement_agency"),
  incidentLocation: text("incident_location"),
  incidentDescription: text("incident_description"),
  arrestType: text("arrest_type"),
  hasPendingCases: text("has_pending_cases"),
  sentenceCompleted: text("sentence_completed"),
  sentenceCompletionDate: text("sentence_completion_date"),
  probationDischarged: text("probation_discharged"),
  probationDischargeDate: text("probation_discharge_date"),
  eligibilityStatus: text("eligibility_status").default("pending"),
  eligibilityNotes: text("eligibility_notes"),
  selectedForm: text("selected_form"),
  filingFee: text("filing_fee"),
  waitingPeriodMet: text("waiting_period_met"),
  unitRuleNotes: text("unit_rule_notes"),
  status: text("status").default("intake"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const insertCaseSchema = createInsertSchema(expungementCases).omit({
  id: true,
  createdAt: true,
});

export type InsertCase = z.infer<typeof insertCaseSchema>;
export type ExpungementCase = typeof expungementCases.$inferSelect;
