"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
  displayName?: string;
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

function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M10.3 2.7h3.4l.5 2.1a7.8 7.8 0 0 1 1.7.7l1.9-1 2.4 2.4-1 1.9c.3.5.5 1.1.7 1.7l2.1.5v3.4l-2.1.5a7.8 7.8 0 0 1-.7 1.7l1 1.9-2.4 2.4-1.9-1a7.8 7.8 0 0 1-1.7.7l-.5 2.1h-3.4l-.5-2.1a7.8 7.8 0 0 1-1.7-.7l-1.9 1-2.4-2.4 1-1.9a7.8 7.8 0 0 1-.7-1.7l-2.1-.5v-3.4l2.1-.5a7.8 7.8 0 0 1 .7-1.7l-1-1.9 2.4-2.4 1.9 1a7.8 7.8 0 0 1 1.7-.7z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.5c1.9-3.4 4.1-4.8 6.5-4.8s4.6 1.4 6.5 4.8" />
    </svg>
  );
}

function JanInfraBadge({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 237 231" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-label="JanInfra badge">
      <path d="M28.2674 38.5563C50.3524 11.6561 87.2779 -5.59704 144.542 3.4072L144.818 3.45058L145.09 3.51088C173.757 9.85931 231.137 41.5445 235.981 117.543C236.299 122.522 232.525 126.817 227.552 127.135C222.579 127.453 218.29 123.674 217.973 118.694C213.81 53.3864 165.023 26.5513 141.457 21.2141C89.7218 13.1542 59.6201 28.8217 42.2067 50.0317C24.343 71.7903 18.6293 100.86 19.0686 121.233C24.6694 167.004 46.2432 190.387 70.1066 201.879C94.3303 213.545 122.035 213.458 140.387 209.607C150.235 205.302 153.169 200.78 153.974 197.667C154.879 194.17 153.964 189.25 149.922 182.786C141.811 169.817 124.782 156.626 112.155 149.781C91.6891 138.686 80.9025 126.684 80.5419 113.624C80.1807 100.533 90.3668 92.2017 97.2744 88.6315L97.5416 88.4933L97.817 88.3734C115.395 80.7246 131.735 79.9667 146.37 84.3088C160.835 88.601 172.911 97.6546 182.606 108.455C201.821 129.857 213.078 159.647 215.985 180.09C216.688 185.03 213.258 189.605 208.325 190.308C203.391 191.012 198.823 187.577 198.12 182.637C195.639 165.183 185.655 138.88 169.186 120.535C161.04 111.461 151.663 104.727 141.243 101.635C131.064 98.6146 119.181 98.8509 105.309 104.816C100.727 107.259 98.511 110.6 98.5806 113.125C98.6524 115.726 101.211 123.3 120.746 133.89C134.811 141.515 154.812 156.559 165.216 173.195C170.431 181.533 174.145 191.758 171.443 202.199C168.662 212.948 159.879 221.009 146.64 226.585L145.88 226.906L145.073 227.082C123.939 231.718 91.4371 232.204 62.2852 218.164C32.4815 203.811 7.31041 174.787 1.09964 122.959L1.04971 122.539L1.03869 122.117C0.437498 98.8384 6.72275 64.7984 28.2674 38.5563ZM118.426 37.8203C140.289 38.2129 160.419 47.6458 172.418 56.1595C176.484 59.0444 177.445 64.6834 174.564 68.7548C171.683 72.8262 166.052 73.7881 161.986 70.9033C152.055 63.8566 135.381 56.1977 118.102 55.8875C101.584 55.591 83.9754 61.9259 70.1374 83.8596C64.0648 95.5671 59.4141 113.685 63.9799 130.494C68.3497 146.582 81.7578 163.614 116.457 172.618C121.281 173.869 124.178 178.799 122.928 183.63C121.678 188.46 116.755 191.361 111.931 190.11C72.3433 179.838 52.9809 158.848 46.5675 135.238C40.3904 112.497 46.8212 89.4129 54.3302 75.1333L54.488 74.8333L54.6679 74.5458C72.0818 46.7124 95.8718 37.4154 118.426 37.8203Z" fill="currentColor"/>
      <path d="M27.4941 37.9217C49.8362 10.7083 87.1364 -6.63208 144.697 2.41882L144.974 2.46277L145.004 2.46765L145.034 2.47448L145.307 2.53405L146.685 2.85339C176.054 9.95547 232.174 42.0981 236.979 117.478C237.332 123.008 233.141 127.779 227.616 128.133C222.091 128.486 217.327 124.287 216.975 118.758C212.85 54.0505 164.552 27.4833 141.265 22.1962C89.8512 14.1963 60.1327 29.7729 42.9794 50.6659C25.3272 72.1669 19.6428 100.946 20.0673 121.157C25.6378 166.578 47.0084 189.645 70.54 200.978C94.4674 212.502 121.875 212.447 140.076 208.649C149.688 204.427 152.307 200.117 153.006 197.416C153.812 194.301 153.05 189.674 149.074 183.316C141.09 170.55 124.226 157.462 111.679 150.66C91.1636 139.539 79.9185 127.291 79.5419 113.651C79.1647 99.9737 89.7947 91.3717 96.8154 87.743L97.1122 87.5897L97.1425 87.576L97.4179 87.4559L98.2499 87.0985C115.712 79.6975 132.009 79.0051 146.654 83.3505C161.344 87.7093 173.569 96.8908 183.351 107.786C202.717 129.358 214.045 159.341 216.976 179.949C217.755 185.435 213.947 190.516 208.466 191.298C202.985 192.079 197.911 188.264 197.131 182.778C194.672 165.489 184.759 139.379 168.442 121.203C160.382 112.225 151.154 105.619 140.958 102.594C131.03 99.6481 119.402 99.8544 105.747 105.717C101.328 108.083 99.5259 111.136 99.58 113.098C99.6361 115.124 101.746 122.452 121.223 133.011C135.367 140.679 155.532 155.826 166.063 172.665C171.342 181.106 175.212 191.624 172.411 202.449C169.521 213.617 160.42 221.866 147.028 227.507L146.268 227.827L146.184 227.863L145.286 228.058L145.287 228.059C123.998 232.729 91.2565 233.227 61.8515 219.065C31.7225 204.555 6.35537 175.225 0.106387 123.078L0.0565822 122.657L0.0507229 122.611L0.0497463 122.565L0.0390041 122.142C-0.566302 98.7051 5.75253 64.4038 27.4941 37.9217ZM144.387 4.39538C87.4196 -4.56217 50.8678 12.6035 29.04 39.1903C7.69235 65.1924 1.44095 98.9717 2.03803 122.091L2.04779 122.468L2.09272 122.84L2.24018 124.043C8.65505 174.797 33.4707 203.178 62.7187 217.264C91.6174 231.181 123.879 230.707 144.858 226.105L145.577 225.947L146.252 225.664C159.337 220.152 167.802 212.277 170.475 201.948C173.076 191.892 169.519 181.96 164.368 173.724C154.091 157.292 134.255 142.351 120.269 134.769C100.678 124.149 97.6687 116.329 97.581 113.152C97.4961 110.069 100.117 106.451 104.839 103.933L104.876 103.914L104.914 103.897C118.984 97.8466 131.107 97.584 141.527 100.676C152.172 103.834 161.699 110.698 169.931 119.867C186.551 138.381 196.605 164.877 199.11 182.496C199.735 186.89 203.798 189.943 208.184 189.318C212.569 188.693 215.62 184.626 214.995 180.231C212.112 159.954 200.924 130.357 181.862 109.123C172.252 98.4184 160.326 89.493 146.085 85.2675C131.694 80.9975 115.596 81.7274 98.2158 89.2899L97.9765 89.3934L97.7333 89.5194C90.939 93.0311 81.1969 101.092 81.5419 113.597C81.8865 126.076 92.2152 137.833 112.632 148.901C125.338 155.79 142.532 169.084 150.769 182.256C154.878 188.826 155.946 194.038 154.942 197.917C154.032 201.434 150.798 206.147 140.788 210.523L140.693 210.564L140.593 210.586C122.087 214.469 94.1464 214.567 69.6728 202.78C45.4858 191.132 23.716 167.444 18.0761 121.354L18.0703 121.305L18.0683 121.255C17.6256 100.724 23.3743 71.3943 41.4335 49.3973C59.1029 27.8755 89.5777 12.1192 141.61 20.2255L141.644 20.2313L141.678 20.2391C165.533 25.6421 214.771 52.7495 218.971 118.63C219.253 123.059 223.068 126.419 227.488 126.137C231.909 125.854 235.266 122.036 234.983 117.606C230.176 42.1872 173.253 10.772 144.874 4.48718L144.634 4.43347L144.387 4.39538ZM118.443 36.8202C140.561 37.2173 160.884 46.7487 172.997 55.3436C177.513 58.548 178.579 64.8104 175.38 69.3319C172.18 73.8542 165.924 74.9236 161.407 71.7186C151.591 64.7534 135.108 57.1933 118.084 56.8876C101.905 56.5971 84.6441 62.7649 71.0068 84.3563C65.0173 95.9225 60.4703 113.757 64.9453 130.232C69.2025 145.905 82.2817 162.717 116.708 171.649C122.067 173.04 125.284 178.516 123.896 183.88C122.508 189.244 117.039 192.469 111.68 191.078C71.8216 180.736 52.1291 159.527 45.6025 135.5C39.3384 112.439 45.8614 89.0899 53.4453 74.6678L53.6035 74.3671L53.6201 74.3348L53.6406 74.3026L53.8203 74.0155C71.4307 45.868 95.5586 36.4094 118.443 36.8202ZM118.407 38.8202C96.1845 38.4213 72.7328 47.5569 55.5156 75.076L55.3525 75.3368L55.2148 75.5985C47.7808 89.7356 41.442 112.555 47.5322 134.975C53.8324 158.169 72.8652 178.94 112.183 189.141C116.47 190.254 120.848 187.675 121.96 183.379C123.071 179.082 120.494 174.699 116.206 173.586C81.2342 164.512 67.4972 147.259 63.0146 130.757C58.3627 113.631 63.1035 95.2493 69.2499 83.3993L69.2695 83.3612L69.2919 83.326C83.327 61.0801 101.273 54.5851 118.12 54.8876C135.653 55.2025 152.519 62.9598 162.564 70.0878C166.179 72.6524 171.185 71.7972 173.747 68.1766C176.309 64.5553 175.455 59.5398 171.84 56.9745C159.955 48.542 140.016 39.2082 118.407 38.8202Z" fill="currentColor"/>
    </svg>
  );
}


function FlowerSpinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <defs>
        <path id="petal" d="M32 10 C36 16, 36 24, 32 30 C28 24, 28 16, 32 10Z" />
        <path id="innerPetal" d="M32 16 C34.8 20.5, 34.8 26, 32 29.5 C29.2 26, 29.2 20.5, 32 16Z" />
      </defs>

      <circle cx="32" cy="32" r="26" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.1" />

      <g stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" opacity="1">
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

        <g opacity="0.72">
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

        <circle cx="32" cy="32" r="5.4" fill="currentColor" fillOpacity="0.12" stroke="none">
          <animate attributeName="r" values="5;6.2;5" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="fill-opacity" values="0.12;0.2;0.12" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="32" cy="32" r="2.1" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

export default function Home() {
  const [authReady, setAuthReady] = useState(false);
  const [authGoogleLoading, setAuthGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authRetryUrl, setAuthRetryUrl] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [sharedMessageId, setSharedMessageId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, TabKey>>({});
  const [shortlist, setShortlist] = useState<SchemeCard[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [typedAssistant, setTypedAssistant] = useState<Record<string, string>>({});
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);

  const nextMessageId = useRef(1);
  const googleRedirectTimeoutRef = useRef<number | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const animatedAssistantIdsRef = useRef<Set<string>>(new Set());
  const isDark = theme === "dark";
  const brandColor = "var(--ji-brand)";
  const userLabel = session?.user?.displayName || session?.user?.email?.split("@")[0] || "";
  const composerPlaceholder = composerPlaceholders[language as keyof typeof composerPlaceholders] || composerPlaceholders.en;
  const starterChips = starterChipsByLanguage[language as keyof typeof starterChipsByLanguage] || starterChipsByLanguage.en;
  const hasConversation = useMemo(() => messages.some((m) => m.role === "user"), [messages]);

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
    const data = (await res.json()) as { id: string; email?: string; user_metadata?: { full_name?: string; name?: string } };
    return { id: data.id, email: data.email, displayName: data.user_metadata?.full_name || data.user_metadata?.name };
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
    setAuthRetryUrl(null);
    setAuthGoogleLoading(true);
    if (googleRedirectTimeoutRef.current) {
      window.clearTimeout(googleRedirectTimeoutRef.current);
    }
    const queued = (pendingMessage || input).trim();
    if (queued) localStorage.setItem(authPendingStorageKey, queued);
    const redirectTo = window.location.origin;
    const url = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
    const currentUrl = window.location.href;
    googleRedirectTimeoutRef.current = window.setTimeout(() => {
      // If still on the same page after waiting, expose a manual fallback.
      if (window.location.href === currentUrl && document.visibilityState === "visible") {
        setAuthGoogleLoading(false);
        setAuthRetryUrl(url);
        setAuthError("Google sign-in is taking too long. Tap Continue again or use the direct fallback link.");
      }
    }, 9000);
    window.location.href = url;
  };

  const handleSignOut = () => {
    persistSession(null);
    setMessages([]);
    setShortlist([]);
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
      if (googleRedirectTimeoutRef.current) window.clearTimeout(googleRedirectTimeoutRef.current);
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

  const resetConversation = () => {
    setMessages([]);
    setInput("");
    setActiveTabs({});
    setShortlist([]);
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
    const text = `JanInfra\n\n${message.content}`;
    if (navigator.share) {
      await navigator.share({ title: "JanInfra response", text, url: window.location.href });
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
    const html = `<!doctype html><html><head><title>JanInfra Summary</title><style>body{font-family:Arial;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}</style></head><body><h1>JanInfra Summary</h1><h3>Profile prompt</h3><p>${latestUser}</p><h3>Shortlisted schemes</h3><table><thead><tr><th>Scheme</th><th>Benefit</th><th>Deadline</th><th>Effort</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
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
          className={`w-full min-h-[52px] resize-none overflow-hidden bg-transparent text-[17px] leading-7 outline-none placeholder:opacity-55 md:min-h-[60px] md:text-[18px] ${
            isDark ? "text-stone-100 placeholder:text-[var(--ji-placeholder)]" : "text-slate-900 placeholder:text-[var(--ji-placeholder)]"
          }`}
          placeholder={composerPlaceholder}
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pr-1">
            <div
              className={`inline-flex h-10 items-center rounded-full border p-0.5 ${
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
                  className={`inline-flex h-full items-center rounded-full px-3 text-xs transition-colors duration-200 ${
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
              className={`inline-flex h-10 items-center gap-1 rounded-full border px-3 text-xs transition-all duration-200 ${
                isDark ? "border-amber-950/40 text-stone-300 hover:border-amber-800/60 hover:bg-[#2d241b]" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add profile
            </button>
          </div>
          <button
            onClick={() => void sendMessage()}
            disabled={loading || input.trim().length === 0}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform duration-200 ${
              input.trim().length === 0 || loading
                ? "bg-transparent text-[var(--ji-brand)] shadow-none"
                : "bg-gradient-to-br from-orange-500 to-amber-500 hover:scale-[1.03]"
            } disabled:opacity-90`}
          >
            {input.trim().length === 0 || loading ? <FlowerSpinner className="h-10 w-10 text-[var(--ji-brand)]" /> : "↑"}
          </button>
        </div>
      </div>
    </div>
  );

  if (!authReady) {
    return (
      <main className={`theme-${theme} relative flex h-screen items-center justify-center bg-[var(--background)] text-[var(--foreground)]`}>
        <FlowerSpinner className="h-12 w-12 text-[var(--ji-brand)]" />
      </main>
    );
  }

  return (
    <main className={`theme-${theme} relative h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]`}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{ backgroundImage: "linear-gradient(to right, var(--ji-topbar-start), var(--ji-topbar-mid), var(--ji-topbar-end))" }}
      />
      <div className="flex h-full">
        <section className="flex min-w-0 flex-1 flex-col">
          <header className={`relative z-30 flex h-[64px] items-center justify-between px-3 md:px-8 ${isDark ? "border-b border-amber-950/50 bg-[#18130f]/85" : "border-b border-slate-200 bg-white/60"}`}>
            <div className="flex items-center gap-2">
              <JanInfraBadge className="h-8 w-8" style={{ color: brandColor }} />
              <button
                onClick={resetConversation}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs md:px-3.5 md:text-sm ${isDark ? "border-amber-950/40 bg-[#231b14] text-stone-200 hover:bg-[#2d241b]" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                New search
              </button>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setTheme((p) => (p === "dark" ? "light" : "dark"))}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs md:text-sm ${isDark ? "border-amber-950/40 bg-[#231b14] text-stone-200 hover:bg-[#2d241b]" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {isDark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
                {isDark ? "Light" : "Dark"}
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowSettingsMenu((p) => !p)}
                  className={`inline-flex h-10 items-center gap-2 rounded-full border px-3 text-xs md:text-sm ${isDark ? "border-amber-950/40 bg-[#231b14] text-stone-300 hover:bg-[#2d241b]" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                  aria-label="Open account menu"
                >
                  <UserIcon className="h-4 w-4" />
                  <span className="max-w-[110px] truncate">{session && userLabel ? userLabel : "Account"}</span>
                  <GearIcon className="h-4 w-4" />
                </button>
                {showSettingsMenu && (
                  <>
                    <button
                      onClick={() => setShowSettingsMenu(false)}
                      className="fixed inset-0 z-40 md:hidden"
                      aria-label="Close account menu"
                    />
                    <div className={`fixed left-3 right-3 top-[76px] z-50 rounded-2xl border p-2 shadow-xl md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:w-56 ${isDark ? "border-amber-950/40 bg-[#231b14]" : "border-slate-200 bg-white"}`}>
                    <button
                      onClick={() => {
                        resetConversation();
                        setShowSettingsMenu(false);
                      }}
                      className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${isDark ? "text-stone-200 hover:bg-[#2d241b]" : "text-slate-800 hover:bg-slate-50"}`}
                    >
                      New search
                    </button>
                    <button
                      onClick={() => {
                        setShowCompare((p) => !p);
                        setShowSettingsMenu(false);
                      }}
                      className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${isDark ? "text-stone-200 hover:bg-[#2d241b]" : "text-slate-800 hover:bg-slate-50"}`}
                    >
                      Shortlist ({shortlist.length})
                    </button>
                    <button
                      onClick={() => {
                        downloadSummary();
                        setShowSettingsMenu(false);
                      }}
                      disabled={shortlist.length === 0}
                      className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm disabled:opacity-50 ${isDark ? "text-stone-200 hover:bg-[#2d241b]" : "text-slate-800 hover:bg-slate-50"}`}
                    >
                      Download PDF
                    </button>
                    <div className={`mb-2 mt-1 border-t pt-2 ${isDark ? "border-amber-950/40" : "border-slate-200"}`}>
                      <p className={`mb-1 px-1 text-[11px] uppercase tracking-[0.12em] ${isDark ? "text-stone-500" : "text-slate-500"}`}>Language</p>
                      <div className="inline-flex w-full items-center rounded-full border p-0.5">
                        {[
                          { value: "en", label: "EN" },
                          { value: "hi", label: "हिंदी" },
                          { value: "mr", label: "मराठी" },
                        ].map((lang) => (
                          <button
                            key={`menu-${lang.value}`}
                            onClick={() => setLanguage(lang.value)}
                            className={`flex-1 rounded-full px-2 py-1 text-xs ${
                              language === lang.value
                                ? isDark ? "bg-[#3a2d21] text-stone-100" : "bg-slate-100 text-slate-900"
                                : isDark ? "text-stone-300" : "text-slate-600"
                            }`}
                          >
                            {lang.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {authEnabled && session && (
                      <button
                        onClick={() => {
                          handleSignOut();
                          setShowSettingsMenu(false);
                        }}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm ${isDark ? "text-stone-200 hover:bg-[#2d241b]" : "text-slate-800 hover:bg-slate-50"}`}
                      >
                        Sign out
                      </button>
                    )}
                    {authEnabled && !session && (
                      <button
                        onClick={() => {
                          setAuthError(null);
                          setAuthNotice(null);
                          setShowAuthModal(true);
                          setShowSettingsMenu(false);
                        }}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm ${isDark ? "text-stone-200 hover:bg-[#2d241b]" : "text-slate-800 hover:bg-slate-50"}`}
                      >
                        Sign in
                      </button>
                    )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {!hasConversation ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 pb-10">
              <Image
                src="/janinfra-logo.svg"
                alt="JanInfra"
                width={1671}
                height={233}
                priority
                className={`mb-8 h-auto w-[210px] md:w-[320px] ${isDark ? "opacity-85" : "opacity-95"}`}
              />
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
                        <FlowerSpinner className="h-10 w-10 text-[var(--ji-brand)]" />
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
              if (authGoogleLoading) return;
              setShowAuthModal(false);
            }}
            className="absolute inset-0 bg-black/35 backdrop-blur-[5px]"
            aria-label="Close sign in"
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,0.38)_100%)]" />
          <div className={`relative w-full max-w-md rounded-3xl border p-6 shadow-[0_16px_40px_rgba(15,23,42,0.16)] ${isDark ? "border-amber-950/40 bg-[#231b14]" : "border-slate-200 bg-white"}`}>
            <p className={`text-xs font-semibold tracking-[0.16em] ${isDark ? "text-[#d9ad88]" : "text-[#C05020]"}`}>JANINFRA</p>
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

            {authError && <p className="mt-3 text-sm text-rose-500">{authError}</p>}
            {authNotice && <p className={`mt-3 text-sm ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{authNotice}</p>}
            {authRetryUrl && (
              <a
                href={authRetryUrl}
                className={`mt-3 inline-block text-sm underline underline-offset-2 ${
                  isDark ? "text-stone-200 hover:text-stone-100" : "text-slate-700 hover:text-slate-900"
                }`}
              >
                Open Google sign-in directly
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
