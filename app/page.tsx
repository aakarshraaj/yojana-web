"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Theme = "light" | "dark";
type TabKey = "summary" | "eligibility" | "documents" | "apply";
type ProfileField = "state" | "age" | "category" | "income";
type MatchStatus = "match" | "missing";

type SourceCard = {
  title: string;
  url: string;
  snippet?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceCard[];
};

type ChatResponse = {
  answer?: string;
  error?: string;
  raw?: string;
  sources?: unknown;
};

type AuthUser = {
  id: string;
  email?: string;
};

type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

type ProfileContext = Partial<Record<ProfileField, string>>;

type Section = {
  key: TabKey | "other";
  title: string;
  content: string;
};

type SchemeCard = {
  name: string;
  benefit: string;
  deadline: string;
  effort: "Low" | "Medium" | "High";
  sourceUrl?: string;
};

const composerPlaceholders = {
  en: "Ask anything about schemes, benefits, eligibility, or documents...",
  hi: "योजनाओं, लाभ, पात्रता या दस्तावेज़ों के बारे में कुछ भी पूछें...",
  mr: "योजना, लाभ, पात्रता किंवा कागदपत्रांविषयी काहीही विचारा...",
} as const;

const quickFilters = ["Only scholarships", "Only Bihar", "Highest benefit first", "Women-focused only"];
const starterChipsByLanguage = {
  en: [
    { label: "Profile format", value: "State: \nAge: \nCategory: \nOccupation: \nFamily income: \nNeed:" },
    { label: "Check eligibility", value: "Check my eligibility with this profile:\nState: \nAge: \nCategory: \nOccupation: \nFamily income: " },
    { label: "Documents needed", value: "List required documents based on my profile:\nState: \nAge: \nCategory: \nOccupation: \nFamily income: " },
    { label: "How to apply", value: "Give step-by-step apply process for best-fit schemes for this profile:\nState: \nAge: \nCategory: \nOccupation: \nFamily income: " },
    { label: "Official sources only", value: "Suggest schemes for my profile using only official government sources (gov.in, nic.in, official PDFs).\nState: \nAge: \nCategory: \nOccupation: \nFamily income: " },
  ],
  hi: [
    { label: "प्रोफाइल प्रारूप", value: "राज्य: \nआयु: \nश्रेणी: \nपेशा: \nपरिवार की आय: \nज़रूरत:" },
    { label: "पात्रता जांचें", value: "इस प्रोफाइल के आधार पर मेरी पात्रता जांचें:\nराज्य: \nआयु: \nश्रेणी: \nपेशा: \nपरिवार की आय: " },
    { label: "आवश्यक दस्तावेज़", value: "मेरी प्रोफाइल के अनुसार आवश्यक दस्तावेज़ों की सूची दें:\nराज्य: \nआयु: \nश्रेणी: \nपेशा: \nपरिवार की आय: " },
    { label: "आवेदन कैसे करें", value: "इस प्रोफाइल के लिए सबसे उपयुक्त योजनाओं की चरण-दर-चरण आवेदन प्रक्रिया बताएं:\nराज्य: \nआयु: \nश्रेणी: \nपेशा: \nपरिवार की आय: " },
    { label: "केवल आधिकारिक स्रोत", value: "मेरी प्रोफाइल के लिए केवल आधिकारिक सरकारी स्रोतों (gov.in, nic.in, official PDFs) से योजनाएं सुझाएं:\nराज्य: \nआयु: \nश्रेणी: \nपेशा: \nपरिवार की आय: " },
  ],
  mr: [
    { label: "प्रोफाइल स्वरूप", value: "राज्य: \nवय: \nप्रवर्ग: \nव्यवसाय: \nकुटुंब वार्षिक उत्पन्न: \nगरज:" },
    { label: "पात्रता तपासा", value: "या प्रोफाइलवर आधारित माझी पात्रता तपासा:\nराज्य: \nवय: \nप्रवर्ग: \nव्यवसाय: \nकुटुंब वार्षिक उत्पन्न: " },
    { label: "आवश्यक कागदपत्रे", value: "माझ्या प्रोफाइलनुसार आवश्यक कागदपत्रांची यादी द्या:\nराज्य: \nवय: \nप्रवर्ग: \nव्यवसाय: \nकुटुंब वार्षिक उत्पन्न: " },
    { label: "अर्ज कसा करायचा", value: "या प्रोफाइलसाठी योग्य योजनांची टप्प्याटप्प्याने अर्ज प्रक्रिया द्या:\nराज्य: \nवय: \nप्रवर्ग: \nव्यवसाय: \nकुटुंब वार्षिक उत्पन्न: " },
    { label: "फक्त अधिकृत स्रोत", value: "माझ्या प्रोफाइलसाठी फक्त अधिकृत सरकारी स्रोतांवरून (gov.in, nic.in, official PDFs) योजना सुचवा:\nराज्य: \nवय: \nप्रवर्ग: \nव्यवसाय: \nकुटुंब वार्षिक उत्पन्न: " },
  ],
} as const;

const profileTemplate =
  "State: \nAge: \nCategory: \nOccupation: \nFamily income: \nNeed:";
const authStorageKey = "yojana-auth-session";
const authPendingStorageKey = "yojana-auth-pending-message";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const authEnabled = Boolean(supabaseUrl && supabaseAnonKey);
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

