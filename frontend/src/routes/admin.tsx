import {
  Ban, ChevronLeft, ChevronRight, CircleDollarSign, FolderKanban, LayoutDashboard,
  LifeBuoy, LoaderCircle, Pencil, Search, Settings, ShieldCheck, UserRound, Users,
  BarChart3, Cpu, Library,
  X, ArrowUpDown,
} from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { appConfig } from "@/lib/app-config";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Section = "dashboard" | "users" | "templates" | "analytics" | "payments" | "system" | "settings" | "support" | "projects" | "pricing";
type AdminUser = {
  id: string; email?: string; created_at?: string; last_sign_in_at?: string | null;
  banned_until?: string | null; user_metadata?: { display_name?: string };
};
type AdminTicket = {
  id: string; user_id: string; subject: string; description: string; category: string;
  status: "open" | "pending" | "resolved" | "closed"; priority: "low" | "normal" | "high" | "urgent";
  created_at: string; updated_at: string;
};
type Overview = Record<string, number | string>;
type AdminResponse = {
  error?: string;
  users?: AdminUser[];
  hasMore?: boolean;
  items?: unknown[];
  payments?: unknown[];
  [key: string]: unknown;
};

const sections: Array<{ id: Section; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "templates", label: "Templates", icon: Library },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "payments", label: "Payments", icon: CircleDollarSign },
  { id: "system", label: "System", icon: Cpu },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "support", label: "Support", icon: LifeBuoy },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "pricing", label: "Pricing & Plans", icon: ArrowUpDown },
];

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "KREATIVE Admin Panel" }] }),
  component: AdminPage,
});

function AdminPage() {
  const [section, setSection] = useState<Section>("dashboard");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [overview, setOverview] = useState<Overview>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [hasMoreUsers, setHasMoreUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [records, setRecords] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  const request = async (path: string, init: RequestInit = {}) => {
    const token = localStorage.getItem("kreative.auth.token") ?? "";
    const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...init.headers },
    });
    const body = (await response.json().catch(() => ({}))) as AdminResponse;
    if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
    return body;
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (section === "dashboard") setOverview(await request("/admin/overview") as Overview);
      else if (section === "users") {
        const data = await request(`/admin/users?page=${userPage}&limit=25&search=${encodeURIComponent(userSearch)}`);
        setUsers(data.users ?? []);
        setHasMoreUsers(Boolean(data.hasMore));
      } else if (section === "analytics" || section === "system") {
        const data = await request(`/admin/${section}`);
        setRecords([data]);
      } else {
        const endpoint = section === "pricing" ? "pricing" : section;
        const data = await request(`/admin/${endpoint}`);
        setRecords(
          section === "support"
            ? ((data["tickets"] as unknown[]) ?? [])
            : (data.items ?? data.payments ?? []),
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load admin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [section, userPage, userSearch]);

  const updateUser = async (user: AdminUser, action: "ban" | "upgrade" | "downgrade") => {
    try {
      if (action === "ban") {
        await request(`/admin/users/${user.id}/ban`, {
          method: "POST",
          body: JSON.stringify({ banned: !user.banned_until, reason: "Administrative action" }),
        });
        setNotice(user.banned_until ? "User unbanned." : "User banned.");
      } else {
        await request(`/admin/users/${user.id}/entitlement`, {
          method: "POST",
          body: JSON.stringify({ tier: action === "upgrade" ? "K-PRO" : "K-GO", days: 30 }),
        });
        setNotice(action === "upgrade" ? "User upgraded to K-PRO." : "User changed to K-GO.");
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "User update failed.");
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r bg-card p-4 md:block">
          <Link to="/" className="mb-8 block px-3">
            <div className="text-[10px] tracking-[0.25em] text-primary">KREATIVE CONTROL</div>
            <div className="mt-2 font-display text-lg">Admin Console</div>
          </Link>
          <nav className="space-y-1">
            {sections.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} onClick={() => { setSection(item.id); setUserPage(1); }}
                  className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-sm ${section === item.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                  <Icon className="h-4 w-4" />{item.label}
                </button>
              );
            })}
          </nav>
          <Link to="/" className="mt-8 flex items-center gap-2 px-3 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Back to Studio
          </Link>
        </aside>
        <section className="min-w-0 flex-1 p-4 md:p-8">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Administration / {section}</div>
              <h1 className="mt-2 font-display text-2xl capitalize">{sections.find((item) => item.id === section)?.label}</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /> Verified admin</span>
              <Link to="/" className="rounded border px-3 py-2 text-sm hover:bg-secondary">Studio</Link>
            </div>
          </header>
          {notice && <div className="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}
          {error && <div className="mb-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {loading ? <div className="flex min-h-64 items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-primary" /></div> :
            section === "dashboard" ? <Dashboard overview={overview} /> :
            section === "users" ? <UsersView users={users} search={userSearch} onSearch={(value) => { setUserPage(1); setUserSearch(value); }} onSelect={setSelectedUser} onAction={updateUser} page={userPage} hasMore={hasMoreUsers} onPage={setUserPage} /> :
            section === "support" ? <SupportQueue tickets={records as AdminTicket[]} request={request} onNotice={setNotice} onError={setError} /> :
            section === "analytics" ? <AnalyticsView data={(records[0] ?? {}) as Record<string, unknown>} /> :
            section === "templates" ? <TemplateManager records={records} request={request} onNotice={setNotice} onError={setError} onReload={load} /> :
            <RecordView section={section} records={records} onUpdate={async (id, body) => {
              try { await request(`/admin/${section === "pricing" ? "pricing" : section}/${id}`, { method: "PATCH", body: JSON.stringify(body) }); setNotice("Changes saved."); await load(); }
              catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save changes."); }
            }} />}
        </section>
      </div>
      {selectedUser && <UserModal user={selectedUser} request={request} onClose={() => setSelectedUser(null)} onAction={updateUser} />}
    </main>
  );
}

