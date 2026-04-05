import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Zap,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  FileText,
  Folder,
} from "lucide-react";
import { analyzeFullRecord } from "@/lib/record-analysis";
import type { CaseRecord, RecordAnalysisResult, CaseAnalysis, TimelineEvent, FilingStep } from "@/lib/record-analysis";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: CaseAnalysis["overallStatus"] }) {
  switch (status) {
    case "eligible":
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">Eligible</Badge>;
    case "not_eligible":
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0">Not Eligible</Badge>;
    case "blocked_by_other":
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">Blocked by Other Case</Badge>;
    case "auto_expunged":
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0">Auto-Expunged</Badge>;
    case "needs_review":
      return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-0">Needs Review</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Timeline dot colors
// ---------------------------------------------------------------------------
function timelineDotClass(color: TimelineEvent["color"]): string {
  switch (color) {
    case "green": return "bg-emerald-500";
    case "red": return "bg-red-500";
    case "amber": return "bg-amber-500";
    case "blue": return "bg-blue-500";
    case "gray": return "bg-gray-400";
    default: return "bg-gray-400";
  }
}

// ---------------------------------------------------------------------------
// KPI stat card
// ---------------------------------------------------------------------------
function KpiCard({
  label,
  value,
  icon: Icon,
  bgColor,
  textColor,
}: {
  label: string;
  value: number;
  icon: any;
  bgColor: string;
  textColor: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgColor}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function RecordAnalysis() {
  const [, navigate] = useLocation();
  const [caseNumbers, setCaseNumbers] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentCase: "" });
  const [result, setResult] = useState<RecordAnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set());

  // Toggle expanded state for a case card
  function toggleCase(caseNumber: string) {
    setExpandedCases((prev) => {
      const next = new Set(prev);
      if (next.has(caseNumber)) {
        next.delete(caseNumber);
      } else {
        next.add(caseNumber);
      }
      return next;
    });
  }

  // Parse the textarea into individual case numbers
  function parseCaseNumbers(raw: string): string[] {
    return raw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  // Main lookup handler
  async function handleLookupAll() {
    setError("");
    setResult(null);

    const nums = parseCaseNumbers(caseNumbers);
    if (nums.length === 0) {
      setError("Please enter at least one case number.");
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: nums.length, currentCase: "" });

    const cases: CaseRecord[] = [];
    const failures: string[] = [];

    for (let i = 0; i < nums.length; i++) {
      const cn = nums[i];
      setProgress({ current: i + 1, total: nums.length, currentCase: cn });
      try {
        const res = await fetch(`${API_BASE}/api/lookup/${encodeURIComponent(cn)}`);
        if (!res.ok) {
          failures.push(`${cn} (HTTP ${res.status})`);
          continue;
        }
        const data = await res.json();
        cases.push(data as CaseRecord);
      } catch (err) {
        failures.push(`${cn} (network error)`);
      }
    }

    setLoading(false);

    if (cases.length === 0) {
      setError(
        failures.length > 0
          ? `All lookups failed: ${failures.join(", ")}`
          : "No cases were found."
      );
      return;
    }

    if (failures.length > 0) {
      setError(`Warning: Could not look up ${failures.join(", ")}. Analyzing the ${cases.length} case(s) that were found.`);
    }

    const analysisResult = analyzeFullRecord(cases);
    setResult(analysisResult);
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="mt-0.5 text-[#1B2A4A] hover:bg-slate-100"
          onClick={() => navigate("/")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-xl font-bold text-[#1B2A4A]">Full Record Analysis</h1>
          <p className="text-sm text-muted-foreground">
            Analyze a defendant's complete criminal history across multiple cases
          </p>
        </div>
      </div>

      {/* Section 1: Case Number Input */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-[#1B2A4A]">Case Numbers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={caseNumbers}
            onChange={(e) => setCaseNumbers(e.target.value)}
            placeholder={"Enter case numbers, one per line:\n2E00547507\nD-01-CR-22-001234\nC-15-CR-20-000567"}
            className="min-h-[140px] font-mono text-sm resize-y"
            disabled={loading}
            data-testid="textarea-case-numbers"
          />
          <div className="flex items-center gap-3">
            <Button
              className="bg-[#01696F] hover:bg-[#015258] text-white"
              onClick={handleLookupAll}
              disabled={loading || caseNumbers.trim().length === 0}
              data-testid="button-lookup-all"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Look Up All Cases
            </Button>
            {loading && (
              <p className="text-sm text-muted-foreground" data-testid="progress-indicator">
                Looking up case {progress.current} of {progress.total}
                {progress.currentCase ? `: ${progress.currentCase}` : ""}…
              </p>
            )}
          </div>

          {/* Error / warning */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Results */}
      {result && (
        <div className="space-y-6">
          {/* 3a. Summary KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="summary-cards">
            <KpiCard
              label="Total Cases"
              value={result.totalCases}
              icon={Folder}
              bgColor="bg-[#1B2A4A]"
              textColor="text-[#1B2A4A]"
            />
            <KpiCard
              label="Eligible"
              value={result.summary.eligible}
              icon={CheckCircle}
              bgColor="bg-emerald-600"
              textColor="text-emerald-700"
            />
            <KpiCard
              label="Blocked by Other Cases"
              value={result.summary.blocked}
              icon={XCircle}
              bgColor="bg-red-500"
              textColor="text-red-600"
            />
            <KpiCard
              label="Needs Review"
              value={result.summary.needsReview}
              icon={AlertTriangle}
              bgColor="bg-amber-500"
              textColor="text-amber-600"
            />
          </div>

          {/* 3b. Warnings */}
          {result.warnings.length > 0 && (
            <div className="space-y-2" data-testid="warnings-section">
              {result.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* 3c. Filing Plan */}
          {result.filingPlan.length > 0 && (
            <Card data-testid="filing-plan-section">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-[#1B2A4A] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#01696F]" />
                  Recommended Filing Plan
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  File petitions in this order to maximize successful expungements
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.filingPlan.map((step: FilingStep) => {
                  const isDependent = step.dependsOn.length > 0;
                  return (
                    <div
                      key={step.order}
                      className={`flex gap-4 rounded-md p-4 border-l-4 bg-slate-50 ${
                        isDependent ? "border-amber-400" : "border-emerald-500"
                      }`}
                      data-testid={`filing-step-${step.order}`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${
                          isDependent ? "bg-amber-500" : "bg-emerald-600"
                        }`}
                      >
                        {step.order}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-[#1B2A4A] font-mono">
                          {step.caseNumber}
                        </p>
                        <p className="text-sm text-slate-700 mt-0.5">{step.action}</p>
                        <p className="text-xs text-muted-foreground mt-1">{step.reason}</p>
                        {isDependent && (
                          <div className="flex items-center gap-1 mt-2">
                            <ArrowRight className="w-3 h-3 text-amber-500" />
                            <span className="text-xs text-amber-700">
                              Depends on: {step.dependsOn.join(", ")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* 3d. Case-by-Case Analysis */}
          <div className="space-y-4" data-testid="case-analysis-section">
            <h2 className="font-semibold text-[#1B2A4A]">Case-by-Case Analysis</h2>
            {result.cases.map((cas: CaseAnalysis) => {
              const isExpanded = expandedCases.has(cas.caseNumber);
              return (
                <Card key={cas.caseNumber} data-testid={`case-card-${cas.caseNumber}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-bold text-[#1B2A4A] font-mono">{cas.caseNumber}</p>
                        {cas.defendant && (
                          <p className="text-sm text-muted-foreground">{cas.defendant}</p>
                        )}
                        {(cas.county || cas.courtType) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {[cas.courtType, cas.county].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={cas.overallStatus} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Status reason */}
                    <div className="flex items-start gap-2 rounded-md bg-slate-50 border p-3 text-sm text-slate-700">
                      <Info className="w-4 h-4 mt-0.5 shrink-0 text-[#01696F]" />
                      <span>{cas.statusReason || "No status reason provided."}</span>
                    </div>

                    {/* Blocking relationships */}
                    {cas.blockedBy.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
                        <XCircle className="w-4 h-4 shrink-0" />
                        <span>
                          Blocked by:{" "}
                          <span className="font-mono font-semibold">
                            {cas.blockedBy.join(", ")}
                          </span>
                        </span>
                      </div>
                    )}
                    {cas.blocks.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                          This case blocks:{" "}
                          <span className="font-mono font-semibold">
                            {cas.blocks.join(", ")}
                          </span>
                        </span>
                      </div>
                    )}

                    {/* Form & fee */}
                    <div className="flex gap-4 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <FileText className="w-4 h-4" />
                        <span>Form: <span className="font-semibold text-[#1B2A4A]">{cas.recommendedForm}</span></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span>Filing fee: <span className="font-semibold text-[#1B2A4A]">{cas.filingFee}</span></span>
                      </div>
                    </div>

                    {/* Expandable charges section */}
                    {cas.charges.length > 0 && (
                      <div>
                        <button
                          className="flex items-center gap-1.5 text-sm font-medium text-[#01696F] hover:text-[#015258] transition-colors"
                          onClick={() => toggleCase(cas.caseNumber)}
                          data-testid={`toggle-charges-${cas.caseNumber}`}
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                          {isExpanded ? "Hide" : "Show"} {cas.charges.length} charge
                          {cas.charges.length !== 1 ? "s" : ""}
                        </button>

                        {isExpanded && (
                          <div className="mt-3 space-y-2" data-testid={`charges-${cas.caseNumber}`}>
                            {cas.charges.map((ch, idx) => (
                              <div
                                key={idx}
                                className="rounded-md border bg-white p-3 text-sm space-y-1"
                              >
                                <div className="flex items-start justify-between gap-2 flex-wrap">
                                  <p className="font-medium text-[#1B2A4A]">{ch.description}</p>
                                  {ch.isConviction ? (
                                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 shrink-0">
                                      Conviction
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 shrink-0">
                                      Non-Conviction
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                                  {ch.statute && <span>Statute: <span className="font-mono">{ch.statute}</span></span>}
                                  {ch.disposition && <span>Disposition: {ch.disposition}</span>}
                                  {ch.dispositionDate && <span>Date: {ch.dispositionDate}</span>}
                                  {ch.waitYears !== null && ch.waitYears !== undefined && (
                                    <span>Wait: {ch.waitYears}yr</span>
                                  )}
                                  {ch.eligibleDate && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      Eligible: {ch.eligibleDate instanceof Date
                                        ? ch.eligibleDate.toLocaleDateString("en-US")
                                        : String(ch.eligibleDate)}
                                    </span>
                                  )}
                                </div>
                                {ch.isConviction && !ch.isEligibleOffense && !ch.isCannabis && (
                                  <p className="text-xs text-red-600 font-medium">
                                    ⚠ Not on eligible offense list — blocks case expungement
                                  </p>
                                )}
                                {ch.isCannabis && (
                                  <p className="text-xs text-emerald-600 font-medium">
                                    Cannabis charge — special eligibility rules may apply
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* 3e. Timeline */}
          {result.timeline.length > 0 && (
            <Card data-testid="timeline-section">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-[#1B2A4A] flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#01696F]" />
                  Chronological Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative pl-6">
                  {/* Vertical line */}
                  <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-slate-200" />

                  <div className="space-y-4">
                    {result.timeline.map((event: TimelineEvent, idx: number) => (
                      <div
                        key={idx}
                        className="relative"
                        data-testid={`timeline-event-${idx}`}
                      >
                        {/* Dot */}
                        <div
                          className={`absolute -left-[18px] top-1 w-3 h-3 rounded-full border-2 border-white ${timelineDotClass(event.color)}`}
                        />

                        {/* Content */}
                        <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
                          <span className="text-xs text-muted-foreground font-mono whitespace-nowrap min-w-[90px]">
                            {event.dateStr}
                          </span>
                          <div>
                            <span className="font-mono text-xs font-semibold text-[#1B2A4A] mr-2">
                              {event.caseNumber}
                            </span>
                            <span className={`text-sm ${event.color === "red" ? "text-red-700" : event.color === "green" ? "text-emerald-700" : "text-slate-600"}`}>
                              {event.description}
                            </span>
                            {event.type === "blocking" && (
                              <Badge className="ml-2 bg-red-100 text-red-700 hover:bg-red-100 border-0 text-xs">
                                BLOCKING
                              </Badge>
                            )}
                            {event.type === "eligible_date" && (
                              <Badge className="ml-2 bg-gray-100 text-gray-600 hover:bg-gray-100 border-0 text-xs">
                                Eligible Date
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
