import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, Eye, EyeOff, LifeBuoy, LogOut, UserRound, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { appConfig } from "@/lib/app-config";

type User = { id: string; email: string; displayName?: string };
type Tier = "K_GO" | "K_PRO";
type Modal = "login" | "signup" | "reset" | "pricing" | "billing" | "checkout" | "support" | null;
type BillingAccount = {
  plan: "K-GO" | "K-PRO" | null;
  sessionsRemaining: number;
  sessionsLimit: number;
  sessionsUsed?: number;
  expiresAt?: string;
  cancelAtPeriodEnd?: boolean;
  unlimited?: boolean;
  isAdmin?: boolean;
};

const plans = [
  {
    id: "K_GO" as const,
    label: "K-GO",
    price: "39.95",
    renders: 3,
    benefits: ["3 mix and master sessions per month", "Browser-based mixer, plugins, buses, and sends", "Project export tools"],
  },
  {
    id: "K_PRO" as const,
    label: "K-PRO",
    price: "59.95",
    renders: 6,
    benefits: ["6 mix and master sessions per month", "Browser-based mixer, plugins, buses, and sends", "Project export tools"],
  },
];

function api(path: string, init: RequestInit = {}, token?: string) {
  return fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...init.headers,
    },
  });
}

export function AccountMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState(() =>
    typeof window === "undefined" ? "" : (localStorage.getItem("kreative.auth.token") ?? ""),
  );
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [admin, setAdmin] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
  const [billing, setBilling] = useState<BillingAccount | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("kreative.auth.user");
    if (stored) setUser(JSON.parse(stored) as User);
  }, []);

  useEffect(() => {
    if (!token) return;
    void api("/account/admin-status", {}, token)
      .then((response) => (response.ok ? response.json() : { isAdmin: false }))
      .then((data: { isAdmin: boolean }) => setAdmin(data.isAdmin));
    void api("/support/unread-count", {}, token)
      .then((response) => (response.ok ? response.json() : { count: 0 }))
      .then((data: { count: number }) => setSupportUnread(data.count));
    void api("/billing/account", {}, token)
      .then((response) => (response.ok ? response.json() : { plan: null }))
      .then((data: BillingAccount) => {
        setBilling(data.plan ? data : null);
        window.dispatchEvent(new Event("kreative:billing-updated"));
      });
  }, [token]);

  const logout = () => {
    localStorage.removeItem("kreative.auth.token");
    localStorage.removeItem("kreative.auth.user");
    setToken("");
    setUser(null);
    setAdmin(false);
    setSupportUnread(0);
    setBilling(null);
    setOpen(false);
  };

  const openPricing = () => {
    setOpen(false);
    setModal("pricing");
  };
  return (
    <>
      <div className="relative">
        <button
          className="daw-btn h-8 w-8 rounded-full"
          title={user ? "Account" : "Log in"}
          onClick={() => setOpen((value) => !value)}
        >
          {user ? (
            <span className="text-[10px] font-bold">
              {(user.displayName ?? user.email)[0]?.toUpperCase()}
            </span>
          ) : (
            <UserRound className="h-4 w-4" />
          )}
        </button>
        {open && (
          <div className="absolute right-0 top-10 z-50 w-64 rounded-md border bg-popover p-2 text-sm shadow-2xl">
            {user ? (
              <>
                <div className="border-b px-3 pb-3">
                  <div className="font-semibold">{user.displayName ?? "KREATIVE member"}</div>
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                  <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {billing?.unlimited
                    ? "Admin access · Unlimited sessions"
                    : billing
                      ? `${billing.plan} · ${billing.sessionsRemaining} sessions remaining`
                      : "No active plan"}
                  </div>
                </div>
                <MenuButton onClick={() => setModal("billing")}>
                  Billing & Subscription
                </MenuButton>
                <MenuButton
                  onClick={() => {
                    setSupportUnread(0);
                    setModal("support");
                  }}
                >
                  <LifeBuoy className="mr-2 h-3.5 w-3.5" />
                  Support
                  {supportUnread > 0 && (
                    <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground">
                      {supportUnread > 99 ? "99+" : supportUnread}
                    </span>
                  )}
                </MenuButton>
                {admin && (
                  <Link
                    to="/admin"
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center rounded px-3 py-2 text-left hover:bg-secondary"
                  >
                    Admin Panel
                  </Link>
                )}
                <div className="my-2 border-t" />
                <MenuButton onClick={logout}>
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  Log Out
                </MenuButton>
              </>
            ) : (
              <>
                <MenuButton
                  onClick={() => {
                    setOpen(false);
                    setModal("login");
                  }}
                >
                  Log In
                </MenuButton>
                <MenuButton
                  onClick={() => {
                    setOpen(false);
                    setModal("signup");
                  }}
                >
                  Sign Up
                </MenuButton>
                <MenuButton onClick={openPricing}>Pricing / Upgrade</MenuButton>
              </>
            )}
          </div>
        )}
      </div>
      {modal && (
        <Overlay onClose={() => setModal(null)}>
          {modal === "pricing" && (
            <Pricing
              onChoose={(tier) => {
                setSelectedTier(tier);
                setModal(user ? "checkout" : "login");
              }}
            />
          )}
          {modal === "billing" && (
            <BillingCenter
              token={token}
              billing={billing}
              onRefresh={(next) => {
                setBilling(next);
                window.dispatchEvent(new Event("kreative:billing-updated"));
              }}
              onUpgrade={() => setModal("pricing")}
            />
          )}
          {modal === "checkout" && selectedTier && (
            <Checkout tier={selectedTier} token={token} onBack={() => setModal("pricing")} />
          )}
          {modal === "support" && <SupportCenter token={token} />}
          {(modal === "login" || modal === "signup" || modal === "reset") && (
            <AuthForm
              mode={modal}
              onForgot={() => setModal("reset")}
              onSwitch={() => setModal(modal === "login" ? "signup" : "login")}
              onSuccess={(nextUser, nextToken) => {
                setUser(nextUser);
                setToken(nextToken);
                localStorage.setItem("kreative.auth.user", JSON.stringify(nextUser));
                localStorage.setItem("kreative.auth.token", nextToken);
                setModal(selectedTier ? "checkout" : null);
              }}
            />
          )}
        </Overlay>
      )}
    </>
  );
}

function MenuButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      className="flex w-full items-center rounded px-3 py-2 text-left hover:bg-secondary"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
      onMouseDown={(event) => event.target === ref.current && onClose()}
    >
      <div className="relative max-h-full w-full max-w-3xl">
        {children}
        <button
          type="button"
          className="daw-btn absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center"
          onClick={onClose}
          aria-label="Close account dialog"
          title="Close"
        >
        </button>
      </div>
    </div>
  );
}

function AuthForm({
  mode,
  onForgot,
  onSwitch,
  onSuccess,
}: {
  mode: "login" | "signup" | "reset";
  onForgot: () => void;
  onSwitch: () => void;
  onSuccess: (user: User, token: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "signup" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `${appConfig.supabase?.url}/auth/v1/${mode === "signup" ? "signup" : mode === "reset" ? "recover" : "token?grant_type=password"}`,
        {
          method: "POST",
          headers: {
            apikey: appConfig.supabase?.anonKey ?? "",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
            ...(mode === "signup" ? { data: { display_name: displayName } } : {}),
          }),
        },
      );
      const data = (await response.json()) as {
        access_token?: string;
        user?: { id: string; email?: string };
        msg?: string;
        error_description?: string;
      };
      if (!response.ok)
        throw new Error(data.error_description ?? data.msg ?? "Authentication failed.");
      if (mode === "reset") {
        setError("If that address is registered, a reset email has been sent.");
        return;
      }
      if (!data.access_token || !data.user?.id || !data.user.email)
        throw new Error("Check your email to verify your account before signing in.");
      onSuccess({ id: data.user.id, email: data.user.email, displayName }, data.access_token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow-2xl">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-lg">
          {mode === "signup" ? "Create account" : mode === "reset" ? "Reset password" : "Log in"}
        </h2>
        <X className="h-4 w-4" />
      </div>
      <form className="space-y-3" onSubmit={submit}>
        {mode === "signup" && (
          <input
            className="w-full rounded border bg-background p-2"
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        )}
        <input
          className="w-full rounded border bg-background p-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {mode !== "reset" && (
          <>
            <div className="flex rounded border bg-background">
              <input
                className="min-w-0 flex-1 bg-transparent p-2 outline-none"
                type={show ? "text" : "password"}
                placeholder="Password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" className="px-2" onClick={() => setShow(!show)}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {mode === "signup" && (
              <input
                className="w-full rounded border bg-background p-2"
                type="password"
                placeholder="Confirm password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            )}
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          className="w-full rounded bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50"
          disabled={busy}
        >
          {busy
            ? "Working…"
            : mode === "signup"
              ? "Create account"
              : mode === "reset"
                ? "Send reset email"
                : "Log in"}
        </button>
      </form>
      <div className="mt-4 flex justify-between text-xs text-muted-foreground">
        {mode === "login" && <button onClick={onForgot}>Forgot password?</button>}
        {mode !== "reset" && (
          <button onClick={onSwitch}>
            {mode === "login" ? "Create an account" : "Already have an account?"}
          </button>
        )}
      </div>
    </section>
  );
}

function BillingCenter({
  token,
  billing,
  onRefresh,
  onUpgrade,
}: {
  token: string;
  billing: BillingAccount | null;
  onRefresh: (billing: BillingAccount | null) => void;
  onUpgrade: () => void;
}) {
  const [status, setStatus] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const cancelPlan = () => {
    setCancelling(true);
    void api("/billing/cancel", { method: "POST" }, token)
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "Unable to cancel plan.");
        }
        onRefresh(billing ? { ...billing, cancelAtPeriodEnd: true } : null);
        setStatus("Your plan is scheduled to end at the current billing period.");
      })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Unable to cancel plan."))
      .finally(() => setCancelling(false));
  };

  return (
    <section className="w-full max-w-md rounded-lg border bg-card p-6">
      <h2 className="font-display text-xl">Billing & subscription</h2>
      {billing ? (
        <>
          <div className="mt-5 rounded border bg-background p-4">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg">{billing.plan}</span>
              <span className="text-sm text-muted-foreground">
                {billing.unlimited
                  ? "Unlimited access"
                  : `${billing.sessionsRemaining} / ${billing.sessionsLimit} sessions left`}
              </span>
            </div>
            {!billing.unlimited && (
              <div className="mt-3 h-2 overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{
                    width: `${(billing.sessionsRemaining / billing.sessionsLimit) * 100}%`,
                  }}
                />
              </div>
            )}
            {billing.expiresAt && (
              <div className="mt-3 text-xs text-muted-foreground">
                Current period ends {new Date(billing.expiresAt).toLocaleDateString()}
              </div>
            )}
          </div>
          <button
            className="mt-5 w-full rounded bg-primary px-3 py-2 font-semibold text-primary-foreground"
            onClick={onUpgrade}
          >
            Upgrade or change plan
          </button>
          {!billing.unlimited && !billing.cancelAtPeriodEnd && (
            <button
              className="mt-2 w-full rounded border px-3 py-2 text-sm text-destructive disabled:opacity-50"
              disabled={cancelling}
              onClick={cancelPlan}
            >
              {cancelling ? "Scheduling cancellation…" : "Cancel plan at period end"}
            </button>
          )}
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            You do not have an active plan. Choose a plan to receive monthly mix and master sessions.
          </p>
          <button
            className="mt-5 w-full rounded bg-primary px-3 py-2 font-semibold text-primary-foreground"
            onClick={onUpgrade}
          >
            View plans
          </button>
        </>
      )}
      {status && <p className="mt-4 text-xs text-muted-foreground">{status}</p>}
    </section>
  );
}