function AnalyticsView({ data }: { data: Record<string, unknown> }) {
  const summary = (data["summary"] ?? data) as Record<string, unknown>;
  const series = Array.isArray(data["series"]) ? data["series"] : [];
  const chartData = series.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      date: String(row["day"] ?? row["date"] ?? "").slice(5, 10),
      users: Number(row["user_signups"] ?? 0),
      templates: Number(row["template_applications"] ?? 0),
      revenue: Number(row["revenue_usd"] ?? 0),
    };
  });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Template applications", String(summary["template_applications"] ?? "—")],
          ["Successful payments", String(summary["successful_payments"] ?? "—")],
          ["Active entitlements", String(summary["active_entitlements"] ?? "—")],
          ["Recorded failures", String(summary["recorded_failures"] ?? "—")],
        ].map(([label, value]) => (
          <div className="rounded-lg border bg-card p-5" key={String(label)}>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-2 text-2xl font-semibold">{String(value ?? "—")}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="User registrations">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ background: "var(--popover)", borderColor: "var(--border)" }} />
                <Line type="monotone" dataKey="users" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No registration history is available yet." />}
        </ChartCard>
        <ChartCard title="Template usage and revenue">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" />
                <YAxis yAxisId="left" allowDecimals={false} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ background: "var(--popover)", borderColor: "var(--border)" }} />
                <Bar yAxisId="left" dataKey="templates" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No template usage history is available yet." />}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border bg-card p-4"><h2 className="mb-3 font-medium">{title}</h2>{children}</section>;
}

function EmptyChart({ message }: { message: string }) {
  return <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">{message}</div>;
}

