import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileArchive, KeyRound, Trash2 } from "lucide-react";
import { DIFFICULTIES, DIFFICULTY_LABEL, LANGUAGES, changePasswordInput, type AiProviderName } from "@code-junk/shared";
import { Badge, Button, Checkbox, Chip, Dialog, Field, Input, PageHeader, QueryView, Section, Segmented, Select, TabLinks, errorMessage, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useTheme, type Theme } from "@/lib/theme";
import { sessionKey } from "@/features/auth/api";
import { downloadPost } from "@/features/subjects/api";
import type { ProviderStatus } from "@/features/practice/GeneratePage";

interface Prefs {
  timeZone: string;
  theme: "SYSTEM" | "LIGHT" | "DARK";
  preferredLanguages: string[];
  defaultLanguage: string | null;
  defaultDifficulty: string | null;
  dailyStudyMinutes: number;
  aiProvider: AiProviderName;
  revisionDay: number;
  revisionSessionSize: number;
  weekStartsOn: number;
  defaultReminderMins: number;
  notifyInApp: boolean;
  notifyRevision: boolean;
  notifySessions: boolean;
  notifyAssignments: boolean;
  notifyExams: boolean;
  notifyEvents: boolean;
}
interface Me { user: { id: string; email: string; name: string; avatarUrl: string | null; createdAt: string; preferences: Prefs | null }; aiProviders: ProviderStatus[] }

const meKey = ["users", "me"] as const;
const useMe = () => useQuery({ queryKey: meKey, queryFn: () => api<Me>("/users/me") });
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function usePrefs() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (p: Partial<Prefs>) => api("/users/me/preferences", { method: "PATCH", body: p }),
    onSuccess: () => {
      toast.success("Preferences saved.");
      for (const k of [meKey, sessionKey, ["dashboard"], ["revision"]]) void qc.invalidateQueries({ queryKey: k });
    },
    onError: toast.error,
  });
}

function Shell({ children }: { children: (me: Me) => ReactNode }) {
  const me = useMe();
  return (
    <div>
      <PageHeader title="Settings" />
      <TabLinks className="mb-6" tabs={[{ to: "/app/settings", label: "Profile", end: true }, { to: "/app/settings/account", label: "Account" }, { to: "/app/settings/ai", label: "AI providers" }, { to: "/app/settings/learning", label: "Learning" }, { to: "/app/settings/notifications", label: "Notifications" }, { to: "/app/settings/appearance", label: "Appearance" }, { to: "/app/settings/data", label: "Data" }]} />
      <div className="max-w-2xl"><QueryView query={me}>{children}</QueryView></div>
    </div>
  );
}

export function ProfileSettings() {
  return <Shell>{(me) => <ProfileForm me={me} />}</Shell>;
}
function ProfileForm({ me }: { me: Me }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(me.user.name);
  const [avatarUrl, setAvatarUrl] = useState(me.user.avatarUrl ?? "");
  const [tz, setTz] = useState(me.user.preferences?.timeZone ?? "UTC");
  const prefs = usePrefs();
  const save = useMutation({
    mutationFn: () => api("/users/me", { method: "PATCH", body: { name, avatarUrl: avatarUrl || null } }),
    onSuccess: () => { toast.success("Profile saved."); void qc.invalidateQueries({ queryKey: meKey }); void qc.invalidateQueries({ queryKey: sessionKey }); },
    onError: toast.error,
  });
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [tz];
  return (
    <div className="space-y-5">
      <Section title="Profile">
        <div className="space-y-4">
          <Field label="Display name">{(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}</Field>
          <Field label="Profile picture URL (optional)" hint="A link to an image (https). Leave empty to use your initials.">{(a) => <Input {...a} type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />}</Field>
          <dl className="grid grid-cols-2 gap-y-1 text-sm"><dt className="text-muted">Email</dt><dd>{me.user.email}</dd><dt className="text-muted">Account type</dt><dd>Personal workspace</dd><dt className="text-muted">Member since</dt><dd>{fmtDate(me.user.createdAt)}</dd></dl>
          <div className="flex justify-end"><Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>Save profile</Button></div>
        </div>
      </Section>
      <Section title="Time zone">
        <p className="mb-3 text-sm text-ink-2">Used for “today”, streaks, your revision day and reminders.</p>
        <div className="flex gap-2"><Select aria-label="Time zone" className="flex-1" value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select><Button variant="secondary" onClick={() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone)}>Use this device's</Button><Button loading={prefs.isPending} onClick={() => prefs.mutate({ timeZone: tz })}>Save</Button></div>
      </Section>
    </div>
  );
}