function Pricing({ onChoose }: { onChoose: (tier: Tier) => void }) {
  return (
    <section className="w-full max-w-3xl rounded-lg border bg-card p-6">
      <h2 className="font-display text-xl">Choose your access</h2>
      <p className="mt-1 text-muted-foreground">
        Monthly access with a fixed number of mix and master sessions. Cancel before your next period.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <div className="rounded border bg-background p-5" key={plan.id}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg">{plan.label}</h3>
              <span className="text-xl font-bold">
                ${plan.price}
                <small className="text-xs font-normal"> / month</small>
              </span>
            </div>
            <ul className="my-5 space-y-2 text-sm">
              {plan.benefits.map((benefit) => (
                <li key={benefit} className="flex gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  {benefit}
                </li>
              ))}
            </ul>
            <button
              className="w-full rounded bg-primary px-3 py-2 font-semibold text-primary-foreground"
              onClick={() => onChoose(plan.id)}
            >
              Subscribe Now
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Checkout({ tier, token, onBack }: { tier: Tier; token: string; onBack: () => void }) {
  const [status, setStatus] = useState("Preparing checkout");
  const plan = plans.find((item) => item.id === tier)!;
  useEffect(() => {
    void api("/billing/paypal/orders", { method: "POST", body: JSON.stringify({ tier }) }, token)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            ((await response.json()) as { error?: string }).error ?? "Unable to prepare checkout.",
          );
        setStatus("Waiting for payment");
      })
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : "Checkout is unavailable."),
      );
  }, [tier, token]);
  return (
    <section className="w-full max-w-md rounded-lg border bg-card p-6">
      <h2 className="font-display text-lg">Checkout — {plan.label}</h2>
      <p className="mt-3 text-2xl font-bold">
        ${plan.price}{" "}
        <span className="text-sm font-normal text-muted-foreground">USD / one month</span>
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Your plan includes the monthly session allowance shown above. Billing and cancellation are managed from your account menu.
      </p>
      <div className="my-6 rounded border p-4 text-sm">{status}</div>
      <p className="text-xs text-muted-foreground">
        The official PayPal button is enabled after PayPal client configuration and server-side
        capture verification are completed.
      </p>
      <button className="mt-5 rounded border px-3 py-2" onClick={onBack}>
        Back to plans
      </button>
    </section>
  );
}