function TemplateManager({
  records,
  request,
  onNotice,
  onError,
  onReload,
}: {
  records: unknown[];
  request: (path: string, init?: RequestInit) => Promise<AdminResponse>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("vocal");
  const [description, setDescription] = useState("");
  const [pluginChain, setPluginChain] = useState("[]");
  const templates = records as Array<Record<string, unknown>>;
  const close = () => {
    setOpen(false);
    setStep(1);
    setName("");
    setSlug("");
    setDescription("");
    setPluginChain("[]");
  };
  const save = async () => {
    try {
      const parsedChain = JSON.parse(pluginChain) as unknown;
      if (!Array.isArray(parsedChain)) throw new Error("Processor chain must be a JSON array.");
      await request("/admin/templates", {
        method: "POST",
        body: JSON.stringify({ name, slug, category, description, plugin_chain: parsedChain }),
      });
      close();
      onNotice("Template draft saved.");
      await onReload();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to save template.");
    }
  };
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div><div className="font-medium">Audio templates</div><div className="text-xs text-muted-foreground">Drafts and published processing plans</div></div>
        <button onClick={() => setOpen(true)} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">Add Template</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="p-4">Name</th><th className="p-4">Category</th><th className="p-4">Version</th><th className="p-4">Status</th></tr></thead>
          <tbody>          {templates.map((template, index) => <tr className="border-b last:border-0" key={String(template["id"] ?? index)}><td className="p-4 font-medium">{String(template["name"] ?? "Unnamed")}</td><td className="p-4 text-muted-foreground">{String(template["category"] ?? "—")}</td><td className="p-4">{String(template["template_version"] ?? 1)}</td><td className="p-4">{String(template["status"] ?? "draft")}</td></tr>)}</tbody>
        </table>
      </div>
      {!templates.length && <div className="p-8 text-center text-sm text-muted-foreground">No templates found.</div>}
      {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-xl rounded-lg border bg-card p-5 shadow-2xl">
          <div className="flex items-center justify-between"><h2 className="font-display text-lg">Add New Template</h2><button onClick={close} aria-label="Close template wizard"><X className="h-4 w-4" /></button></div>
          <div className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">Step {step} of 3</div>
          {step === 1 && <div className="mt-4 space-y-3"><label className="block text-sm">Template name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border bg-background p-2" /></label><label className="block text-sm">Slug<input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} className="mt-1 w-full rounded border bg-background p-2" /></label><label className="block text-sm">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded border bg-background p-2"><option value="vocal">Vocal</option><option value="vocal-support">Vocal Support</option><option value="two-track-beat">Two-Track Beat</option><option value="full-mix">Full Mix</option><option value="mastering">Mastering</option></select></label><label className="block text-sm">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 min-h-24 w-full rounded border bg-background p-2" /></label></div>}
          {step === 2 && <label className="mt-4 block text-sm">Processor chain JSON<textarea value={pluginChain} onChange={(event) => setPluginChain(event.target.value)} className="mt-1 min-h-40 w-full rounded border bg-background p-2 font-mono text-xs" /><span className="mt-1 block text-xs text-muted-foreground">Use the existing plugin identifiers. The backend validates the array shape before persistence.</span></label>}
          {step === 3 && <div className="mt-4 rounded border p-3 text-sm"><div><span className="text-muted-foreground">Name:</span> {name || "—"}</div><div><span className="text-muted-foreground">Slug:</span> {slug || "—"}</div><div><span className="text-muted-foreground">Category:</span> {category}</div><div><span className="text-muted-foreground">Processors:</span> {pluginChain}</div></div>}
          <div className="mt-6 flex justify-end gap-2"><button onClick={close} className="rounded border px-3 py-2 text-sm">Cancel</button>{step > 1 && <button onClick={() => setStep(step - 1)} className="rounded border px-3 py-2 text-sm">Back</button>}{step < 3 ? <button disabled={step === 1 && (!name.trim() || !slug.trim())} onClick={() => setStep(step + 1)} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Next</button> : <button onClick={() => void save()} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">Save Draft</button>}</div>
        </div>
      </div>}
    </section>
  );
}

function Dashboard({ overview }: { overview: Overview }) {
  const cards = [
    ["Total users", overview["total_users"] ?? "—", Users],
    ["Active subscriptions", overview["active_subscriptions"] ?? "—", UserRound],
    ["Published templates", overview["published_templates"] ?? "—", Library],
    ["Templates used", overview["templates_used"] ?? "—", BarChart3],
    ["Gross USD revenue", overview["gross_usd_revenue"] ? `$${overview["gross_usd_revenue"]}` : "—", CircleDollarSign],
    ["Expired entitlements", overview["expired_entitlements"] ?? "—", Ban],
  ] as const;
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value, Icon]) =>
    <div key={label} className="rounded-lg border bg-card p-5"><Icon className="h-5 w-5 text-primary" /><div className="mt-6 text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>)}</div>;
}