export function AccountSettings() {
  return <Shell>{() => <AccountForms />}</Shell>;
}
function AccountForms() {
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({ currentPassword: "", newPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [del, setDel] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delText, setDelText] = useState("");
  const change = useMutation({
    mutationFn: () => api("/users/me/password", { method: "POST", body: f }),
    onSuccess: () => { toast.success("Password changed. Other devices were signed out."); setF({ currentPassword: "", newPassword: "" }); },
    onError: (e) => { if (e instanceof ApiError && e.code === "WRONG_PASSWORD") setErrors({ currentPassword: e.message }); else toast.error(e); },
  });
  const remove = useMutation({
    mutationFn: () => api("/users/me", { method: "DELETE", body: { password: delPw, confirm: delText } }),
    onSuccess: () => { qc.clear(); navigate("/", { replace: true }); },
    onError: toast.error,
  });
  const submit = () => {
    const p = changePasswordInput.safeParse(f);
    if (!p.success) {
      const e: Record<string, string> = {};
      for (const i of p.error.issues) e[String(i.path[0])] ??= i.message;
      return setErrors(e);
    }
    setErrors({});
    change.mutate();
  };
  return (
    <div className="space-y-5">
      <Section title="Change password">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label="Current password" error={errors.currentPassword}>{(a) => <Input {...a} type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} />}</Field>
          <Field label="New password" hint="At least 10 characters, with a letter and a number." error={errors.newPassword}>{(a) => <Input {...a} type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />}</Field>
          <div className="flex justify-end"><Button type="submit" leftIcon={<KeyRound />} loading={change.isPending}>Change password</Button></div>
        </form>
      </Section>
      <Section title="Delete account">
        <p className="text-sm text-ink-2">Permanently deletes your account and everything in it: snippets, questions, attempts, papers, plans, calendar and uploaded files. Export your data first if you want a copy.</p>
        <Button className="mt-3" variant="danger" leftIcon={<Trash2 />} onClick={() => setDel(true)}>Delete my account</Button>
      </Section>
      <Dialog open={del} onClose={() => setDel(false)} title="Delete your account?" size="sm" footer={<><Button variant="secondary" onClick={() => setDel(false)}>Cancel</Button><Button variant="danger" disabled={delText !== "DELETE" || !delPw} loading={remove.isPending} onClick={() => remove.mutate()}>Delete forever</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-ink-2">This can't be undone.</p>
          <Field label="Password">{(a) => <Input {...a} type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} autoComplete="current-password" />}</Field>
          <Field label='Type "DELETE" to confirm'>{(a) => <Input {...a} value={delText} onChange={(e) => setDelText(e.target.value)} />}</Field>
        </div>
      </Dialog>
    </div>
  );
}

