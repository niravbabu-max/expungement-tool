import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertCaseSchema } from "@shared/schema";
import { fillForm } from "./fill-form";
import { lookupCase } from "./case-search";

const APP_PASSWORD = process.env.APP_PASSWORD || "innovate2026";

export function registerRoutes(server: Server, app: Express) {
  // Auth
  app.post("/api/auth/login", (req, res) => {
    const { password } = req.body;
    if (password === APP_PASSWORD) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  });

  // Get dashboard stats
  app.get("/api/cases/stats", (_req, res) => {
    const stats = storage.getCaseStats();
    res.json(stats);
  });

  // List all cases
  app.get("/api/cases", (_req, res) => {
    const cases = storage.getAllCases();
    res.json(cases);
  });

  // Get single case
  app.get("/api/cases/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const c = storage.getCaseById(id);
    if (!c) return res.status(404).json({ error: "Case not found" });
    res.json(c);
  });

  // Create case
  app.post("/api/cases", (req, res) => {
    try {
      const data = insertCaseSchema.parse(req.body);
      const created = storage.createCase(data);
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Update case
  app.patch("/api/cases/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateCase(id, req.body);
    if (!updated) return res.status(404).json({ error: "Case not found" });
    res.json(updated);
  });

  // Delete case
  app.delete("/api/cases/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const deleted = storage.deleteCase(id);
    if (!deleted) return res.status(404).json({ error: "Case not found" });
    res.json({ success: true });
  });

  // Lookup case on Maryland Case Search
  app.get("/api/lookup/:caseNumber", async (req, res) => {
    const caseNumber = req.params.caseNumber;
    try {
      const result = await lookupCase(caseNumber);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Debug endpoint - returns raw HTML from last lookup
  app.get("/api/debug/last-html", (_req, res) => {
    const fs = require("fs");
    try {
      const html = fs.readFileSync("/tmp/last_case_search.html", "utf-8");
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch {
      res.status(404).json({ error: "No debug HTML saved yet" });
    }
  });

  // Generate filled PDF form
  app.get("/api/cases/:id/form/:formType", async (req, res) => {
    const id = parseInt(req.params.id);
    const formType = req.params.formType;
    const c = storage.getCaseById(id);
    if (!c) return res.status(404).json({ error: "Case not found" });

    try {
      const pdfBytes = await fillForm(c, formType);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Expungement_${formType}_${c.caseNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
}