function UsersView({ users, search, onSearch, onSelect, onAction, page, hasMore, onPage }: {
  users: AdminUser[]; search: string; onSearch: (value: string) => void; onSelect: (user: AdminUser) => void;
  onAction: (user: AdminUser, action: "ban" | "upgrade" | "downgrade") => void; page: number; hasMore: boolean; onPage: (page: number) => void;
}) {
  return <section className="rounded-lg border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <div className="font-medium">User management</div>
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Filter email, name, or ID" className="w-72 rounded border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" /></div>
    </div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="p-4">User</th><th className="p-4">Created</th><th className="p-4">Last sign-in</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead>
      <tbody>{users.map((user) => <tr key={user.id} onClick={() => onSelect(user)} className="cursor-pointer border-b last:border-0 hover:bg-secondary/50">
        <td className="p-4"><div className="font-medium">{user.user_metadata?.display_name || user.email || "Unnamed user"}</div><div className="text-xs text-muted-foreground">{user.email} · {user.id.slice(0, 8)}...</div></td>
        <td className="p-4 text-muted-foreground">{formatDate(user.created_at)}</td><td className="p-4 text-muted-foreground">{formatDate(user.last_sign_in_at)}</td>
        <td className="p-4">{user.banned_until ? <span className="text-red-400">Banned</span> : <span className="text-emerald-400">Active</span>}</td>
        <td className="p-4" onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-1">
          <ActionButton title={user.banned_until ? "Unban user" : "Ban user"} onClick={() => onAction(user, "ban")}><Ban className="h-4 w-4" /></ActionButton>
          <ActionButton title="Upgrade to K-PRO" onClick={() => onAction(user, "upgrade")}><ArrowUpDown className="h-4 w-4 text-primary" /></ActionButton>
          <ActionButton title="Downgrade to K-GO" onClick={() => onAction(user, "downgrade")}><ArrowUpDown className="h-4 w-4 rotate-180" /></ActionButton>
        </div></td>
      </tr>)}</tbody>
    </table></div>
    <div className="flex items-center justify-between border-t p-3 text-sm text-muted-foreground"><span>Page {page}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => onPage(page - 1)} className="rounded border p-1.5 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><button disabled={!hasMore} onClick={() => onPage(page + 1)} className="rounded border p-1.5 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div></div>
  </section>;
}