type SupportTicket = {
  id: string;
  subject: string;
  description: string;
  status: "open" | "pending" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  category: string;
  created_at: string;
  updated_at: string;
};

function SupportCenter({ token }: { token: string }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<Array<{ id: string; sender_role: "user" | "admin"; body: string; created_at: string }>>([]);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("Loading support...");

  const loadTickets = () => {
    void api("/support/tickets", {}, token)
      .then(async (response) => {
        if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "Unable to load support.");
        const data = (await response.json()) as { tickets: SupportTicket[] };
        setTickets(data.tickets);
        setStatus("");
      })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Unable to load support."));
  };
  useEffect(loadTickets, [token]);

  const openTicket = (ticket: SupportTicket) => {
    setSelected(ticket);
    void api(`/support/tickets/${ticket.id}`, {}, token)
      .then(async (response) => {
        const data = (await response.json()) as { messages?: typeof messages; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to load conversation.");
        setMessages(data.messages ?? []);
        loadTickets();
      })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Unable to load conversation."));
  };

  const createTicket = (event: FormEvent) => {
    event.preventDefault();
    void api("/support/tickets", {
      method: "POST",
      body: JSON.stringify({ subject, description, category, priority }),
    }, token).then(async (response) => {
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "Unable to create ticket.");
      setSubject("");
      setDescription("");
      setCreating(false);
      loadTickets();
    }).catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Unable to create ticket."));
  };

  const sendReply = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    void api(`/support/tickets/${selected.id}/reply`, {
      method: "POST",
      body: JSON.stringify({ message: reply }),
    }, token).then(async (response) => {
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "Unable to send reply.");
      setReply("");
      openTicket(selected);
    }).catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Unable to send reply."));
  };

  if (creating) return (
    <section className="w-full max-w-xl rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between"><h2 className="font-display text-xl">Create support ticket</h2><button onClick={() => setCreating(false)} className="rounded border px-2 py-1 text-xs">Back</button></div>
      <form className="mt-5 space-y-4" onSubmit={createTicket}>
        <label className="block text-sm">Subject<input required maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1 w-full rounded border bg-background p-2" /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded border bg-background p-2"><option value="general">General</option><option value="billing">Billing</option><option value="technical">Technical</option><option value="account">Account</option><option value="feedback">Feedback</option></select></label><label className="text-sm">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-1 w-full rounded border bg-background p-2"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></div>
        <label className="block text-sm">Message<textarea required maxLength={8000} rows={7} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full resize-y rounded border bg-background p-2" placeholder="Describe what you need help with..." /></label>
        <button className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Send ticket</button>
      </form>
    </section>
  );

  return (
    <section className="flex h-[min(720px,85vh)] w-full max-w-4xl overflow-hidden rounded-lg border bg-card">
      <aside className="w-64 shrink-0 border-r p-4"><div className="flex items-center justify-between"><h2 className="font-display text-lg">Support</h2><button onClick={() => setCreating(true)} className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground">New ticket</button></div><div className="mt-4 space-y-1 overflow-y-auto">{tickets.map((ticket) => <button key={ticket.id} onClick={() => openTicket(ticket)} className={`w-full rounded border p-2 text-left ${selected?.id === ticket.id ? "border-primary bg-primary/10" : "hover:bg-secondary"}`}><div className="truncate text-sm">{ticket.subject}</div><div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{ticket.status}</span><span>{ticket.priority}</span></div></button>)}{!tickets.length && <p className="text-xs text-muted-foreground">{status || "No tickets yet."}</p>}</div></aside>
      <div className="flex min-w-0 flex-1 flex-col">{selected ? <><header className="border-b p-4"><div className="text-xs text-muted-foreground">{selected.category} · {selected.priority}</div><h3 className="mt-1 font-medium">{selected.subject}</h3></header><div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{messages.map((message) => <div key={message.id} className={`max-w-[85%] rounded border p-3 text-sm ${message.sender_role === "admin" ? "bg-primary/10" : "ml-auto bg-background"}`}><div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{message.sender_role === "admin" ? "KREATIVE Support" : "You"}</div>{message.body}</div>)}</div><form onSubmit={sendReply} className="flex gap-2 border-t p-3"><input value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to support..." className="min-w-0 flex-1 rounded border bg-background px-3 py-2 text-sm" /><button className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">Send</button></form></> : <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">{status || "Select a ticket to view the conversation."}</div>}</div>
    </section>
  );
}
