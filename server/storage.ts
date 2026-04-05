import { expungementCases, type ExpungementCase, type InsertCase } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";

const sqlite = new Database("data.db");
const db = drizzle(sqlite);

export interface IStorage {
  getAllCases(): ExpungementCase[];
  getCaseById(id: number): ExpungementCase | undefined;
  createCase(data: InsertCase): ExpungementCase;
  updateCase(id: number, data: Partial<InsertCase>): ExpungementCase | undefined;
  deleteCase(id: number): boolean;
  getCaseStats(): { total: number; eligible: number; needsReview: number; filed: number; drafted: number };
}

export class DatabaseStorage implements IStorage {
  constructor() {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS expungement_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_number TEXT NOT NULL,
        court_type TEXT,
        county TEXT,
        defendant_name TEXT NOT NULL,
        defendant_dob TEXT,
        defendant_address TEXT,
        defendant_city TEXT,
        defendant_state TEXT DEFAULT 'MD',
        defendant_zip TEXT,
        defendant_phone TEXT,
        defendant_email TEXT,
        disposition_type TEXT,
        disposition_date TEXT,
        offense_description TEXT,
        law_enforcement_agency TEXT,
        incident_location TEXT,
        incident_description TEXT,
        arrest_type TEXT,
        has_pending_cases TEXT,
        sentence_completed TEXT,
        sentence_completion_date TEXT,
        probation_discharged TEXT,
        probation_discharge_date TEXT,
        eligibility_status TEXT DEFAULT 'pending',
        eligibility_notes TEXT,
        selected_form TEXT,
        filing_fee TEXT,
        waiting_period_met TEXT,
        unit_rule_notes TEXT,
        status TEXT DEFAULT 'intake',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  getAllCases(): ExpungementCase[] {
    return db.select().from(expungementCases).all();
  }

  getCaseById(id: number): ExpungementCase | undefined {
    return db.select().from(expungementCases).where(eq(expungementCases.id, id)).get();
  }

  createCase(data: InsertCase): ExpungementCase {
    return db.insert(expungementCases).values(data).returning().get();
  }

  updateCase(id: number, data: Partial<InsertCase>): ExpungementCase | undefined {
    return db.update(expungementCases).set(data).where(eq(expungementCases.id, id)).returning().get();
  }

  deleteCase(id: number): boolean {
    const result = db.delete(expungementCases).where(eq(expungementCases.id, id)).run();
    return result.changes > 0;
  }

  getCaseStats() {
    const all = this.getAllCases();
    return {
      total: all.length,
      eligible: all.filter(c => c.eligibilityStatus === "eligible").length,
      needsReview: all.filter(c => c.eligibilityStatus === "needs_review").length,
      filed: all.filter(c => c.status === "filed").length,
      drafted: all.filter(c => c.status === "petition_drafted").length,
    };
  }
}

export const storage = new DatabaseStorage();