function SupportQueue({ tickets, request, onNotice, onError }: {
  tickets: AdminTicket[];
  request: (path: string, init?: RequestInit) => Promise<AdminResponse>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [selected, setSelected] = useState<AdminTicket | null>(null);
  const [messages, setMessages] = useState<Array<{ id: string; body: string; sender_role: "user" | "admin"; created_at: string }>>([]);
  const [reply, setReply] = useState("");
  const filtered = tickets.filter((ticket) =>
    (!statusFilter || ticket.status === statusFilter) &&
    (!priorityFilter || ticket.priority === priorityFilter) &&
    JSON.stringify(ticket).toLowerCase().includes(filter.toLowerCase()),
  );
  const openTicket = async (ticket: AdminTicket) => {
    try {
      const data = await request(`/admin/support/${ticket.id}`);
      setSelected(ticket);
      setMessages((data["messages"] as typeof messages) ?? []);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to load support conversation.");
    }
  };
  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    try {
      await request(`/admin/support/${selected.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: reply, status: "pending" }),
      });
      setReply("");
      onNotice("Reply emailed to the user.");
      await openTicket(selected);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to send support reply.");
    }
  };
  const changeStatus = async (nextStatus: AdminTicket["status"]) => {
    if (!selected) return;
    try {
      await request(`/admin/support/${selected.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, updated_at: new Date().toISOString() }) });
      setSelected({ ...selected, status: nextStatus });
      onNotice("Ticket status updated.");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to update ticket.");
    }
  };
  return <section className="grid min-h-[600px] gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]">
    <div className="rounded-lg border bg-card">
      <div className="border-b p-4"><div className="font-medium">Support queue</div><div className="mt-3 flex gap-2"><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search tickets" className="min-w-0 flex-1 rounded border bg-background px-2 py-1.5 text-xs" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded border bg-background px-1 text-xs"><option value="">All status</option><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></div><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="mt-2 w-full rounded border bg-background px-2 py-1.5 text-xs"><option value="">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></div>
      <div className="max-h-[500px] overflow-y-auto">{filtered.map((ticket) => <button key={ticket.id} onClick={() => void openTicket(ticket)} className={`w-full border-b p-3 text-left hover:bg-secondary/60 ${selected?.id === ticket.id ? "bg-primary/10" : ""}`}><div className="flex items-start justify-between gap-2"><span className="truncate text-sm font-medium">{ticket.subject}</span><span className={`text-[10px] ${ticket.priority === "urgent" ? "text-red-400" : ticket.priority === "high" ? "text-yellow-400" : "text-muted-foreground"}`}>{ticket.priority}</span></div><div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{ticket.category} · {ticket.status}</span><span>{formatDate(ticket.updated_at)}</span></div></button>)}{!filtered.length && <div className="p-6 text-center text-xs text-muted-foreground">No tickets match these filters.</div>}</div>
    </div>
    <div className="flex min-h-[600px] flex-col rounded-lg border bg-card">{selected ? <><header className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><div className="text-xs text-muted-foreground">{selected.category} · {selected.priority} · {selected.user_id}</div><h2 className="mt-1 font-medium">{selected.subject}</h2></div><select value={selected.status} onChange={(event) => void changeStatus(event.target.value as AdminTicket["status"])} className="rounded border bg-background px-2 py-1.5 text-xs"><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></header><div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"><div className="max-w-[85%] rounded border bg-background p-3 text-sm"><div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Original ticket</div>{selected.description}</div>{messages.map((message) => <div key={message.id} className={`max-w-[85%] rounded border p-3 text-sm ${message.sender_role === "admin" ? "ml-auto bg-primary/10" : "bg-background"}`}><div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{message.sender_role === "admin" ? "Your reply" : "User message"}</div>{message.body}</div>)}</div><form onSubmit={sendReply} className="flex gap-2 border-t p-3"><textarea required value={reply} onChange={(event) => setReply(event.target.value)} rows={2} placeholder="Reply by email..." className="min-w-0 flex-1 resize-none rounded border bg-background p-2 text-sm" /><button className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Email reply</button></form></> : <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground"><div><LifeBuoy className="mx-auto mb-3 h-8 w-8 text-primary" />Select a ticket from the queue to view the conversation.</div></div>}</div>
  </section>;
}