export function AiSettings() {
  return <Shell>{(me) => <AiForms me={me} />}</Shell>;
}
function AiForms({ me }: { me: Me }) {
  const qc = useQueryClient();
  const toast = useToast();
  const prefs = usePrefs();
  const [keys, setKeys] = useState<Record<string, { apiKey: string; model: string }>>({});
  const refresh = () => { void qc.invalidateQueries({ queryKey: meKey }); void qc.invalidateQueries({ queryKey: ["ai", "providers"] }); };
  const save = useMutation({
    mutationFn: (p: AiProviderName) => api(`/users/me/ai-credentials/${p.toLowerCase()}`, { method: "PUT", body: { apiKey: keys[p]?.apiKey ?? "", model: keys[p]?.model || null } }),
    onSuccess: (_d, p) => { toast.success("Key saved securely."); setKeys((k) => ({ ...k, [p]: { apiKey: "", model: "" } })); refresh(); },
    onError: toast.error,
  });
  const remove = useMutation({ mutationFn: (p: AiProviderName) => api(`/users/me/ai-credentials/${p.toLowerCase()}`, { method: "DELETE" }), onSuccess: () => { toast.success("Key removed."); refresh(); }, onError: toast.error });
  const names: Record<AiProviderName, string> = { OPENAI: "OpenAI", GEMINI: "Google Gemini" };
  return (
    <div className="space-y-5">
      <Section title="Default provider">
        <Segmented ariaLabel="Default AI provider" value={me.user.preferences?.aiProvider ?? "OPENAI"} onChange={(v) => prefs.mutate({ aiProvider: v })} options={[{ value: "OPENAI", label: "OpenAI" }, { value: "GEMINI", label: "Gemini" }]} />
        <p className="mt-2 text-xs text-muted">Used for question generation, paper generation and grading. If it isn't available, the other configured provider is used.</p>
      </Section>
      {me.aiProviders.map((p) => (
        <Section key={p.provider} title={names[p.provider]} action={p.available ? <Badge tone="green">{p.source === "own_key" ? `Your key ••••${p.keyLast4}` : "Server key"}</Badge> : <Badge>Not configured</Badge>}>
          <div className="space-y-3">
            <p className="text-xs text-muted">Your key is encrypted before it's stored and is never shown again or sent to your browser. Only the last 4 characters are displayed.</p>
            <Field label={p.source === "own_key" ? "Replace API key" : "API key"}>{(a) => <Input {...a} type="password" autoComplete="off" value={keys[p.provider]?.apiKey ?? ""} onChange={(e) => setKeys({ ...keys, [p.provider]: { model: keys[p.provider]?.model ?? "", apiKey: e.target.value } })} placeholder={p.provider === "OPENAI" ? "sk-…" : "AIza…"} />}</Field>
            <Field label="Model (optional)" hint={`Default: ${p.model}`}>{(a) => <Input {...a} value={keys[p.provider]?.model ?? ""} onChange={(e) => setKeys({ ...keys, [p.provider]: { apiKey: keys[p.provider]?.apiKey ?? "", model: e.target.value } })} placeholder={p.model} />}</Field>
            <div className="flex justify-end gap-2">
              {p.source === "own_key" && <Button variant="ghost" loading={remove.isPending} onClick={() => remove.mutate(p.provider)}>Remove my key</Button>}
              <Button loading={save.isPending} disabled={(keys[p.provider]?.apiKey ?? "").length < 10} onClick={() => save.mutate(p.provider)}>Save key</Button>
            </div>
          </div>
        </Section>
      ))}
    </div>
  );
}

export function LearningSettings() {
  return <Shell>{(me) => <LearningForm p={me.user.preferences!} />}</Shell>;
}
function LearningForm({ p }: { p: Prefs }) {
  const prefs = usePrefs();
  const [f, setF] = useState(p);
  return (
    <div className="space-y-5">
      <Section title="Programming">
        <div className="space-y-4">
          <div><p className="mb-2 text-[13px] font-medium">Preferred languages</p><div className="flex flex-wrap gap-2">{LANGUAGES.filter((l) => !["markdown", "plaintext", "json"].includes(l.id)).map((l) => <Chip key={l.id} selected={f.preferredLanguages.includes(l.id)} onClick={() => setF({ ...f, preferredLanguages: f.preferredLanguages.includes(l.id) ? f.preferredLanguages.filter((x) => x !== l.id) : [...f.preferredLanguages, l.id] })}>{l.label}</Chip>)}</div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default language">{(a) => <Select {...a} value={f.defaultLanguage ?? ""} onChange={(e) => setF({ ...f, defaultLanguage: e.target.value || null })}><option value="">None</option>{LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</Select>}</Field>
            <Field label="Default difficulty">{(a) => <Select {...a} value={f.defaultDifficulty ?? ""} onChange={(e) => setF({ ...f, defaultDifficulty: e.target.value || null })}><option value="">No default</option>{DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}</Select>}</Field>
          </div>
        </div>
      </Section>
      <Section title="Revision & study">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Weekly revision day">{(a) => <Select {...a} value={f.revisionDay} onChange={(e) => setF({ ...f, revisionDay: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select>}</Field>
          <Field label="Questions per revision session">{(a) => <Input {...a} type="number" min={5} max={50} value={f.revisionSessionSize} onChange={(e) => setF({ ...f, revisionSessionSize: Number(e.target.value) })} />}</Field>
          <Field label="Daily study target (minutes)">{(a) => <Input {...a} type="number" min={0} max={1440} value={f.dailyStudyMinutes} onChange={(e) => setF({ ...f, dailyStudyMinutes: Number(e.target.value) })} />}</Field>
          <Field label="Week starts on">{(a) => <Select {...a} value={f.weekStartsOn} onChange={(e) => setF({ ...f, weekStartsOn: Number(e.target.value) })}><option value={1}>Monday</option><option value={0}>Sunday</option><option value={6}>Saturday</option></Select>}</Field>
        </div>
      </Section>
      <div className="flex justify-end"><Button loading={prefs.isPending} onClick={() => prefs.mutate({ preferredLanguages: f.preferredLanguages, defaultLanguage: f.defaultLanguage, defaultDifficulty: f.defaultDifficulty, revisionDay: f.revisionDay, revisionSessionSize: f.revisionSessionSize, dailyStudyMinutes: f.dailyStudyMinutes, weekStartsOn: f.weekStartsOn })}>Save preferences</Button></div>
    </div>
  );
}

