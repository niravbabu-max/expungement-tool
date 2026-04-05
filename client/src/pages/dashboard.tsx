import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, CheckCircle, AlertTriangle, Folder } from "lucide-react";
import { STATUS_LABELS, ELIGIBILITY_LABELS } from "@/lib/constants";
import type { ExpungementCase } from "@shared/schema";
import { useState } from "react";

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-[#1B2A4A]">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function eligBadge(status: string | null) {
  if (status === "eligible") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">Eligible</Badge>;
  if (status === "not_eligible") return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0">Not Eligible</Badge>;
  if (status === "needs_review") return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">Needs Review</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

function statusBadge(status: string | null) {
  const colors: Record<string, string> = {
    intake: "bg-blue-100 text-blue-700",
    screening: "bg-yellow-100 text-yellow-700",
    eligible: "bg-emerald-100 text-emerald-700",
    petition_drafted: "bg-purple-100 text-purple-700",
    filed: "bg-teal-100 text-teal-700",
    complete: "bg-gray-100 text-gray-600",
  };
  const c = colors[status || ""] || "bg-gray-100 text-gray-600";
  return <Badge className={`${c} hover:${c} border-0`}>{STATUS_LABELS[status || ""] || status || "Pending"}</Badge>;
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: stats } = useQuery<{ total: number; eligible: number; needsReview: number; filed: number; drafted: number }>({
    queryKey: ["/api/cases/stats"],
  });

  const { data: cases, isLoading } = useQuery<ExpungementCase[]>({
    queryKey: ["/api/cases"],
  });

  const filtered = (cases || [])
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .sort((a, b) => (b.id || 0) - (a.id || 0));

  const dispLabel = (dt: string | null) => {
    const map: Record<string, string> = {
      acquittal: "Acquittal", dismissal: "Dismissal", nolle_prosequi: "Nolle Prosequi",
      stet: "Stet", pbj: "PBJ", pbj_no_longer_crime: "PBJ (not a crime)",
      pbj_dui: "PBJ DUI", not_criminally_responsible: "NCR",
      guilty_no_longer_crime: "Guilty (not a crime)", guilty_nuisance: "Guilty (nuisance)",
      guilty_cannabis: "Guilty (cannabis)", guilty_misdemeanor: "Guilty (misdemeanor)",
      guilty_felony: "Guilty (felony)", guilty_burglary_theft: "Guilty (burglary/theft)",
      guilty_domestic: "Guilty (domestic)", guilty_pardon: "Guilty (pardon)",
      compromise: "Compromise",
    };
    return map[dt || ""] || dt || "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1B2A4A]">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Maryland expungement case management</p>
        </div>
        <Button className="bg-[#01696F] hover:bg-[#015258]" onClick={() => navigate("/case/new")} data-testid="button-new-case">
          <Plus className="w-4 h-4 mr-2" /> New Case
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Cases" value={stats?.total || 0} icon={Folder} color="bg-[#1B2A4A]" />
        <StatCard label="Eligible" value={stats?.eligible || 0} icon={CheckCircle} color="bg-emerald-600" />
        <StatCard label="Needs Review" value={stats?.needsReview || 0} icon={AlertTriangle} color="bg-amber-500" />
        <StatCard label="Petitions Drafted" value={stats?.drafted || 0} icon={FileText} color="bg-purple-600" />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[#1B2A4A]">Cases</h2>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" data-testid="select-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="intake">Intake</SelectItem>
            <SelectItem value="screening">Screening</SelectItem>
            <SelectItem value="eligible">Eligible</SelectItem>
            <SelectItem value="petition_drafted">Petition Drafted</SelectItem>
            <SelectItem value="filed">Filed</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading cases...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No cases found.{" "}
              <button className="text-[#01696F] underline" onClick={() => navigate("/case/new")}>
                Create your first case
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Case #</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Defendant</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Disposition</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Eligibility</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/case/${c.id}`)}
                      data-testid={`row-case-${c.id}`}
                    >
                      <td className="p-3 font-mono text-xs">{c.caseNumber}</td>
                      <td className="p-3">{c.defendantName}</td>
                      <td className="p-3">{dispLabel(c.dispositionType)}</td>
                      <td className="p-3">{eligBadge(c.eligibilityStatus)}</td>
                      <td className="p-3">{statusBadge(c.status)}</td>
                      <td className="p-3 text-muted-foreground">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