function UserModal({ user, request, onClose, onAction }: { user: AdminUser; request: (path: string, init?: RequestInit) => Promise<Record<string, unknown>>; onClose: () => void; onAction: (user: AdminUser, action: "ban" | "upgrade" | "downgrade") => void }) {
  const [details, setDetails] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { void request(`/admin/users/${user.id}`).then(setDetails).catch(() => setDetails({ error: "Unable to load details." })); }, [user.id]);
  const entitlements = (details?.["entitlements"] as Array<Record<string, unknown>> | undefined) ?? [];
  const payments = (details?.["payments"] as Array<Record<string, unknown>> | undefined) ?? [];
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}><section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
    <div className="flex items-start justify-between"><div><div className="text-xs uppercase tracking-wider text-muted-foreground">User details</div><h2 className="mt-1 text-xl font-semibold">{user.email}</h2></div><button onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-5 w-5" /></button></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-2">{[["User ID", user.id], ["Created", formatDate(user.created_at)], ["Last sign-in", formatDate(user.last_sign_in_at)], ["Status", user.banned_until ? "Banned" : "Active"]].map(([label, value]) => <div className="rounded border bg-background p-3" key={label}><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 break-all text-sm">{value}</div></div>)}</div>
    <div className="mt-6 flex flex-wrap gap-2"><button onClick={() => onAction(user, "ban")} className="rounded border px-3 py-2 text-sm hover:bg-secondary">{user.banned_until ? "Unban user" : "Ban user"}</button><button onClick={() => onAction(user, "upgrade")} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">Upgrade to K-PRO</button><button onClick={() => onAction(user, "downgrade")} className="rounded border px-3 py-2 text-sm">Set K-GO</button></div>
    <div className="mt-8 grid gap-6 sm:grid-cols-2"><DataList title="Entitlements" rows={entitlements} /><DataList title="Payments" rows={payments} /></div>
  </section></div>;
}

function DataList({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) {
  return <div><h3 className="mb-2 text-sm font-medium">{title}</h3>{rows.length ? <div className="space-y-2">{rows.slice(0, 5).map((row, index) => <div className="rounded border p-3 text-xs" key={String(row["id"] ?? index)}>{Object.entries(row).slice(0, 4).map(([key, value]) => <div className="flex justify-between gap-3" key={key}><span className="text-muted-foreground">{key}</span><span>{String(value)}</span></div>)}</div>)}</div> : <div className="rounded border p-3 text-xs text-muted-foreground">No records.</div>}</div>;
}

function RecordView({ section, records, onUpdate }: { section: Section; records: unknown[]; onUpdate: (id: string, body: Record<string, unknown>) => Promise<void> }) {
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => records.filter((record) => JSON.stringify(record).toLowerCase().includes(filter.toLowerCase())), [records, filter]);
  const editable = section !== "payments";
  return <section className="rounded-lg border bg-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div className="font-medium">{section === "pricing" ? "Plan catalog" : `${section.toUpperCase()} records`}</div><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter records" className="w-64 rounded border bg-background py-2 pl-9 pr-3 text-sm" /></div></div><div className="divide-y">{filtered.length ? filtered.map((record, index) => { const item = record as Record<string, unknown>; const id = String(item["id"] ?? item["key"] ?? index); return <div className="flex items-center justify-between gap-4 p-4" key={id}><div><div className="font-medium">{String(item["label"] ?? item["subject"] ?? item["name"] ?? item["key"] ?? id)}</div><div className="mt-1 max-w-2xl truncate text-xs text-muted-foreground">{JSON.stringify(item)}</div></div>{editable && <button title="Edit record" onClick={() => { const value = window.prompt("Enter JSON fields to merge", "{}"); if (value) void onUpdate(id, JSON.parse(value)); }} className="rounded border p-2 hover:bg-secondary"><Pencil className="h-4 w-4" /></button>}</div>; }) : <div className="p-8 text-center text-sm text-muted-foreground">No records found. Apply the admin console migration if this section is unavailable.</div>}</div></section>;
}

function ActionButton({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return <button title={title} aria-label={title} onClick={onClick} className="rounded border p-2 hover:bg-secondary">{children}</button>;
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "Never";
}
