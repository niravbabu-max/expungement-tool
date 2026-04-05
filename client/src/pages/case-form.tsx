import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { analyzeEligibility, analyzeUnit, checkAutoExpungement, lookupStatute, type EligibilityResult } from "@/lib/eligibility";
import type { UnitRuleResult } from "@/lib/eligibility";
import { MD_COUNTIES, DISPOSITION_OPTIONS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, ExternalLink, Search, FileCheck, AlertTriangle, XCircle, CheckCircle, Printer, Download, Loader2, Zap, Info } from "lucide-react";
import type { ExpungementCase } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

type FormData = Omit<ExpungementCase, "id" | "createdAt">;

const empty: FormData = {
  caseNumber: "", courtType: "District", county: "", defendantName: "", defendantDOB: "",
  defendantAddress: "", defendantCity: "", defendantState: "MD", defendantZip: "",
  defendantPhone: "", defendantEmail: "", dispositionType: "", dispositionDate: "",
  offenseDescription: "", lawEnforcementAgency: "", incidentLocation: "", incidentDescription: "",
  arrestType: "arrested", hasPendingCases: "no", sentenceCompleted: "", sentenceCompletionDate: "",
  probationDischarged: "", probationDischargeDate: "", eligibilityStatus: "pending",
  eligibilityNotes: "", selectedForm: "", filingFee: "", waitingPeriodMet: "",
  unitRuleNotes: "", status: "intake",
};

const isGuilty = (dt: string | null | undefined) =>
  dt?.startsWith("guilty_") || false;

/**
 * Detect whether the offense description or statute indicates a sex offense
 * that disqualifies PBJ expungement (Title 2 Subtitle 5 CL, or § 3-211 CL).
 */
function isSexOffensePBJExclusion(offenseDescription: string, statuteCode: string): boolean {
  const desc = (offenseDescription || "").toLowerCase();
  const stat = (statuteCode || "").toLowerCase();

  // § 3-211 CL (sexual offense / child sex abuse)
  if (stat.includes("3-211") || stat.includes("3.211")) return true;
  if (desc.includes("3-211")) return true;

  // Title 2 Subtitle 5 of CL — rape and sexual offenses (§ 3-303 through § 3-312)
  const sexOffensePattern = /\b(rape|sexual offense|sex offense|sexual assault|§\s*3-30[3-9]|§\s*3-31[0-2]|cl\s*§\s*3-3[01]\d)\b/i;
  if (sexOffensePattern.test(desc)) return true;
  if (/3-30[3-9]|3-31[0-2]/i.test(stat)) return true;

  return false;
}