const markdownComponents = (isDark: boolean) => ({
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className={`mt-5 text-3xl font-semibold tracking-tight ${isDark ? "text-stone-100" : "text-slate-900"}`} {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className={`mt-5 text-2xl font-semibold tracking-tight ${isDark ? "text-stone-100" : "text-slate-900"}`} {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className={`mt-4 text-lg font-semibold ${isDark ? "text-stone-100" : "text-slate-900"}`} {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className={`my-2.5 leading-7 ${isDark ? "text-stone-200" : "text-slate-700"}`} {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className={`my-3 list-disc space-y-1.5 pl-6 ${isDark ? "text-stone-200" : "text-slate-700"}`} {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className={`my-3 list-decimal space-y-1.5 pl-6 ${isDark ? "text-stone-200" : "text-slate-700"}`} {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className={`underline decoration-1 underline-offset-2 transition-colors duration-200 ${isDark ? "text-sky-300 hover:text-sky-200" : "text-sky-700 hover:text-sky-800"}`}
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="my-3 overflow-x-auto">
      <table className={`w-full border-collapse text-sm ${isDark ? "text-stone-200" : "text-slate-700"}`} {...props} />
    </div>
  ),
  th: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th className={`border px-2 py-1 text-left ${isDark ? "border-amber-950/40" : "border-slate-200"}`} {...props} />
  ),
  td: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td className={`border px-2 py-1 ${isDark ? "border-amber-950/40" : "border-slate-200"}`} {...props} />
  ),
});

const shortLabel = (text: string) => (text.length <= 46 ? text : `${text.slice(0, 43)}...`);
const cap = (v: string) => `${v.charAt(0).toUpperCase()}${v.slice(1)}`;

const extractHostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const classifySourceType = (source: SourceCard): "Gov portal" | "Guideline PDF" | "State dept" | "Reference" => {
  const host = extractHostname(source.url).toLowerCase();
  const text = `${source.title} ${source.snippet || ""} ${source.url}`.toLowerCase();
  if (text.includes(".pdf") || text.includes("guideline")) return "Guideline PDF";
  if (host.includes("gov.in") || host.includes("nic.in")) {
    if (text.includes("state") || text.includes("department")) return "State dept";
    return "Gov portal";
  }
  return "Reference";
};

const normalizeSources = (value: unknown): SourceCard[] => {
  if (!Array.isArray(value)) return [];
  const list = value
    .map((item, index): SourceCard | null => {
      if (typeof item === "string" && item.trim()) return { title: `Source ${index + 1}`, url: item.trim() };
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      const url = typeof (r.url ?? r.link) === "string" ? String(r.url ?? r.link).trim() : "";
      if (!url) return null;
      const title = typeof (r.title ?? r.name ?? r.source) === "string" ? String(r.title ?? r.name ?? r.source).trim() : `Source ${index + 1}`;
      const snippet = typeof (r.snippet ?? r.description ?? r.summary) === "string" ? String(r.snippet ?? r.description ?? r.summary).trim() : undefined;
      return { title, url, snippet };
    })
    .filter((s): s is SourceCard => Boolean(s));

  const uniq = new Map<string, SourceCard>();
  for (const s of list) uniq.set(`${s.title}::${s.url}`, s);
  return Array.from(uniq.values()).slice(0, 8);
};

const parseProfile = (text: string): ProfileContext => {
  const age = text.match(/\bage\s*[:\-]?\s*(\d{1,2})\b/i)?.[1] || text.match(/\b(\d{1,2})\s*(?:years?|yrs?)\s*old\b/i)?.[1];
  const category = text.match(/\b(sc|st|obc|ews|general|minority)\b/i)?.[1] || text.match(/\bcategory\s*[:\-]?\s*([a-z ]+)/i)?.[1];
  const income = text.match(/\bincome\s*[:\-]?\s*([^\n,]+)/i)?.[1] || text.match(/₹\s?[\d,]+/i)?.[0];
  const state = text.match(/\bstate\s*[:\-]?\s*([a-zA-Z ]{3,})/i)?.[1] || text.match(/\bin\s+([a-zA-Z ]{3,})\b/i)?.[1];
  const safeState = state?.trim();
  return { state: safeState, age, category, income };
};

const fieldStatus = (profile: ProfileContext): Record<ProfileField, MatchStatus> => ({
  state: profile.state ? "match" : "missing",
  age: profile.age ? "match" : "missing",
  category: profile.category ? "match" : "missing",
  income: profile.income ? "match" : "missing",
});

const extractSections = (content: string): Section[] => {
  const lines = content.split("\n");
  const out: Section[] = [];
  let title = "Summary";
  let key: Section["key"] = "summary";
  let buffer: string[] = [];
  const flush = () => {
    const c = buffer.join("\n").trim();
    if (c) out.push({ title, key, content: c });
  };
  for (const line of lines) {
    const h = line.match(/^#{1,6}\s+(.+)$/);
    if (!h) {
      buffer.push(line);
      continue;
    }
    flush();
    title = h[1].trim();
    const lower = title.toLowerCase();
    if (lower.includes("eligib")) key = "eligibility";
    else if (lower.includes("document")) key = "documents";
    else if (lower.includes("apply") || lower.includes("process")) key = "apply";
    else if (lower.includes("summary") || lower.includes("overview")) key = "summary";
    else key = "other";
    buffer = [];
  }
  flush();
  return out.length ? out : [{ title: "Summary", key: "summary", content }];
};

const extractSchemes = (content: string, sources: SourceCard[]): SchemeCard[] => {
  const lines = content.split("\n");
  const schemes: SchemeCard[] = [];
  for (const line of lines) {
    const numbered = line.match(/^\d+\.\s+(?:\*\*)?(.+?)(?:\*\*)?$/);
    if (!numbered) continue;
    const name = numbered[1].trim();
    if (name.length < 6) continue;
    schemes.push({
      name,
      benefit: "Check source details",
      deadline: "Not specified",
      effort: "Medium",
      sourceUrl: sources[schemes.length]?.url || sources[0]?.url,
    });
  }
  return schemes.slice(0, 6);
};

const injectCitations = (markdown: string, sourceCount: number) => {
  if (sourceCount === 0) return markdown;
  const lines = markdown.split("\n");
  let idx = 1;
  const out = lines.map((line) => {
    const t = line.trim();
    if (!t || /^#{1,6}\s/.test(t)) return line;
    if (/^\s*[-*]\s/.test(t) || /^\s*\d+\.\s/.test(t) || t.length > 60) {
      if (/\[[0-9]+\]\(#src-[0-9]+\)/.test(t)) return line;
      const n = ((idx - 1) % sourceCount) + 1;
      idx += 1;
      return `${line} [${n}](#src-${n})`;
    }
    return line;
  });
  return out.join("\n");
};

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.7l6.8-3.9M8.6 13.3l6.8 3.9" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 1 0 11 11Z" />
    </svg>
  );
}

function CornerMotif({
  className,
  isDark,
}: {
  className?: string;
  isDark: boolean;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <g
        stroke={isDark ? "#a78b6a" : "#b08b57"}
        strokeWidth="1.15"
        strokeLinecap="round"
        opacity={isDark ? 0.14 : 0.18}
      >
        <circle cx="60" cy="60" r="40" />
        <circle cx="60" cy="60" r="28" />
        <path d="M60 12v20M60 88v20M12 60h20M88 60h20" />
        <path d="M30 30l14 14M76 76l14 14M90 30L76 44M44 76L30 90" />
        <path d="M60 24c8 9 8 23 0 32c-8-9-8-23 0-32Z" />
        <path d="M60 96c-8-9-8-23 0-32c8 9 8 23 0 32Z" />
        <path d="M24 60c9-8 23-8 32 0c-9 8-23 8-32 0Z" />
        <path d="M96 60c-9 8-23 8-32 0c9-8 23-8 32 0Z" />
      </g>
    </svg>
  );
}

function FlowerSpinner({ className, isDark }: { className?: string; isDark: boolean }) {
  const stroke = isDark ? "#e7d4bb" : "#8b5e34";
  const soft = isDark ? "#c8a57f" : "#b07a42";
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <defs>
        <path id="petal" d="M32 10 C36 16, 36 24, 32 30 C28 24, 28 16, 32 10Z" />
        <path id="innerPetal" d="M32 16 C34.8 20.5, 34.8 26, 32 29.5 C29.2 26, 29.2 20.5, 32 16Z" />
      </defs>

      <circle cx="32" cy="32" r="26" stroke={soft} strokeOpacity="0.22" strokeWidth="1.1" />

      <g stroke={stroke} strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" opacity="0.94">
        <g>
          <use href="#petal" />
          <use href="#petal" transform="rotate(45 32 32)" />
          <use href="#petal" transform="rotate(90 32 32)" />
          <use href="#petal" transform="rotate(135 32 32)" />
          <use href="#petal" transform="rotate(180 32 32)" />
          <use href="#petal" transform="rotate(225 32 32)" />
          <use href="#petal" transform="rotate(270 32 32)" />
          <use href="#petal" transform="rotate(315 32 32)" />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 32 32"
            to="360 32 32"
            dur="9s"
            repeatCount="indefinite"
          />
        </g>

        <g opacity="0.7">
          <use href="#innerPetal" />
          <use href="#innerPetal" transform="rotate(60 32 32)" />
          <use href="#innerPetal" transform="rotate(120 32 32)" />
          <use href="#innerPetal" transform="rotate(180 32 32)" />
          <use href="#innerPetal" transform="rotate(240 32 32)" />
          <use href="#innerPetal" transform="rotate(300 32 32)" />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 32 32"
            to="-360 32 32"
            dur="12s"
            repeatCount="indefinite"
          />
        </g>

        <circle cx="32" cy="32" r="5.4" fill={soft} fillOpacity="0.18" stroke="none">
          <animate attributeName="r" values="5;6.2;5" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="fill-opacity" values="0.18;0.3;0.18" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="32" cy="32" r="2.1" fill={stroke} stroke="none" />
      </g>
    </svg>
  );
}

export default function Home() {
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [authLoading, setAuthLoading] = useState(false);
  const [authGoogleLoading, setAuthGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [sharedMessageId, setSharedMessageId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, TabKey>>({});
  const [shortlist, setShortlist] = useState<SchemeCard[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [showMobileHistory, setShowMobileHistory] = useState(false);
  const [typedAssistant, setTypedAssistant] = useState<Record<string, string>>({});
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);

  const nextMessageId = useRef(1);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const animatedAssistantIdsRef = useRef<Set<string>>(new Set());
  const isDark = theme === "dark";
  const composerPlaceholder = composerPlaceholders[language as keyof typeof composerPlaceholders] || composerPlaceholders.en;
  const starterChips = starterChipsByLanguage[language as keyof typeof starterChipsByLanguage] || starterChipsByLanguage.en;
  const hasConversation = useMemo(() => messages.some((m) => m.role === "user"), [messages]);

  const historyTurns = useMemo(
    () =>
      messages
        .filter((m) => m.role === "user")
        .map((m) => ({ id: m.id, label: shortLabel(m.content) }))
        .reverse(),
    [messages]
  );

  const hasUncertainEvidence = useMemo(
    () => messages.some((m) => m.role === "assistant" && (!m.sources || m.sources.length === 0)),
    [messages]
  );

  const supabaseHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    }),
    []
  );

  const persistSession = (next: AuthSession | null) => {
    setSession(next);
    if (typeof window === "undefined") return;
    if (!next) {
      localStorage.removeItem(authStorageKey);
      return;
    }
    localStorage.setItem(authStorageKey, JSON.stringify(next));
  };

  const fetchSupabaseUser = useCallback(async (accessToken: string): Promise<AuthUser> => {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        ...supabaseHeaders,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) throw new Error("Unable to verify user session.");
    const data = (await res.json()) as { id: string; email?: string };
    return { id: data.id, email: data.email };
  }, [supabaseHeaders]);

  const refreshSupabaseSession = useCallback(async (refreshToken: string): Promise<AuthSession> => {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: supabaseHeaders,
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token || !data.refresh_token) {
      throw new Error(data.error_description || "Session expired.");
    }
    const user = await fetchSupabaseUser(data.access_token);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user,
    };
  }, [fetchSupabaseUser, supabaseHeaders]);

  useEffect(() => {
    if (!authEnabled) {
      setAuthReady(true);
      return;
    }
    const bootstrapAuth = async () => {
      const savedPending = localStorage.getItem(authPendingStorageKey);
      if (savedPending) setPendingMessage(savedPending);

      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      if (hash) {
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const errorDescription = params.get("error_description") || params.get("error");
        if (errorDescription) {
          setAuthError(decodeURIComponent(errorDescription));
          setShowAuthModal(true);
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          setAuthReady(true);
          return;
        }
        if (accessToken && refreshToken) {
          try {
            const user = await fetchSupabaseUser(accessToken);
            persistSession({ accessToken, refreshToken, user });
            setShowAuthModal(false);
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
            setAuthReady(true);
            return;
          } catch {
            persistSession(null);
          }
        }
      }

      const raw = localStorage.getItem(authStorageKey);
      if (!raw) {
        setAuthReady(true);
        return;
      }
      try {
        const saved = JSON.parse(raw) as AuthSession;
        if (!saved?.accessToken || !saved?.refreshToken) throw new Error("Invalid session");
        try {
          const user = await fetchSupabaseUser(saved.accessToken);
          persistSession({ ...saved, user });
        } catch {
          const refreshed = await refreshSupabaseSession(saved.refreshToken);
          persistSession(refreshed);
        }
      } catch {
        persistSession(null);
      } finally {
        setAuthReady(true);
      }
    };
    void bootstrapAuth();
  }, [fetchSupabaseUser, refreshSupabaseSession]);

  const startGoogleAuth = () => {
    if (!authEnabled) {
      setAuthError("Missing Supabase env vars in yojana-web.");
      return;
    }
    setAuthError(null);
    setAuthNotice(null);
    setAuthGoogleLoading(true);
    const queued = (pendingMessage || input).trim();
    if (queued) localStorage.setItem(authPendingStorageKey, queued);
    const redirectTo = window.location.origin;
    const url = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
    window.location.assign(url);
  };

  const handleSignOut = () => {
    persistSession(null);
    setMessages([]);
    setActiveHistoryId(null);
    setShortlist([]);
  };

  const submitAuth = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError("Email and password are required.");
      return;
    }
    if (!authEnabled) {
      setAuthError("Missing Supabase env vars in yojana-web.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      if (authMode === "signup") {
        const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
          method: "POST",
          headers: supabaseHeaders,
          body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
        });
        const data = (await res.json()) as {
          access_token?: string;
          refresh_token?: string;
          error_description?: string;
        };
        if (!res.ok) throw new Error(data.error_description || "Unable to create account.");
        if (data.access_token && data.refresh_token) {
          const user = await fetchSupabaseUser(data.access_token);
          persistSession({ accessToken: data.access_token, refreshToken: data.refresh_token, user });
        } else {
          setAuthNotice("Account created. Please verify your email, then sign in.");
          setAuthMode("signin");
        }
      } else {
        const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: supabaseHeaders,
          body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
        });
        const data = (await res.json()) as {
          access_token?: string;
          refresh_token?: string;
          error_description?: string;
        };
        if (!res.ok || !data.access_token || !data.refresh_token) {
          throw new Error(data.error_description || "Invalid login credentials.");
        }
        const user = await fetchSupabaseUser(data.access_token);
        persistSession({ accessToken: data.access_token, refreshToken: data.refresh_token, user });
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem("yojana-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("yojana-theme", theme);
  }, [theme]);

  useEffect(() => {
    const s = chatScrollRef.current;
    if (!s) return;
    s.scrollTo({ top: s.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  useEffect(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) window.clearInterval(typingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (!latest || latest.role !== "assistant") return;
    if (animatedAssistantIdsRef.current.has(latest.id)) return;

    animatedAssistantIdsRef.current.add(latest.id);
    setTypingMessageId(latest.id);

    const full = latest.content;
    let index = 0;
    const step = Math.max(3, Math.ceil(full.length / 110));

    if (typingTimerRef.current) window.clearInterval(typingTimerRef.current);
    typingTimerRef.current = window.setInterval(() => {
      index = Math.min(full.length, index + step);
      const slice = full.slice(0, index);
      setTypedAssistant((prev) => ({ ...prev, [latest.id]: slice }));
      if (index >= full.length) {
        if (typingTimerRef.current) window.clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
        setTypingMessageId((curr) => (curr === latest.id ? null : curr));
      }
    }, 18);
  }, [messages]);

  const makeMessageId = useCallback(() => {
    const id = `m-${nextMessageId.current}`;
    nextMessageId.current += 1;
    return id;
  }, []);

  const jumpToMessage = (id: string) => {
    const scroller = chatScrollRef.current;
    const target = document.getElementById(id);
    if (!scroller || !target) return;
    scroller.scrollTo({ top: target.offsetTop - 12, behavior: "smooth" });
    setActiveHistoryId(id);
  };

  const resetConversation = () => {
    setMessages([]);
    setInput("");
    setActiveHistoryId(null);
    setActiveTabs({});
    setShortlist([]);
    setShowMobileHistory(false);
    setTypedAssistant({});
    setTypingMessageId(null);
    animatedAssistantIdsRef.current = new Set();
    nextMessageId.current = 1;
  };

  const handleCopy = async (message: Message) => {
    await navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId(null), 1400);
  };

  const handleShare = async (message: Message) => {
    const text = `Yojana AI\n\n${message.content}`;
    if (navigator.share) {
      await navigator.share({ title: "Yojana AI response", text, url: window.location.href });
    } else {
      await navigator.clipboard.writeText(`${text}\n\n${window.location.href}`);
    }
    setSharedMessageId(message.id);
    window.setTimeout(() => setSharedMessageId(null), 1400);
  };

  const submitQuestion = useCallback(async (question: string, visibleUser?: string) => {
    if (!question || loading) return;

    const userMessage: Message = { id: makeMessageId(), role: "user", content: visibleUser || question };
    setMessages((prev) => [...prev, userMessage]);
    setActiveHistoryId(userMessage.id);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${apiBaseUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authEnabled && session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        },
        body: JSON.stringify({ question, language }),
      });
      const text = await res.text();
      let data: ChatResponse = {};
      try {
        data = text ? (JSON.parse(text) as ChatResponse) : {};
      } catch {
        data = { raw: text };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${data.error || data.raw || "Unknown error"}`);

      setMessages((prev) => [
        ...prev,
        {
          id: makeMessageId(),
          role: "assistant",
          content: data.answer || "No answer returned from backend.",
          sources: normalizeSources(data.sources),
        },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to connect.";
      setMessages((prev) => [...prev, { id: makeMessageId(), role: "assistant", content: `⚠️ ${message}` }]);
    } finally {
      setLoading(false);
    }
  }, [language, loading, makeMessageId, session?.accessToken]);

  useEffect(() => {
    if (!session || !pendingMessage || loading) return;
    const queued = pendingMessage.trim();
    if (!queued) return;
    setPendingMessage(null);
    localStorage.removeItem(authPendingStorageKey);
    setShowAuthModal(false);
    void submitQuestion(queued);
  }, [session, pendingMessage, loading, submitQuestion]);

  const sendMessage = async () => {
    const q = input.trim();
    if (!q) return;
    if (authEnabled && !session) {
      setPendingMessage(q);
      localStorage.setItem(authPendingStorageKey, q);
      setAuthError(null);
      setAuthNotice("Sign in once to send your message.");
      setShowAuthModal(true);
      return;
    }
    await submitQuestion(q);
  };

  const regenerateStrict = async (assistantIndex: number) => {
    for (let i = assistantIndex - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") {
        const strict = `${messages[i].content}\n\nUse only official government sources (gov.in, nic.in, official PDFs). Add citations.`;
        await submitQuestion(strict, "Regenerate official-only");
        break;
      }
    }
  };

  const addToShortlist = (item: SchemeCard) => {
    setShortlist((prev) => {
      if (prev.some((p) => p.name.toLowerCase() === item.name.toLowerCase())) return prev;
      return [...prev, item];
    });
  };

  const downloadSummary = () => {
    const latestUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const rows = shortlist
      .map(
        (s) =>
          `<tr><td>${s.name}</td><td>${s.benefit}</td><td>${s.deadline}</td><td>${s.effort}</td></tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><title>Yojana Summary</title><style>body{font-family:Arial;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}</style></head><body><h1>Yojana AI Summary</h1><h3>Profile prompt</h3><p>${latestUser}</p><h3>Shortlisted schemes</h3><table><thead><tr><th>Scheme</th><th>Benefit</th><th>Deadline</th><th>Effort</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const applyTemplate = () => {
    setInput(profileTemplate);
  };

  const renderComposer = () => (
    <div className="w-full">
      <div
        className={`rounded-[1.45rem] border px-3 pb-3 pt-3 shadow-[0_8px_28px_rgba(15,23,42,0.08)] transition-all duration-200 md:rounded-[1.65rem] md:px-4 ${
          isDark ? "border-amber-950/40 bg-[#231b14] focus-within:border-amber-800/60" : "border-slate-200 bg-white focus-within:border-slate-300"
        }`}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          className={`w-full min-h-[52px] resize-none overflow-hidden bg-transparent text-[15px] outline-none md:min-h-[60px] ${
            isDark ? "text-stone-100 placeholder:text-stone-500" : "text-slate-900 placeholder:text-slate-400"
          }`}
          placeholder={composerPlaceholder}
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pr-1">
            <div
              className={`inline-flex items-center rounded-full border p-0.5 ${
                isDark ? "border-amber-950/40 bg-[#231b14]" : "border-slate-200 bg-white"
              }`}
              aria-label="Response language"
            >
              {[
                { value: "en", label: "EN" },
                { value: "hi", label: "हिंदी" },
                { value: "mr", label: "मराठी" },
              ].map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => setLanguage(lang.value)}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors duration-200 ${
                    language === lang.value
                      ? isDark
                        ? "bg-[#3a2d21] text-stone-100"
                        : "bg-slate-100 text-slate-900"
                      : isDark
                        ? "text-stone-300 hover:text-stone-100"
                        : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
            <button
              onClick={applyTemplate}
              className={`inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs transition-all duration-200 ${
                isDark ? "border-amber-950/40 text-stone-300 hover:border-amber-800/60 hover:bg-[#2d241b]" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add profile template
            </button>
          </div>
          <button
            onClick={() => void sendMessage()}
            disabled={loading}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm transition-transform duration-200 hover:scale-[1.03] disabled:opacity-60"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );

  if (!authReady) {
    return (
      <main className={`relative flex h-screen items-center justify-center ${isDark ? "bg-[#18130f] text-stone-100" : "bg-[#faf8f4] text-slate-900"}`}>
        <FlowerSpinner className="h-12 w-12" isDark={isDark} />
      </main>
    );
  }

  return (
    <main className={`relative h-screen overflow-hidden ${isDark ? "bg-[#18130f] text-stone-100" : "bg-[#faf8f4] text-slate-900"}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500 via-white to-emerald-500" />
      <CornerMotif isDark={isDark} className="pointer-events-none absolute -left-8 -top-8 h-28 w-28 md:h-36 md:w-36" />
      <CornerMotif isDark={isDark} className="pointer-events-none absolute -right-10 top-24 h-20 w-20 rotate-12 md:h-24 md:w-24" />
      <CornerMotif isDark={isDark} className="pointer-events-none absolute -bottom-10 right-20 h-24 w-24 -rotate-6 md:h-32 md:w-32" />
      <div className="flex h-full">
        <aside className={`hidden h-full w-[280px] flex-col border-r p-4 md:flex ${isDark ? "border-amber-950/50 bg-[#231b14]/90" : "border-slate-200 bg-white/90"}`}>
          <div className={`mb-3 rounded-2xl border p-3 ${isDark ? "border-amber-950/40 bg-[#231b14]" : "border-slate-200 bg-slate-50 shadow-[inset_3px_0_0_0_rgba(249,115,22,0.35)]"}`}>
            <p className={`text-[11px] uppercase tracking-[0.16em] ${isDark ? "text-stone-400" : "text-slate-600"}`}>Yojana AI</p>
            <p className={`mt-1 text-sm font-medium ${isDark ? "text-stone-200" : "text-slate-800"}`}>Government scheme discovery for India</p>
          </div>
          <button
            onClick={resetConversation}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${isDark ? "border-amber-950/40 bg-[#231b14] hover:bg-[#2d241b]" : "border-slate-200 bg-white hover:bg-slate-50"}`}
          >
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${isDark ? "border-amber-900/50" : "border-slate-300"}`}>
              <PlusIcon className="h-3.5 w-3.5" />
            </span>
            New Search
          </button>
          <div className={`mt-5 border-t pt-4 ${isDark ? "border-amber-950/40" : "border-slate-200"}`}>
            <p className={`px-1 text-xs font-medium uppercase tracking-[0.15em] ${isDark ? "text-stone-400" : "text-stone-500"}`}>Recent</p>
            <div className="mt-2 max-h-[320px] space-y-1 overflow-y-auto pr-1">
              {historyTurns.map((turn) => (
                <button
                  key={turn.id}
                  onClick={() => jumpToMessage(turn.id)}
                  className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                    activeHistoryId === turn.id
                      ? isDark ? "bg-[#3a2d21] text-stone-100" : "bg-slate-200/70 text-slate-900"
                      : isDark ? "text-stone-300 hover:bg-[#2d241b]" : "text-slate-700 hover:bg-white"
                  }`}
                >
                  {turn.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className={`flex h-[64px] items-center justify-between px-3 md:px-8 ${isDark ? "border-b border-amber-950/50 bg-[#18130f]/85" : "border-b border-slate-200 bg-white/60"}`}>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMobileHistory((p) => !p)}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border md:hidden ${
                  isDark ? "border-amber-950/40 bg-[#231b14] text-stone-200" : "border-slate-300 bg-white text-slate-700"
                }`}
                aria-label="Open recent history"
              >
                ☰
              </button>
              <div className={`text-sm font-semibold ${isDark ? "text-stone-200" : "text-slate-800"}`}>Yojana AI</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setShowCompare((p) => !p)}
                className={`hidden rounded-full border px-3 py-1.5 text-sm md:block ${isDark ? "border-amber-950/40 bg-[#231b14]" : "border-slate-300 bg-white"}`}
              >
                Shortlist ({shortlist.length})
              </button>
              <button
                onClick={downloadSummary}
                disabled={shortlist.length === 0}
                className={`hidden rounded-full border px-3 py-1.5 text-sm disabled:opacity-50 md:block ${isDark ? "border-amber-950/40 bg-[#231b14]" : "border-slate-300 bg-white"}`}
              >
                Download PDF
              </button>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className={`hidden rounded-full border px-2.5 py-1.5 text-xs md:px-3 md:text-sm lg:block ${isDark ? "border-amber-950/40 bg-[#231b14]" : "border-slate-300 bg-white"}`}
              >
                <option value="en">English</option>
                <option value="hi">हिंदी</option>
                <option value="mr">मराठी</option>
              </select>
              <button
                onClick={() => setTheme((p) => (p === "dark" ? "light" : "dark"))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs md:gap-2 md:px-3 md:text-sm ${isDark ? "border-amber-950/40 bg-[#231b14]" : "border-slate-300 bg-white"}`}
              >
                {isDark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
                <span>{isDark ? "Light" : "Dark"}</span>
              </button>
              {authEnabled && session && (
                <button
                  onClick={handleSignOut}
                  className={`rounded-full border px-2.5 py-1.5 text-xs md:px-3 md:text-sm ${isDark ? "border-amber-950/40 bg-[#231b14] text-stone-300" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  Sign out
                </button>
              )}
              {authEnabled && !session && (
                <button
                  onClick={() => {
                    setAuthMode("signin");
                    setAuthError(null);
                    setAuthNotice(null);
                    setShowAuthModal(true);
                  }}
                  className={`rounded-full border px-2.5 py-1.5 text-xs md:px-3 md:text-sm ${isDark ? "border-amber-950/40 bg-[#231b14] text-stone-300" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  Sign in
                </button>
              )}
            </div>
          </header>

          {!hasConversation ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 pb-10">
              <h1 className={`mb-8 text-5xl font-medium tracking-tight md:text-6xl ${isDark ? "text-stone-100" : "text-slate-900"}`}>yojana</h1>
              <p className={`mb-6 text-center text-sm ${isDark ? "text-stone-300" : "text-slate-600"}`}>
                Find government schemes by your life context, not by guessing portal names.
              </p>
              <div className="w-full max-w-4xl">{renderComposer()}</div>
              <div className="mt-5 flex w-full max-w-4xl items-center justify-start gap-2 overflow-x-auto pb-1 md:flex-wrap md:justify-center">
                {starterChips.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => setInput(chip.value)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${isDark ? "border-amber-950/40 bg-[#231b14]" : "border-slate-200 bg-white"}`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div
                ref={chatScrollRef}
                className="flex-1 overflow-y-auto px-3 pb-64 pt-4 md:px-8 md:pb-72"
                style={
                  !isDark
                    ? {
                        backgroundColor: "#f7f4ee",
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='table' tableValues='0 0.08'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")",
                        backgroundSize: "180px 180px",
                        backgroundBlendMode: "multiply",
                      }
                    : undefined
                }
              >
                <div className="mx-auto w-full max-w-4xl space-y-8 md:space-y-10">
                  {messages.map((message, index) => {
                    if (message.role === "user") {
                      return (
                        <article key={message.id} id={message.id}>
                          <div className={`ml-auto max-w-[94%] rounded-[1.25rem] border px-3 py-3 transition-all duration-200 md:max-w-[76%] md:rounded-[1.35rem] md:px-4 ${isDark ? "border-amber-950/40 bg-[#2d241b]/78 text-stone-100" : "border-[#e7dcc4] bg-[#f0e7d4] text-slate-900"}`}>
                            <p className={`mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${isDark ? "text-stone-400" : "text-stone-500"}`}>You</p>
                            <p className="whitespace-pre-wrap leading-7">{message.content}</p>
                          </div>
                        </article>
                      );
                    }

                    const prevUser = [...messages.slice(0, index)].reverse().find((m) => m.role === "user");
                    const profile = parseProfile(prevUser?.content || "");
                    const status = fieldStatus(profile);
                    const missing = (Object.keys(status) as ProfileField[]).filter((k) => status[k] === "missing");
                    const isTypingThis = typingMessageId === message.id;
                    const displayContent = isTypingThis ? typedAssistant[message.id] || "" : message.content;

                    const sections = extractSections(message.content);
                    const sectionMap = new Map<TabKey, Section>();
                    for (const s of sections) if (s.key !== "other" && !sectionMap.has(s.key)) sectionMap.set(s.key, s);
                    const tabOrder = ["summary", "eligibility", "documents", "apply"] as const;
                    const tabs: TabKey[] = tabOrder.filter((k): k is TabKey => sectionMap.has(k));
                    const showTabs = !isTypingThis && tabs.length >= 2 && message.content.length > 420;
                    const activeTab = activeTabs[message.id] || tabs[0];
                    const baseMarkdown = showTabs && activeTab ? sectionMap.get(activeTab)?.content || message.content : displayContent;
                    const markdown = injectCitations(baseMarkdown, message.sources?.length || 0);
                    const schemes = isTypingThis ? [] : extractSchemes(message.content, message.sources || []);
                    const uncertain = (message.sources?.length || 0) === 0;

                    return (
                      <article key={message.id} id={message.id} className="transition-all duration-300 ease-out">
                        <p className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${isDark ? "text-stone-500" : "text-stone-400"}`}>Assistant</p>

                        {uncertain && null}

                        {!isTypingThis && (
                          <div className="mb-3 flex flex-wrap gap-2">
                          {(Object.keys(status) as ProfileField[]).map((f) => (
                            <span
                              key={`${message.id}-${f}`}
                              className={`rounded-full border px-2 py-1 text-[11px] ${
                                status[f] === "match"
                                  ? isDark ? "border-emerald-700 bg-emerald-900/20 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : isDark ? "border-amber-950/40 bg-[#231b14] text-stone-300" : "border-slate-200 bg-slate-100 text-slate-600"
                              }`}
                            >
                              {cap(f)}: {status[f] === "match" ? "Provided" : "Missing"}
                            </span>
                          ))}
                          </div>
                        )}

                        {showTabs && (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {tabs.map((tab) => (
                              <button
                                key={`${message.id}-${tab}`}
                                onClick={() => setActiveTabs((p) => ({ ...p, [message.id]: tab }))}
                                className={`rounded-full border px-3 py-1 text-xs ${
                                  activeTab === tab
                                    ? isDark ? "border-amber-800/60 bg-[#2d241b] text-stone-100" : "border-slate-300 bg-slate-100 text-slate-900"
                                    : isDark ? "border-amber-950/40 text-stone-300" : "border-slate-200 text-slate-600"
                                }`}
                              >
                                {cap(tab)}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className={`prose max-w-none ${isDark ? "prose-invert" : ""}`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents(isDark)}>
                            {markdown}
                          </ReactMarkdown>
                        </div>

                        {schemes.length > 0 && (
                          <div className={`mt-4 border-t pt-3 ${isDark ? "border-amber-950/50" : "border-slate-200"}`}>
                            <p className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] ${isDark ? "text-stone-500" : "text-stone-500"}`}>Scheme Actions</p>
                            <div className="space-y-2">
                              {schemes.map((s) => (
                                <div key={`${message.id}-${s.name}`} className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 ${isDark ? "border-amber-950/40 bg-[#231b14]" : "border-slate-200 bg-slate-50"}`}>
                                  <span className={`mr-auto text-xs font-medium ${isDark ? "text-stone-200" : "text-slate-800"}`}>{s.name}</span>
                                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                                    {s.sourceUrl && (
                                      <a href={s.sourceUrl} target="_blank" rel="noreferrer" className={`rounded-md px-2 py-1 text-xs ${isDark ? "bg-[#2d241b] text-stone-200" : "bg-white text-slate-700"}`}>
                                        Official page
                                      </a>
                                    )}
                                    <button onClick={() => setInput(`Check detailed eligibility for ${s.name} with my profile.`)} className={`rounded-md px-2 py-1 text-xs ${isDark ? "bg-[#2d241b] text-stone-200" : "bg-white text-slate-700"}`}>Eligibility check</button>
                                    <button onClick={() => setInput(`Give me required document checklist for ${s.name}.`)} className={`rounded-md px-2 py-1 text-xs ${isDark ? "bg-[#2d241b] text-stone-200" : "bg-white text-slate-700"}`}>Docs checklist</button>
                                    <button onClick={() => setInput(`Give step-by-step apply process for ${s.name}.`)} className={`rounded-md px-2 py-1 text-xs ${isDark ? "bg-[#2d241b] text-stone-200" : "bg-white text-slate-700"}`}>Apply steps</button>
                                    <button onClick={() => addToShortlist(s)} className={`rounded-md px-2 py-1 text-xs ${isDark ? "bg-emerald-900/30 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>+ Shortlist</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {!isTypingThis && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {missing.map((f) => (
                            <button
                              key={`${message.id}-missing-${f}`}
                              onClick={() => setInput((p) => `${p}${p ? "\n" : ""}${cap(f)}: `)}
                              className={`rounded-full border px-3 py-1 text-xs transition-all duration-200 ${isDark ? "border-amber-950/40 text-stone-300 hover:border-amber-800/60" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                            >
                              Add {cap(f)}
                            </button>
                          ))}
                          {quickFilters.map((f) => (
                            <button
                              key={`${message.id}-filter-${f}`}
                              onClick={() => setInput((p) => `${p}${p ? "\n" : ""}${f}`)}
                              className={`rounded-full border px-3 py-1 text-xs transition-all duration-200 ${isDark ? "border-amber-950/40 text-stone-300 hover:border-amber-800/60" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                        )}

                        {!isTypingThis && (
                        <div className="mt-4 flex flex-wrap items-center gap-2 opacity-75 transition-opacity duration-200 hover:opacity-100">
                          <button onClick={() => void handleCopy(message)} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-all duration-200 ${isDark ? "border-amber-950/40 bg-[#231b14] text-stone-300 hover:border-amber-800/60" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`}>
                            <CopyIcon className="h-3.5 w-3.5" />
                            {copiedMessageId === message.id ? "Copied" : "Copy"}
                          </button>
                          <button onClick={() => void handleShare(message)} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-all duration-200 ${isDark ? "border-amber-950/40 bg-[#231b14] text-stone-300 hover:border-amber-800/60" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`}>
                            <ShareIcon className="h-3.5 w-3.5" />
                            {sharedMessageId === message.id ? "Shared" : "Share"}
                          </button>
                          <button onClick={() => void regenerateStrict(index)} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-all duration-200 ${isDark ? "border-amber-950/40 bg-[#231b14] text-stone-300 hover:border-amber-800/60" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`}>
                            <SparkIcon className="h-3.5 w-3.5" />
                            Regenerate official-only
                          </button>
                        </div>
                        )}

                        {!isTypingThis && message.sources && message.sources.length > 0 && (
                          <div className={`mt-4 border-t pt-3 ${isDark ? "border-amber-950/50" : "border-slate-100"}`}>
                            <p className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] ${isDark ? "text-stone-500" : "text-stone-500"}`}>Sources</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {message.sources.map((source, idx) => {
                                const host = extractHostname(source.url);
                                const type = classifySourceType(source);
                                return (
                                  <a
                                    key={`${source.url}-${idx}`}
                                    id={`src-${idx + 1}`}
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`rounded-xl border p-3 transition-all duration-200 hover:-translate-y-0.5 ${isDark ? "border-amber-950/40 bg-[#231b14] hover:bg-[#2d241b]" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}
                                  >
                                    <p className={`line-clamp-1 text-xs font-semibold ${isDark ? "text-stone-100" : "text-slate-800"}`}>[{idx + 1}] {source.title}</p>
                                    <p className={`mt-0.5 text-[11px] ${isDark ? "text-stone-400" : "text-stone-500"}`}>{host} · {type}</p>
                                    {source.snippet && <p className={`mt-1 line-clamp-2 text-xs ${isDark ? "text-stone-400" : "text-slate-600"}`}>{source.snippet}</p>}
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}

                  {loading && (
                    <div className={`w-full px-1 py-2 text-sm ${isDark ? "text-stone-300" : "text-slate-600"}`}>
                      <div className="inline-flex items-center">
                        <FlowerSpinner className="h-10 w-10" isDark={isDark} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-3 pt-10 md:px-8 md:pb-4 md:pt-16">
                <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-44 ${isDark ? "bg-gradient-to-t from-[#18130f] via-[#18130f]/85 to-transparent" : "bg-gradient-to-t from-white via-white/88 to-transparent"}`} />
                <div className="relative mx-auto w-full max-w-4xl pointer-events-auto">{renderComposer()}</div>
                {hasUncertainEvidence && (
                  <p
                    className={`pointer-events-none mx-auto mt-2 w-full max-w-4xl px-2 text-center text-[10px] md:text-[11px] ${
                      isDark ? "text-stone-500" : "text-stone-500"
                    }`}
                  >
                    Some responses may include uncertain claims when source evidence is limited.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {showMobileHistory && (
        <div className="absolute inset-0 z-40 md:hidden">
          <button
            onClick={() => setShowMobileHistory(false)}
            className="absolute inset-0 bg-black/35"
            aria-label="Close history panel"
          />
          <aside className={`absolute left-0 top-0 h-full w-[85%] max-w-[320px] border-r p-4 ${isDark ? "border-amber-950/40 bg-[#231b14]" : "border-slate-200 bg-white"}`}>
            <div className="mb-3 flex items-center justify-between">
              <p className={`text-sm font-semibold ${isDark ? "text-stone-100" : "text-slate-900"}`}>Recent searches</p>
              <button
                onClick={() => setShowMobileHistory(false)}
                className={`rounded-lg border px-2 py-1 text-xs ${isDark ? "border-amber-950/40 text-stone-300" : "border-slate-300 text-slate-700"}`}
              >
                Close
              </button>
            </div>
            <button
              onClick={resetConversation}
              className={`mb-3 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm ${isDark ? "border-amber-950/40 bg-[#2d241b]" : "border-slate-200 bg-slate-50"}`}
            >
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${isDark ? "border-amber-900/50" : "border-slate-300"}`}>
                <PlusIcon className="h-3.5 w-3.5" />
              </span>
              New Search
            </button>
            <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
              {historyTurns.map((turn) => (
                <button
                  key={`mobile-${turn.id}`}
                  onClick={() => {
                    jumpToMessage(turn.id);
                    setShowMobileHistory(false);
                  }}
                  className={`w-full rounded-lg px-2 py-2 text-left text-sm ${
                    activeHistoryId === turn.id
                      ? isDark ? "bg-[#3a2d21] text-stone-100" : "bg-slate-200/70 text-slate-900"
                      : isDark ? "text-stone-300 hover:bg-[#2d241b]" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {turn.label}
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}

      {showCompare && (
        <div className="absolute inset-y-0 right-0 z-30 w-[380px] border-l border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Shortlist Compare</h3>
            <button onClick={() => setShowCompare(false)} className="rounded border px-2 py-1 text-xs">Close</button>
          </div>
          {shortlist.length === 0 ? (
            <p className="text-sm text-stone-500">No schemes shortlisted yet.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border px-2 py-1 text-left">Scheme</th>
                    <th className="border px-2 py-1 text-left">Benefit</th>
                    <th className="border px-2 py-1 text-left">Deadline</th>
                    <th className="border px-2 py-1 text-left">Effort</th>
                  </tr>
                </thead>
                <tbody>
                  {shortlist.map((s, i) => (
                    <tr key={`${s.name}-${i}`}>
                      <td className="border px-2 py-1">{s.name}</td>
                      <td className="border px-2 py-1">{s.benefit}</td>
                      <td className="border px-2 py-1">{s.deadline}</td>
                      <td className="border px-2 py-1">{s.effort}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {authEnabled && showAuthModal && !session && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-4">
          <button
            onClick={() => {
              if (authLoading || authGoogleLoading) return;
              setShowAuthModal(false);
            }}
            className="absolute inset-0 bg-black/45"
            aria-label="Close sign in"
          />
          <div className={`relative w-full max-w-md rounded-3xl border p-6 shadow-[0_16px_40px_rgba(15,23,42,0.16)] ${isDark ? "border-amber-950/40 bg-[#231b14]" : "border-slate-200 bg-white"}`}>
            <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? "text-stone-400" : "text-slate-500"}`}>Yojana AI</p>
            <h2 className="mt-2 text-2xl font-semibold">Sign in to continue</h2>
            <p className={`mt-2 text-sm ${isDark ? "text-stone-300" : "text-slate-600"}`}>
              {pendingMessage ? "Complete login and your message will be sent automatically." : "Continue to use the scheme assistant."}
            </p>

            <button
              onClick={startGoogleAuth}
              disabled={authGoogleLoading}
              className={`mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-all ${
                isDark
                  ? "border-amber-900/50 bg-[#2d241b] text-stone-100 hover:bg-[#3a2d21]"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              } disabled:opacity-70`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.2 0-5.9-2.6-5.9-5.9s2.7-5.9 5.9-5.9c1.8 0 3 .8 3.7 1.4l2.5-2.4C16.7 3.8 14.6 3 12 3 7 3 3 7 3 12s4 9 9 9c5.2 0 8.6-3.6 8.6-8.7 0-.6-.1-1.1-.2-1.5H12z" />
              </svg>
              {authGoogleLoading ? "Redirecting to Google..." : "Continue with Google"}
            </button>

            <div className="mt-4 flex items-center gap-3">
              <div className={`h-px flex-1 ${isDark ? "bg-amber-950/40" : "bg-slate-200"}`} />
              <span className={`text-xs ${isDark ? "text-stone-400" : "text-slate-500"}`}>or use email</span>
              <div className={`h-px flex-1 ${isDark ? "bg-amber-950/40" : "bg-slate-200"}`} />
            </div>

            <div className={`mt-4 inline-flex rounded-full border p-0.5 ${isDark ? "border-amber-950/40 bg-[#2d241b]" : "border-slate-200 bg-slate-50"}`}>
              {[
                { key: "signup", label: "Sign up" },
                { key: "signin", label: "Sign in" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    setAuthMode(opt.key as "signup" | "signin");
                    setAuthError(null);
                    setAuthNotice(null);
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    authMode === opt.key
                      ? isDark ? "bg-[#3a2d21] text-stone-100" : "bg-white text-slate-900 shadow-sm"
                      : isDark ? "text-stone-300" : "text-slate-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Email"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${isDark ? "border-amber-950/40 bg-[#2d241b] text-stone-100 placeholder:text-stone-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"}`}
              />
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${isDark ? "border-amber-950/40 bg-[#2d241b] text-stone-100 placeholder:text-stone-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"}`}
              />
            </div>

            {authError && <p className="mt-3 text-sm text-rose-500">{authError}</p>}
            {authNotice && <p className={`mt-3 text-sm ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{authNotice}</p>}

            <button
              onClick={() => void submitAuth()}
              disabled={authLoading}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-sm font-medium text-white disabled:opacity-70"
            >
              {authLoading ? "Please wait..." : authMode === "signup" ? "Create account" : "Sign in"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