export function NotificationSettings() {
  return <Shell>{(me) => <NotificationForm p={me.user.preferences!} />}</Shell>;
}
function NotificationForm({ p }: { p: Prefs }) {
  const prefs = usePrefs();
  const [f, setF] = useState(p);
  const rows: [keyof Prefs, string][] = [["notifyRevision", "Revision reminders"], ["notifySessions", "Study session reminders and missed sessions"], ["notifyAssignments", "Assignment deadlines and overdue assignments"], ["notifyExams", "Examination reminders"], ["notifyEvents", "College and personal event reminders"]];
  return (
    <Section title="In-app notifications">
      <div className="space-y-3">
        <Checkbox checked={f.notifyInApp} onChange={(e) => setF({ ...f, notifyInApp: e.target.checked })} label={<span className="font-medium">Enable notifications</span>} />
        <div className="space-y-2 border-l border-line pl-5">{rows.map(([k, l]) => <Checkbox key={k} disabled={!f.notifyInApp} checked={f[k] as boolean} onChange={(e) => setF({ ...f, [k]: e.target.checked })} label={l} />)}</div>
        <Field label="Default reminder before study sessions (minutes)">{(a) => <Input {...a} type="number" min={0} max={10080} value={f.defaultReminderMins} onChange={(e) => setF({ ...f, defaultReminderMins: Number(e.target.value) })} className="max-w-40" />}</Field>
        <p className="text-xs text-muted">Email and push delivery can be added later; for now notifications appear in the bell at the top of the app.</p>
        <div className="flex justify-end"><Button loading={prefs.isPending} onClick={() => prefs.mutate({ notifyInApp: f.notifyInApp, notifyRevision: f.notifyRevision, notifySessions: f.notifySessions, notifyAssignments: f.notifyAssignments, notifyExams: f.notifyExams, notifyEvents: f.notifyEvents, defaultReminderMins: f.defaultReminderMins })}>Save</Button></div>
      </div>
    </Section>
  );
}

export function AppearanceSettings() {
  return <Shell>{() => <AppearanceForm />}</Shell>;
}
function AppearanceForm() {
  const { theme, setTheme } = useTheme();
  const prefs = usePrefs();
  const map: Record<Theme, Prefs["theme"]> = { system: "SYSTEM", light: "LIGHT", dark: "DARK" };
  return (
    <Section title="Theme">
      <Segmented ariaLabel="Theme" value={theme} onChange={(t) => { setTheme(t); prefs.mutate({ theme: map[t] }); }} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
      <p className="mt-2 text-xs text-muted">Applies immediately and is saved to your account.</p>
    </Section>
  );
}

export function DataSettings() {
  return <Shell>{() => <DataForm />}</Shell>;
}
function DataForm() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-5">
      <Section title="Export everything">
        <p className="mb-3 text-sm text-ink-2">One JSON file with your profile, subjects, snippets, questions, quiz and paper history, revision schedule, plans and calendar. API keys are never included.</p>
        <a href="/api/users/me/export" className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-on-ink hover:bg-ink/85"><Download className="size-4" /> Download my data (JSON)</a>
      </Section>
      <Section title="Code collections">
        <p className="mb-3 text-sm text-ink-2">All your snippets as source files grouped by subject and topic, or as a printable booklet.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leftIcon={<FileArchive />} loading={busy === "zip"} onClick={() => void run("zip", () => downloadPost("/snippets/export", { all: true, format: "zip" }))}>Download all code (ZIP)</Button>
          <Button variant="secondary" leftIcon={<Download />} loading={busy === "pdf"} onClick={() => void run("pdf", () => downloadPost("/snippets/export", { all: true, format: "pdf" }))}>Booklet PDF</Button>
        </div>
      </Section>
    </div>
  );
}