export default function CaseForm() {
  const params = useParams<{ id: string }>();
  const isNew = !params.id || params.id === "new";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState("info");
  const [form, setForm] = useState<FormData>({ ...empty });
  const [eligResult, setEligResult] = useState<EligibilityResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupSuccess, setLookupSuccess] = useState(false);

  // New state variables for unit rule and auto-expungement
  const [unitResult, setUnitResult] = useState<UnitRuleResult | null>(null);
  const [autoExpungeInfo, setAutoExpungeInfo] = useState<{ autoExpunged: boolean; message: string } | null>(null);
  // New state for "new conviction during waiting period" question
  const [newConvictionDuringWait, setNewConvictionDuringWait] = useState<"no" | "yes" | "unknown">("no");
  // Hidden state for statute code populated from Case Search
  const [statuteCode, setStatuteCode] = useState<string>("");

  const { data: existing } = useQuery<ExpungementCase>({
    queryKey: ["/api/cases", params.id],
    queryFn: () => apiRequest("GET", `/api/cases/${params.id}`).then((r) => r.json()),
    enabled: !isNew,
  });

  useEffect(() => {
    if (existing) {
      const { id, createdAt, ...rest } = existing;
      setForm(rest as FormData);
      if (existing.eligibilityStatus && existing.eligibilityStatus !== "pending") {
        setEligResult(analyzeEligibility(existing));
      }
    }
  }, [existing]);

  const set = (field: keyof FormData, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

  const handleAutoLookup = async () => {
    if (!form.caseNumber) return;
    setLookingUp(true);
    setLookupError("");
    setLookupSuccess(false);
    try {
      const res = await fetch(`${API_BASE}/api/lookup/${encodeURIComponent(form.caseNumber)}`);
      const data = await res.json();
      if (!data.success) {
        setLookupError(data.error || "Lookup failed.");
        setLookingUp(false);
        return;
      }
      // Auto-fill form fields from the lookup result
      const updates: Partial<FormData> = {};
      if (data.defendant) {
        if (data.defendant.name) updates.defendantName = data.defendant.name;
        if (data.defendant.dob) updates.defendantDOB = data.defendant.dob;
        if (data.defendant.address) updates.defendantAddress = data.defendant.address;
        if (data.defendant.city) updates.defendantCity = data.defendant.city;
        if (data.defendant.state) updates.defendantState = data.defendant.state;
        if (data.defendant.zip) updates.defendantZip = data.defendant.zip;
      }
      if (data.caseInfo) {
        if (data.caseInfo.courtType) updates.courtType = data.caseInfo.courtType;
        if (data.caseInfo.county) updates.county = data.caseInfo.county;
      }
      if (data.lawEnforcement) updates.lawEnforcementAgency = data.lawEnforcement;

      // Store ALL charges and analyze unit rule
      if (data.charges && data.charges.length > 0) {
        // Build combined offense description from all charges
        updates.offenseDescription = data.charges.map((ch: any, i: number) => {
          const parts = [`Charge ${i + 1}: ${ch.description || "Unknown"}`];
          if (ch.statute) parts[0] += ` (${ch.statute})`;
          if (ch.disposition) parts[0] += ` — ${ch.disposition}`;
          return parts[0];
        }).join("; ");

        // Store the first charge's statute code for the eligibility analyzer
        const firstCharge = data.charges[0];
        if (firstCharge.statute) {
          setStatuteCode(firstCharge.statute);
        }

        // Map the first charge's disposition to the dropdown value
        const c = firstCharge;
        if (c.disposition) {
          const d = c.disposition.toLowerCase();
          if (d.includes("probation before judgment") || d.includes("pbj")) updates.dispositionType = "pbj";
          else if (d.includes("nolle prosequi") || d.includes("nol pros")) updates.dispositionType = "nolle_prosequi";
          else if (d.includes("not guilty") || d.includes("acquit")) updates.dispositionType = "acquittal";
          else if (d.includes("stet")) updates.dispositionType = "stet";
          else if (d.includes("dismiss")) updates.dispositionType = "dismissal";
          else if (d.includes("not criminally responsible")) updates.dispositionType = "not_criminally_responsible";
          else if (d.includes("guilty") || d.includes("convicted")) updates.dispositionType = "guilty_misdemeanor";
        }
        if (c.dispositionDate) updates.dispositionDate = c.dispositionDate;

        // Run the new analyzeUnit() from the eligibility engine
        const chargesForUnit = data.charges.map((ch: any) => ({
          description: ch.description || "",
          statute: ch.statute || "",
          disposition: ch.disposition || "",
          dispositionDate: ch.dispositionDate || "",
        }));
        const unitAnalysis = analyzeUnit(chargesForUnit);
        setUnitResult(unitAnalysis);

        // Store a text summary in unitRuleNotes for persistence
        updates.unitRuleNotes = unitAnalysis.summary;

        // Run auto-expungement check
        const dispositionDate = c.dispositionDate || "";
        const dispositionType = c.disposition || updates.dispositionType || "";
        const autoExpResult = checkAutoExpungement(dispositionDate, dispositionType);
        setAutoExpungeInfo(autoExpResult);
      }

      if (data.arrestDate) updates.incidentDescription = `Arrest date: ${data.arrestDate}`;
      // Auto-fill probation discharge date from PBJ end date
      if (data.probationEndDate) {
        updates.probationDischarged = "yes";
        updates.probationDischargeDate = data.probationEndDate;
      }
      setForm((f) => ({ ...f, ...updates }));
      setLookupSuccess(true);
      toast({ title: "Case data loaded from Case Search" });
    } catch (e: any) {
      setLookupError(`Lookup failed: ${e.message}`);
    }
    setLookingUp(false);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (isNew) {
        const res = await apiRequest("POST", "/api/cases", data);
        return res.json();
      } else {
        const res = await apiRequest("PATCH", `/api/cases/${params.id}`, data);
        return res.json();
      }
    },
    onSuccess: (saved: ExpungementCase) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cases/stats"] });
      toast({ title: "Case saved" });
      if (isNew && saved.id) navigate(`/case/${saved.id}`);
    },
    onError: () => toast({ title: "Error saving case", variant: "destructive" }),
  });

  const handleSave = () => saveMutation.mutate(form);

  const handleAnalyze = () => {
    const result = analyzeEligibility(form);
    setEligResult(result);
    const updated = {
      ...form,
      eligibilityStatus: result.status,
      eligibilityNotes: result.reason,
      selectedForm: result.form || "",
      filingFee: result.fee,
      waitingPeriodMet: result.status === "eligible" ? "yes" : result.status === "not_eligible" ? "no" : "unknown",
      status: result.status === "eligible" ? "eligible" : form.status,
    };
    setForm(updated);
    if (!isNew) {
      saveMutation.mutate(updated);
    }
  };

  const dispLabel = DISPOSITION_OPTIONS.find((d) => d.value === form.dispositionType)?.label || "";

  // Determine if PBJ sex offense exclusion warning should be shown
  const showPbjSexOffenseWarning =
    (form.dispositionType === "pbj" || form.dispositionType === "pbj_dui") &&
    isSexOffensePBJExclusion(form.offenseDescription || "", statuteCode);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <h1 className="text-lg font-bold text-[#1B2A4A]">{isNew ? "New Expungement Case" : `Case: ${form.caseNumber}`}</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="info">Case Info</TabsTrigger>
          <TabsTrigger value="disposition">Charge & Disposition</TabsTrigger>
          <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
          <TabsTrigger value="petition">Petition</TabsTrigger>
        </TabsList>

        {/* ================================================================
            TAB 1: CASE INFO
        ================================================================ */}
        <TabsContent value="info">
          <Card>
            <CardHeader><CardTitle className="text-base">Case Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2 md:col-span-1">
                  <Label>Case Number</Label>
                  <Input value={form.caseNumber} onChange={(e) => set("caseNumber", e.target.value)} placeholder="e.g. C-02-CR-24-001234" data-testid="input-case-number" />
                </div>
                <div className="flex items-end gap-2 md:col-span-2">
                  <Button className="bg-[#01696F] hover:bg-[#015258]" onClick={handleAutoLookup} disabled={lookingUp || !form.caseNumber} data-testid="button-auto-lookup">
                    {lookingUp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                    {lookingUp ? "Looking up..." : "Auto-Fill from Case Search"}
                  </Button>
                  <Button variant="outline" className="text-[#01696F] border-[#01696F]" onClick={() => window.open("https://casesearch.courts.state.md.us", "_blank")} data-testid="button-case-search">
                    <ExternalLink className="w-4 h-4 mr-2" /> Manual Lookup
                  </Button>
                </div>
              </div>
              {lookupError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  {lookupError}
                </div>
              )}
              {lookupSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                  Case data loaded from Maryland Case Search. Review the fields below and make any corrections.
                </div>
              )}
              <p className="text-xs text-muted-foreground">Click "Auto-Fill" to pull case data directly from Maryland Case Search, or use "Manual Lookup" to view the case and enter details yourself.</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Court Type</Label>
                  <RadioGroup value={form.courtType || "District"} onValueChange={(v) => set("courtType", v)} className="flex gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="District" id="dist" /><Label htmlFor="dist">District</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="Circuit" id="circ" /><Label htmlFor="circ">Circuit</Label></div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label>County</Label>
                  <Select value={form.county || ""} onValueChange={(v) => set("county", v)}>
                    <SelectTrigger data-testid="select-county"><SelectValue placeholder="Select county" /></SelectTrigger>
                    <SelectContent>
                      {MD_COUNTIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <h3 className="font-semibold text-sm text-[#1B2A4A] pt-2">Defendant Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Full Name</Label><Input value={form.defendantName} onChange={(e) => set("defendantName", e.target.value)} data-testid="input-defendant-name" /></div>
                <div className="space-y-2"><Label>Date of Birth</Label><Input type="date" value={form.defendantDOB || ""} onChange={(e) => set("defendantDOB", e.target.value)} data-testid="input-dob" /></div>
                <div className="space-y-2 md:col-span-2"><Label>Address</Label><Input value={form.defendantAddress || ""} onChange={(e) => set("defendantAddress", e.target.value)} /></div>
                <div className="space-y-2"><Label>City</Label><Input value={form.defendantCity || ""} onChange={(e) => set("defendantCity", e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>State</Label><Input value={form.defendantState || "MD"} onChange={(e) => set("defendantState", e.target.value)} /></div>
                  <div className="space-y-2"><Label>Zip</Label><Input value={form.defendantZip || ""} onChange={(e) => set("defendantZip", e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Phone</Label><Input value={form.defendantPhone || ""} onChange={(e) => set("defendantPhone", e.target.value)} /></div>
                <div className="space-y-2"><Label>Email</Label><Input value={form.defendantEmail || ""} onChange={(e) => set("defendantEmail", e.target.value)} /></div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button onClick={handleSave} className="bg-[#01696F] hover:bg-[#015258]" data-testid="button-save-info">
                  {isNew ? "Save & Continue" : "Save"}
                </Button>
                {!isNew && <Button variant="outline" onClick={() => setTab("disposition")}>Next</Button>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 2: CHARGE & DISPOSITION
        ================================================================ */}
        <TabsContent value="disposition">
          <Card>
            <CardHeader><CardTitle className="text-base">Charge & Disposition Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Offense Description</Label><Input value={form.offenseDescription || ""} onChange={(e) => set("offenseDescription", e.target.value)} placeholder="e.g. Possession of CDS" data-testid="input-offense" /></div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Disposition Type</Label>
                  <Select value={form.dispositionType || ""} onValueChange={(v) => set("dispositionType", v)}>
                    <SelectTrigger data-testid="select-disposition"><SelectValue placeholder="Select disposition" /></SelectTrigger>
                    <SelectContent>
                      {DISPOSITION_OPTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Disposition Date</Label><Input type="date" value={form.dispositionDate || ""} onChange={(e) => set("dispositionDate", e.target.value)} data-testid="input-disposition-date" /></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Law Enforcement Agency</Label><Input value={form.lawEnforcementAgency || ""} onChange={(e) => set("lawEnforcementAgency", e.target.value)} /></div>
                <div className="space-y-2">
                  <Label>Arrest Type</Label>
                  <RadioGroup value={form.arrestType || "arrested"} onValueChange={(v) => set("arrestType", v)} className="flex gap-4 pt-1">
                    <div className="flex items-center space-x-1"><RadioGroupItem value="arrested" id="arr" /><Label htmlFor="arr" className="text-sm">Arrested</Label></div>
                    <div className="flex items-center space-x-1"><RadioGroupItem value="summons" id="sum" /><Label htmlFor="sum" className="text-sm">Summons</Label></div>
                    <div className="flex items-center space-x-1"><RadioGroupItem value="citation" id="cit" /><Label htmlFor="cit" className="text-sm">Citation</Label></div>
                  </RadioGroup>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Incident Location</Label><Input value={form.incidentLocation || ""} onChange={(e) => set("incidentLocation", e.target.value)} placeholder="City/location in Maryland" /></div>
                <div className="space-y-2"><Label>Incident Description</Label><Input value={form.incidentDescription || ""} onChange={(e) => set("incidentDescription", e.target.value)} placeholder="Brief description" /></div>
              </div>

              {isGuilty(form.dispositionType) && (
                <div className="border rounded-lg p-4 space-y-4 bg-slate-50">
                  <h4 className="font-semibold text-sm text-[#1B2A4A]">Sentence Information (Required for Guilty Dispositions)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Sentence Completed?</Label>
                      <RadioGroup value={form.sentenceCompleted || ""} onValueChange={(v) => set("sentenceCompleted", v)} className="flex gap-4">
                        <div className="flex items-center space-x-1"><RadioGroupItem value="yes" id="sc-y" /><Label htmlFor="sc-y" className="text-sm">Yes</Label></div>
                        <div className="flex items-center space-x-1"><RadioGroupItem value="no" id="sc-n" /><Label htmlFor="sc-n" className="text-sm">No</Label></div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2"><Label>Sentence Completion Date</Label><Input type="date" value={form.sentenceCompletionDate || ""} onChange={(e) => set("sentenceCompletionDate", e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Probation Discharged?</Label>
                      <RadioGroup value={form.probationDischarged || ""} onValueChange={(v) => set("probationDischarged", v)} className="flex gap-4">
                        <div className="flex items-center space-x-1"><RadioGroupItem value="yes" id="pd-y" /><Label htmlFor="pd-y" className="text-sm">Yes</Label></div>
                        <div className="flex items-center space-x-1"><RadioGroupItem value="no" id="pd-n" /><Label htmlFor="pd-n" className="text-sm">No</Label></div>
                        <div className="flex items-center space-x-1"><RadioGroupItem value="na" id="pd-na" /><Label htmlFor="pd-na" className="text-sm">N/A</Label></div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2"><Label>Probation Discharge Date</Label><Input type="date" value={form.probationDischargeDate || ""} onChange={(e) => set("probationDischargeDate", e.target.value)} /></div>
                  </div>
                </div>
              )}

              {(form.dispositionType === "pbj" || form.dispositionType === "pbj_dui") && (
                <div className="border rounded-lg p-4 space-y-4 bg-slate-50">
                  <h4 className="font-semibold text-sm text-[#1B2A4A]">Probation Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Probation Discharged?</Label>
                      <RadioGroup value={form.probationDischarged || ""} onValueChange={(v) => set("probationDischarged", v)} className="flex gap-4">
                        <div className="flex items-center space-x-1"><RadioGroupItem value="yes" id="pb-y" /><Label htmlFor="pb-y" className="text-sm">Yes</Label></div>
                        <div className="flex items-center space-x-1"><RadioGroupItem value="no" id="pb-n" /><Label htmlFor="pb-n" className="text-sm">No</Label></div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2"><Label>Probation Discharge Date</Label><Input type="date" value={form.probationDischargeDate || ""} onChange={(e) => set("probationDischargeDate", e.target.value)} /></div>
                  </div>
                </div>
              )}

              {/* Has Pending Criminal Cases */}
              <div className="space-y-2">
                <Label>Has Pending Criminal Cases?</Label>
                <RadioGroup value={form.hasPendingCases || "no"} onValueChange={(v) => set("hasPendingCases", v)} className="flex gap-4">
                  <div className="flex items-center space-x-1"><RadioGroupItem value="no" id="pc-n" /><Label htmlFor="pc-n" className="text-sm">No</Label></div>
                  <div className="flex items-center space-x-1"><RadioGroupItem value="yes" id="pc-y" /><Label htmlFor="pc-y" className="text-sm">Yes</Label></div>
                </RadioGroup>
              </div>

              {/* New conviction during waiting period — spec item #6 */}
              <div className="space-y-2" data-testid="new-conviction-question">
                <Label>Has the defendant been convicted of any NEW crime since this case was disposed of?</Label>
                <RadioGroup
                  value={newConvictionDuringWait}
                  onValueChange={(v) => setNewConvictionDuringWait(v as "no" | "yes" | "unknown")}
                  className="flex gap-4"
                  data-testid="radio-new-conviction"
                >
                  <div className="flex items-center space-x-1"><RadioGroupItem value="no" id="nc-n" /><Label htmlFor="nc-n" className="text-sm">No</Label></div>
                  <div className="flex items-center space-x-1"><RadioGroupItem value="yes" id="nc-y" /><Label htmlFor="nc-y" className="text-sm">Yes</Label></div>
                  <div className="flex items-center space-x-1"><RadioGroupItem value="unknown" id="nc-u" /><Label htmlFor="nc-u" className="text-sm">Unknown</Label></div>
                </RadioGroup>
                {newConvictionDuringWait === "yes" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mt-2" data-testid="new-conviction-warning">
                    <AlertTriangle className="w-4 h-4 inline-block mr-1 mb-0.5" />
                    A new conviction during the waiting period may block expungement unless the new conviction itself becomes eligible (CP § 10-110(d)(1)).
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setTab("info")}>Previous</Button>
                <Button onClick={() => { handleSave(); setTab("eligibility"); }} className="bg-[#01696F] hover:bg-[#015258]" data-testid="button-save-disposition">Save & Analyze</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 3: ELIGIBILITY
        ================================================================ */}
        <TabsContent value="eligibility">
          <Card>
            <CardHeader><CardTitle className="text-base">Eligibility Analysis</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <Button onClick={handleAnalyze} className="bg-[#01696F] hover:bg-[#015258]" data-testid="button-analyze">
                <Search className="w-4 h-4 mr-2" /> Analyze Eligibility
              </Button>

              {/* Auto-expungement notice — spec item #8 */}
              {autoExpungeInfo?.autoExpunged && (
                <div className="rounded-lg p-4 border-2 border-blue-300 bg-blue-50" data-testid="auto-expunge-notice">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-900 text-sm mb-1">Possible Automatic Expungement — CP § 10-105.1</p>
                      <p className="text-sm text-blue-800">
                        This case may have been <strong>AUTOMATICALLY EXPUNGED</strong> under CP § 10-105.1. Cases after October 1, 2021 where all charges resulted in acquittal, dismissal, not guilty, or nolle prosequi are automatically expunged after 3 years. Verify on Case Search — the records may already be removed.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* PBJ sex offense exclusion warning — spec item #7 */}
              {showPbjSexOffenseWarning && (
                <div className="rounded-lg p-4 border-2 border-red-300 bg-red-50" data-testid="pbj-sex-offense-warning">
                  <div className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">
                      <strong>PBJ expungement is NOT available for violations of Criminal Law Article Title 2, Subtitle 5 or § 3-211 (sex offenses).</strong> See CP § 10-105(a)(3).
                    </p>
                  </div>
                </div>
              )}

              {/* Main eligibility result */}
              {eligResult && (
                <div className="space-y-4">
                  <div className={`rounded-lg p-6 border-2 ${
                    eligResult.status === "eligible" ? "border-emerald-300 bg-emerald-50" :
                    eligResult.status === "not_eligible" ? "border-red-300 bg-red-50" :
                    "border-amber-300 bg-amber-50"
                  }`}>
                    <div className="flex items-center gap-3 mb-3">
                      {eligResult.status === "eligible" && <CheckCircle className="w-8 h-8 text-emerald-600" />}
                      {eligResult.status === "not_eligible" && <XCircle className="w-8 h-8 text-red-600" />}
                      {eligResult.status === "needs_review" && <AlertTriangle className="w-8 h-8 text-amber-600" />}
                      <div>
                        <h3 className={`text-lg font-bold ${
                          eligResult.status === "eligible" ? "text-emerald-800" :
                          eligResult.status === "not_eligible" ? "text-red-800" :
                          "text-amber-800"
                        }`}>
                          {eligResult.status === "eligible" ? "ELIGIBLE FOR EXPUNGEMENT" :
                           eligResult.status === "not_eligible" ? "NOT CURRENTLY ELIGIBLE" :
                           "ATTORNEY REVIEW REQUIRED"}
                        </h3>
                      </div>
                    </div>

                    {eligResult.form && (
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-white rounded p-3">
                          <p className="text-xs text-muted-foreground">Recommended Form</p>
                          <p className="font-bold text-lg">CC-DC-CR-{eligResult.form}</p>
                        </div>
                        <div className="bg-white rounded p-3">
                          <p className="text-xs text-muted-foreground">Filing Fee</p>
                          <p className="font-bold text-lg">{eligResult.fee}</p>
                        </div>
                      </div>
                    )}

                    <p className="text-sm leading-relaxed">{eligResult.reason}</p>

                    {eligResult.eligibleDate && (
                      <p className="mt-3 font-semibold text-sm">
                        Eligible Date: {new Date(eligResult.eligibleDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    )}
                  </div>

                  {/* Unit Rule Display — spec item #5 */}
                  {(() => {
                    // No auto-fill done yet — prompt user
                    if (!unitResult && !lookupSuccess) {
                      return (
                        <div className="rounded-lg p-4 border border-amber-300 bg-amber-50" data-testid="unit-rule-prompt">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-amber-800 text-sm">Unit Rule: Analysis Not Yet Available</p>
                              <p className="text-sm text-amber-700 mt-1">
                                Use <strong>Auto-Fill from Case Search</strong> on the Case Info tab to load all charges automatically and run the unit rule analysis.
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Single charge — unit rule not applicable
                    if (unitResult && unitResult.charges.length <= 1) {
                      return (
                        <div className="rounded-lg p-4 border border-emerald-300 bg-emerald-50" data-testid="unit-rule-single">
                          <div className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <p className="text-sm text-emerald-800 font-semibold">Unit Rule: Not Applicable — single charge</p>
                          </div>
                        </div>
                      );
                    }

                    // All eligible
                    if (unitResult?.status === "all_eligible") {
                      return (
                        <div className="rounded-lg p-4 border-2 border-emerald-300 bg-emerald-50" data-testid="unit-rule-all-eligible">
                          <div className="flex items-start gap-3 mb-3">
                            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-emerald-800 text-sm">Unit Rule: All Clear</p>
                              <p className="text-xs text-emerald-700 mt-0.5">{unitResult.summary}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {unitResult.charges.map((ch) => (
                              <div key={ch.chargeNumber} className="bg-white rounded p-2 text-xs border border-emerald-100">
                                <span className="font-semibold text-emerald-900">Charge {ch.chargeNumber}:</span>{" "}
                                <span className="text-gray-700">{ch.description}</span>
                                {ch.statute && <span className="text-gray-500"> ({ch.statute})</span>}
                                {ch.isCannabis && <Badge variant="outline" className="ml-1 text-xs py-0 h-4 border-emerald-400 text-emerald-700">Cannabis — Exempt</Badge>}
                                <p className="text-gray-500 mt-0.5 ml-0">{ch.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    // Blocked
                    if (unitResult?.status === "blocked") {
                      const blockingCharge = unitResult.charges.find((ch) => !ch.eligible && !ch.isCannabis);
                      return (
                        <div className="rounded-lg p-4 border-2 border-red-300 bg-red-50" data-testid="unit-rule-blocked">
                          <div className="flex items-start gap-3 mb-3">
                            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-red-800 text-sm">Unit Rule: BLOCKED</p>
                              {blockingCharge && (
                                <p className="text-xs text-red-700 mt-0.5">
                                  Charge {blockingCharge.chargeNumber} ({blockingCharge.description || blockingCharge.statute}) blocks the entire unit.
                                </p>
                              )}
                              <p className="text-xs text-red-700 mt-1">{unitResult.summary}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {unitResult.charges.map((ch) => (
                              <div key={ch.chargeNumber} className={`rounded p-2 text-xs border ${ch.eligible || ch.isCannabis ? "bg-white border-gray-100" : "bg-red-100 border-red-200"}`}>
                                <span className="font-semibold">{ch.eligible || ch.isCannabis ? "✓" : "✗"} Charge {ch.chargeNumber}:</span>{" "}
                                <span className="text-gray-700">{ch.description}</span>
                                {ch.statute && <span className="text-gray-500"> ({ch.statute})</span>}
                                {ch.isCannabis && <Badge variant="outline" className="ml-1 text-xs py-0 h-4 border-emerald-400 text-emerald-700">Cannabis — Exempt</Badge>}
                                <p className="text-gray-600 mt-0.5">{ch.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    // Needs review
                    if (unitResult?.status === "needs_review") {
                      return (
                        <div className="rounded-lg p-4 border-2 border-amber-300 bg-amber-50" data-testid="unit-rule-needs-review">
                          <div className="flex items-start gap-3 mb-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-amber-800 text-sm">Unit Rule: Needs Attorney Review</p>
                              <p className="text-xs text-amber-700 mt-0.5">{unitResult.summary}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {unitResult.charges.map((ch) => (
                              <div key={ch.chargeNumber} className="bg-white rounded p-2 text-xs border border-amber-100">
                                <span className="font-semibold text-amber-900">Charge {ch.chargeNumber}:</span>{" "}
                                <span className="text-gray-700">{ch.description}</span>
                                {ch.statute && <span className="text-gray-500"> ({ch.statute})</span>}
                                {ch.isCannabis && <Badge variant="outline" className="ml-1 text-xs py-0 h-4 border-emerald-400 text-emerald-700">Cannabis — Exempt</Badge>}
                                <p className="text-gray-500 mt-0.5">{ch.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })()}
                </div>
              )}

              {/* Show unit rule and auto-expunge info even before eligibility analysis is run,
                  if auto-fill has been done */}
              {!eligResult && (
                <div className="space-y-4">
                  {/* Unit Rule before main analysis */}
                  {(() => {
                    if (!unitResult) {
                      return (
                        <div className="rounded-lg p-4 border border-amber-300 bg-amber-50" data-testid="unit-rule-prompt-pre">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-amber-800 text-sm">Unit Rule: Analysis Not Yet Available</p>
                              <p className="text-sm text-amber-700 mt-1">
                                Use <strong>Auto-Fill from Case Search</strong> on the Case Info tab to load all charges automatically and run the unit rule analysis.
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (unitResult.charges.length <= 1) {
                      return (
                        <div className="rounded-lg p-4 border border-emerald-300 bg-emerald-50" data-testid="unit-rule-single-pre">
                          <div className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <p className="text-sm text-emerald-800 font-semibold">Unit Rule: Not Applicable — single charge</p>
                          </div>
                        </div>
                      );
                    }

                    if (unitResult.status === "all_eligible") {
                      return (
                        <div className="rounded-lg p-4 border-2 border-emerald-300 bg-emerald-50" data-testid="unit-rule-all-eligible-pre">
                          <div className="flex items-start gap-3 mb-3">
                            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-emerald-800 text-sm">Unit Rule: All Clear</p>
                              <p className="text-xs text-emerald-700 mt-0.5">{unitResult.summary}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {unitResult.charges.map((ch) => (
                              <div key={ch.chargeNumber} className="bg-white rounded p-2 text-xs border border-emerald-100">
                                <span className="font-semibold text-emerald-900">Charge {ch.chargeNumber}:</span>{" "}
                                <span className="text-gray-700">{ch.description}</span>
                                {ch.statute && <span className="text-gray-500"> ({ch.statute})</span>}
                                {ch.isCannabis && <Badge variant="outline" className="ml-1 text-xs py-0 h-4 border-emerald-400 text-emerald-700">Cannabis — Exempt</Badge>}
                                <p className="text-gray-500 mt-0.5">{ch.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (unitResult.status === "blocked") {
                      const blockingCharge = unitResult.charges.find((ch) => !ch.eligible && !ch.isCannabis);
                      return (
                        <div className="rounded-lg p-4 border-2 border-red-300 bg-red-50" data-testid="unit-rule-blocked-pre">
                          <div className="flex items-start gap-3 mb-3">
                            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-red-800 text-sm">Unit Rule: BLOCKED</p>
                              {blockingCharge && (
                                <p className="text-xs text-red-700 mt-0.5">
                                  Charge {blockingCharge.chargeNumber} ({blockingCharge.description || blockingCharge.statute}) blocks the entire unit.
                                </p>
                              )}
                              <p className="text-xs text-red-700 mt-1">{unitResult.summary}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {unitResult.charges.map((ch) => (
                              <div key={ch.chargeNumber} className={`rounded p-2 text-xs border ${ch.eligible || ch.isCannabis ? "bg-white border-gray-100" : "bg-red-100 border-red-200"}`}>
                                <span className="font-semibold">{ch.eligible || ch.isCannabis ? "✓" : "✗"} Charge {ch.chargeNumber}:</span>{" "}
                                <span className="text-gray-700">{ch.description}</span>
                                {ch.statute && <span className="text-gray-500"> ({ch.statute})</span>}
                                {ch.isCannabis && <Badge variant="outline" className="ml-1 text-xs py-0 h-4 border-emerald-400 text-emerald-700">Cannabis — Exempt</Badge>}
                                <p className="text-gray-600 mt-0.5">{ch.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (unitResult.status === "needs_review") {
                      return (
                        <div className="rounded-lg p-4 border-2 border-amber-300 bg-amber-50" data-testid="unit-rule-needs-review-pre">
                          <div className="flex items-start gap-3 mb-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-amber-800 text-sm">Unit Rule: Needs Attorney Review</p>
                              <p className="text-xs text-amber-700 mt-0.5">{unitResult.summary}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {unitResult.charges.map((ch) => (
                              <div key={ch.chargeNumber} className="bg-white rounded p-2 text-xs border border-amber-100">
                                <span className="font-semibold text-amber-900">Charge {ch.chargeNumber}:</span>{" "}
                                <span className="text-gray-700">{ch.description}</span>
                                {ch.statute && <span className="text-gray-500"> ({ch.statute})</span>}
                                {ch.isCannabis && <Badge variant="outline" className="ml-1 text-xs py-0 h-4 border-emerald-400 text-emerald-700">Cannabis — Exempt</Badge>}
                                <p className="text-gray-500 mt-0.5">{ch.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })()}

                  <p className="text-sm text-muted-foreground">
                    Click <strong>Analyze Eligibility</strong> above to run the full eligibility check for this case.
                  </p>
                </div>
              )}

              {/* Eligibility notes text area */}
              {eligResult && (
                <div className="space-y-2">
                  <Label>Attorney Notes</Label>
                  <Textarea
                    value={form.eligibilityNotes || ""}
                    onChange={(e) => set("eligibilityNotes", e.target.value)}
                    rows={4}
                    placeholder="Add any additional notes about eligibility..."
                    data-testid="textarea-eligibility-notes"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setTab("disposition")}>Previous</Button>
                <Button onClick={() => { handleSave(); setTab("petition"); }} className="bg-[#01696F] hover:bg-[#015258]" data-testid="button-save-eligibility">Save & Continue</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 4: PETITION
        ================================================================ */}
        <TabsContent value="petition">
          <PetitionView caseData={form} eligResult={eligResult} caseId={isNew ? null : parseInt(params.id!)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PetitionView — renders the petition preview and PDF download buttons
// ---------------------------------------------------------------------------

function PetitionView({ caseData, eligResult, caseId }: { caseData: FormData; eligResult: EligibilityResult | null; caseId: number | null }) {
  let formType = eligResult?.form || caseData.selectedForm || "072A";
  if (caseData.dispositionType === "guilty_cannabis" && formType === "072B") formType = "072D";
  const isGuiltyForm = formType === "072B" || formType === "072D";
  const isEarlyForm = formType === "072C";

  const arrestLabel = caseData.arrestType === "arrested" ? "arrested" : caseData.arrestType === "summons" ? "served with a summons" : "served with a citation";

  const API_BASE_PET = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

  const handleDownloadForm = (ft: string) => {
    if (!caseId) return;
    window.open(`${API_BASE_PET}/api/cases/${caseId}/form/${ft}`, "_blank");
  };

  return (
    <div>
      <div className="space-y-3 mb-4 print:hidden">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[#1B2A4A]">Petition — Form CC-DC-CR-{formType}</h2>
        </div>

        {caseId ? (
          <div className="bg-[#E6F4F4] border border-[#01696F]/20 rounded-lg p-4">
            <p className="font-semibold text-[#1B2A4A] text-sm mb-3">Download Official Court Forms (Auto-Filled)</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleDownloadForm(formType)} className="bg-[#01696F] hover:bg-[#015258]" data-testid="button-download-petition">
                <Download className="w-4 h-4 mr-2" /> Petition Form CC-DC-CR-{formType}
              </Button>
              {isEarlyForm && (
                <Button onClick={() => handleDownloadForm("078")} variant="outline" className="border-[#01696F] text-[#01696F]" data-testid="button-download-waiver">
                  <Download className="w-4 h-4 mr-2" /> General Waiver CC-DC-CR-078
                </Button>
              )}
              <Button onClick={() => window.print()} variant="outline" data-testid="button-print">
                <Printer className="w-4 h-4 mr-2" /> Print Preview Below
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">These are the official Maryland court PDF forms with all fields and checkboxes auto-filled from this case's data. Print and file with the clerk.</p>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            Save the case first to enable official form downloads.
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg p-8 shadow-sm print:shadow-none print:border-0 print:p-0 petition-page text-sm leading-relaxed" style={{ fontFamily: "'Times New Roman', serif" }}>
        <div className="text-center mb-1 flex justify-between text-xs">
          <span>☐ CIRCUIT COURT &nbsp;&nbsp; ☐ DISTRICT COURT OF MARYLAND FOR</span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs mb-4 border-b pb-3">
          <div><span className="text-muted-foreground">City/County: </span><strong>{caseData.county || "________________"}</strong></div>
          <div><span className="text-muted-foreground">Case No.: </span><strong>{caseData.caseNumber || "________________"}</strong></div>
          <div><span className="text-muted-foreground">Located at: </span>{"________________"}</div>
          <div><span className="text-muted-foreground">Tracking #: </span>{"________________"}</div>
          <div className="col-span-2"><span className="text-muted-foreground">Court Address: </span>{"________________"}</div>
        </div>

        <div className="text-center mb-4">
          <p>STATE OF MARYLAND</p>
          <p className="text-xs text-muted-foreground">vs.</p>
          <p><strong>{caseData.defendantName || "________________"}</strong></p>
          <p className="text-xs">DOB: {caseData.defendantDOB || "________________"}</p>
        </div>

        <h2 className="text-center font-bold mb-4 text-sm">
          PETITION FOR EXPUNGEMENT OF RECORDS
          {isGuiltyForm && <><br />(GUILTY DISPOSITION)</>}
          {isEarlyForm && <><br />(LESS THAN 3 YEARS HAS PASSED SINCE DISPOSITION)</>}
          {!isGuiltyForm && !isEarlyForm && <><br />(ACQUITTAL, DISMISSAL, PROBATION BEFORE JUDGMENT, NOLLE PROSEQUI, STET, OR NOT CRIMINALLY RESPONSIBLE)</>}
        </h2>

        <div className="space-y-3 text-sm">
          <p>
            1. On or about <u>{caseData.dispositionDate ? new Date(caseData.dispositionDate + "T12:00:00").toLocaleDateString() : "________________"}</u>, I was{" "}
            <strong>{arrestLabel}</strong> by an officer of the{" "}
            <u>{caseData.lawEnforcementAgency || "________________"}</u>{" "}
            at <u>{caseData.incidentLocation || "________________"}</u>, Maryland, as a result of the following incident:{" "}
            <u>{caseData.incidentDescription || "________________"}</u>.
          </p>

          <p>2. I was charged with the offense of <u>{caseData.offenseDescription || "________________"}</u>.</p>

          <p>3. On or about <u>{caseData.dispositionDate ? new Date(caseData.dispositionDate + "T12:00:00").toLocaleDateString() : "________________"}</u>, the charge was disposed of as follows:</p>

          <div className="ml-4 space-y-2">
            {!isGuiltyForm && (
              <>
                <p>{caseData.dispositionType === "acquittal" ? "☑" : "☐"} I was acquitted/found not guilty of the charge.</p>
                <p>{caseData.dispositionType === "dismissal" ? "☑" : "☐"} The charge was otherwise dismissed.</p>
                <p>{caseData.dispositionType === "pbj_no_longer_crime" ? "☑" : "☐"} A probation before judgment was entered on the charge, but the conduct on which the charge was based is no longer a crime.</p>
                <p>{caseData.dispositionType === "pbj" ? "☑" : "☐"} A probation before judgment was entered on the charge, and the conduct on which the charge was based is still a crime.</p>
                <p>{caseData.dispositionType === "pbj_dui" ? "☑" : "☐"} A probation before judgment was entered on violation of Transportation Law Article § 21-902 (a) or (b).</p>
                <p>{caseData.dispositionType === "nolle_prosequi" ? "☑" : "☐"} A nolle prosequi was entered.</p>
                <p>{caseData.dispositionType === "stet" ? "☑" : "☐"} A stet was entered.</p>
                <p>{caseData.dispositionType === "not_criminally_responsible" ? "☑" : "☐"} I was found not criminally responsible.</p>
              </>
            )}
            {isGuiltyForm && (
              <>
                <p>{caseData.dispositionType === "guilty_no_longer_crime" ? "☑" : "☐"} The charge/offense, but the conduct on which the charge/offense is based is no longer a crime.</p>
                <p>{caseData.dispositionType === "guilty_nuisance" ? "☑" : "☐"} A crime specified in Criminal Procedure Article, § 10-105(a)(9).</p>
                <p>{caseData.dispositionType === "guilty_cannabis" ? "☑" : "☐"} Cannabis possession under Criminal Law Article § 5-601.</p>
                <p>{caseData.dispositionType === "guilty_misdemeanor" ? "☑" : "☐"} A misdemeanor crime specified in Criminal Procedure Article, § 10-110.</p>
                <p>{caseData.dispositionType === "guilty_felony" ? "☑" : "☐"} A felony crime specified in Criminal Procedure Article, § 10-110.</p>
                <p>{caseData.dispositionType === "guilty_burglary_theft" ? "☑" : "☐"} First or second degree burglary or felony theft.</p>
                <p>{caseData.dispositionType === "guilty_domestic" ? "☑" : "☐"} A domestically related crime under Criminal Procedure Article, § 6-233.</p>
                <p>{caseData.dispositionType === "guilty_pardon" ? "☑" : "☐"} I was granted a full and unconditional pardon by the Governor.</p>
              </>
            )}
          </div>

          <p className="mt-4">I am not now a defendant in any pending criminal action.</p>
          <p className="mt-4">I request the court to enter an Order for Expungement of all police and court records pertaining to the above {isGuiltyForm ? "conviction(s)" : "arrest, detention, confinement, and/or charges"}.</p>
          <p className="mt-4">I solemnly affirm under the penalties of perjury that the contents of this petition are true to the best of my knowledge, information, and belief, and that the charge to which this petition relates is not part of a unit the expungement of which is precluded under Criminal Procedure Article, § 10-107.</p>
        </div>

        <div className="grid grid-cols-2 gap-8 mt-8 text-xs">
          <div className="space-y-3">
            <p className="font-bold">Attorney</p>
            <p className="italic">/s/ Nirav Babu</p>
            <div className="border-b border-black"></div>
            <p className="text-muted-foreground">Signature of Attorney</p>
            <p>Attorney Number: 0606130009</p>
            <p>Date: ________________</p>
            <p>Printed Name: Nirav Babu, Esq.</p>
            <p>Firm: Innovate Legal Group</p>
            <p>Address: 3030 Greenmount Ave, Suite 320</p>
            <p>Baltimore, MD 21218</p>
            <p>Telephone: ________________</p>
            <p>Email: ________________</p>
          </div>
          <div className="space-y-3">
            <p className="font-bold">Defendant</p>
            <div className="border-b border-black h-6"></div>
            <p className="text-muted-foreground">Signature of Defendant</p>
            <p>Date: ________________</p>
            <p>Printed Name: {caseData.defendantName || "________________"}</p>
            <p>Address: {caseData.defendantAddress || "________________"}</p>
            <p>{caseData.defendantCity || "________________"}, {caseData.defendantState || "MD"} {caseData.defendantZip || "________________"}</p>
            <p>Telephone: {caseData.defendantPhone || "________________"}</p>
            <p>Email: {caseData.defendantEmail || "________________"}</p>
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-6">CC-DC-CR-{formType}</p>

        {isEarlyForm && (
          <div className="mt-8 pt-6 border-t">
            <h3 className="text-center font-bold text-sm mb-4">GENERAL WAIVER AND RELEASE<br />(Criminal Procedure § 10-105)</h3>
            <p className="text-sm">
              I, <u>{caseData.defendantName || "________________"}</u>, release and forever discharge{" "}
              <u>________________</u> (Complainant), and the{" "}
              <u>{caseData.lawEnforcementAgency || "________________"}</u>, all of its officers, agents, and employees, and any and all other persons from any and all tort claims which I may have for wrongful conduct by reason of my arrest, detention, or confinement on or about{" "}
              <u>{caseData.dispositionDate ? new Date(caseData.dispositionDate + "T12:00:00").toLocaleDateString() : "________________"}</u>.
            </p>
            <p className="text-sm mt-3">This General Waiver and Release is conditioned on the expungement of the record of my arrest, detention, or confinement and compliance with Code, Criminal Procedure Article, § 10-105, as applicable, and shall be void if these conditions are not met.</p>
            <div className="grid grid-cols-2 gap-8 mt-6 text-xs">
              <div className="space-y-2">
                <div className="border-b border-black h-6"></div>
                <p className="text-muted-foreground">Petitioner Signature</p>
              </div>
              <div className="space-y-2">
                <div className="border-b border-black h-6"></div>
                <p className="text-muted-foreground">Witness Signature</p>
                <p>Printed Name of Witness: ________________</p>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4">CC-DC-CR-078</p>
          </div>
        )}
      </div>
    </div>
  );
}
