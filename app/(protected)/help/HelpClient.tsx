"use client";

import { useState, useRef } from "react";
import { cn } from "@/lib/utils";

// ─── FAQ Data ──────────────────────────────────────────────────────────────────

const CLIENT_FAQS = [
  {
    q: "How do I view my item catalog?",
    a: "Click \"Catalog\" in the top navigation. You'll see all your items organized by status — Pending Review, Approved, Listed, Sold, and more. Use the filters to narrow down by room, category, or route.",
  },
  {
    q: "What does each item status mean?",
    a: "Pending Review — item has been added and is awaiting your team's assessment. Approved — ready to list or act on. Listed — actively for sale. Sold — transaction complete. Donated / Discarded — item has left the home. Rejected / Revisit — needs another look.",
  },
  {
    q: "How does consignment work?",
    a: "Items routed to consignment (FB/Marketplace, eBay, or Other Consignment Store) are sold on your behalf. Your share of the sale proceeds is tracked on the Sales page. Once an item sells, your payout is calculated automatically and recorded when payment is sent.",
  },
  {
    q: "Where can I see my project plan and timeline?",
    a: "The Plan page (top nav) shows your project schedule day-by-day. You can see scheduled dates, estimated hours, and the overall project timeline your TTT team has mapped out.",
  },
  {
    q: "How do I pay my invoice?",
    a: "Open the Invoices page from your nav. Each invoice has a \"Pay\" link — click it to complete payment via the secure payment portal. You can also see your balance and payment history there.",
  },
  {
    q: "Can I add photos or notes to my items?",
    a: "TTT staff manage item details and photos on your behalf. If you need to flag something or add context to a specific item, use the Help Ticket form below and reference the item name.",
  },
  {
    q: "What should I do if something looks wrong?",
    a: "Use the Help Ticket form below. Include the item name or page where you noticed the issue, a brief description, and any screenshots if helpful. Our team typically responds within one business day.",
  },
];

const STAFF_FAQS = [
  {
    q: "How do I add a new item to a project catalog?",
    a: "Navigate to Catalog and select the project, then click \"Add Item\". Upload a photo and Claude AI will pre-fill name, category, and suggested value. Review and confirm before saving.",
  },
  {
    q: "How do I bulk-route or bulk-update items?",
    a: "On the Catalog page, use the checkbox to select multiple items. A bulk action bar will appear at the bottom allowing you to update route, status, or category for all selected items at once.",
  },
  {
    q: "How do I create a quote for a client?",
    a: "Go to Quoting (Manager/Admin only) and select the project. You can use Room-based quoting (uses the rooms you've added with actual SF and density) or Quick Quote mode (enter SF by density level). Set the touch level, review service line items, then save a draft or send for client signature.",
  },
  {
    q: "How do I log time against a project?",
    a: "From the Home page, find the Time Tracker section and select the project. Enter your hours, select the service type, add any notes, and save. Logged hours appear on the project's Plan page.",
  },
  {
    q: "How do I assign an item to a local vendor?",
    a: "Edit the item and set the Route to \"Other Consignment Store\", then select the vendor from the dropdown. The vendor will appear in the admin local-vendors page and can receive an email notification.",
  },
  {
    q: "How do I send a client their project portal access?",
    a: "From the project's Home page, click \"Add Client User\". Enter their email and role (Owner or Collaborator) and they'll receive a branded welcome email with a one-click login link.",
  },
  {
    q: "How do I mark a consignment payout as paid?",
    a: "Go to the project's Sales page, find the item in the relevant consignment table, and update the \"Paid\" column with the amount sent. You can also use the payout batch tool from the Sales summary section.",
  },
  {
    q: "What do I do if I can't edit an item or page?",
    a: "Check that you're viewing the correct project (use the Project Switcher in the top nav). If the issue persists, submit a Help Ticket below — include the item/page name and describe what you expected vs. what happened.",
  },
];

// ─── Accordion ────────────────────────────────────────────────────────────────

function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
      {items.map((item, i) => (
        <div key={i}>
          <button
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className="text-sm font-semibold text-gray-900 pr-4">{item.q}</span>
            <svg
              className={cn("w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200", open === i && "rotate-180")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {open === i && (
            <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed bg-gray-50/50">
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Help Ticket Form ─────────────────────────────────────────────────────────

function HelpTicketForm({ userEmail, userTypeLabel }: { userEmail: string; userTypeLabel: string }) {
  const [subject, setSubject] = useState("");
  const [email, setEmail] = useState(userEmail);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const inputClass = "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent transition";

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...picked].slice(0, 5));
  }

  function removeFile(i: number) {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !email.trim() || !message.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("subject", subject.trim());
      fd.append("email", email.trim());
      fd.append("message", message.trim());
      fd.append("userType", userTypeLabel);
      files.forEach((f, i) => fd.append(`file_${i}`, f));

      const res = await fetch("/api/help", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center text-center py-10 px-6">
        <div className="w-14 h-14 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-lg font-bold text-gray-900 mb-1">Message received!</p>
        <p className="text-sm text-gray-500 max-w-sm">
          Thanks for reaching out. Our team will review your message and get back to you as soon as possible — usually within one business day.
        </p>
        <button
          onClick={() => { setSent(false); setSubject(""); setMessage(""); setFiles([]); }}
          className="mt-6 text-sm text-forest-600 hover:text-forest-700 font-medium"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Subject <span className="text-red-400">*</span></label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className={inputClass}
            placeholder="Briefly describe your issue"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Your Email <span className="text-red-400">*</span></label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Message <span className="text-red-400">*</span></label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={5}
          className={cn(inputClass, "resize-none")}
          placeholder="Describe what you were doing, what you expected, and what happened instead…"
        />
      </div>

      {/* File upload */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Screenshots / Files <span className="text-gray-400 font-normal normal-case">(optional, up to 5)</span></label>
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl px-5 py-4 text-center cursor-pointer hover:border-forest-300 hover:bg-forest-50/30 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <svg className="w-6 h-6 text-gray-300 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-gray-400">Click to attach files</p>
          <input ref={fileRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={handleFiles} />
        </div>
        {files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-3 py-1.5 text-xs text-gray-700">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="truncate max-w-[140px]">{f.name}</span>
                <button type="button" onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500 ml-0.5">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={sending || !subject.trim() || !message.trim()}
        className="w-full sm:w-auto h-11 px-8 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 disabled:opacity-40 transition-colors flex items-center gap-2"
      >
        {sending ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Sending…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Send Message
          </>
        )}
      </button>
    </form>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface HelpClientProps {
  userEmail: string;
  userName: string;
  userTypeLabel: string;
  isStaff: boolean;
  isClient: boolean;
}

export function HelpClient({ userEmail, userName: _userName, userTypeLabel, isStaff, isClient }: HelpClientProps) {
  const faqs = isStaff ? STAFF_FAQS : CLIENT_FAQS;
  const faqLabel = isStaff ? "Staff" : "Client";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-gray-900">Help &amp; Support</h1>
        <p className="text-gray-500 mt-1">
          {isClient
            ? "Find answers to common questions about your project, or send us a message."
            : "Quick answers for the team, plus a direct line to the admin."}
        </p>
      </div>

      {/* FAQ Section */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-4 h-4 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-base font-bold text-gray-900">{faqLabel} FAQ</h2>
        </div>
        <Accordion items={faqs} />
      </section>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-10">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Still need help?</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {/* Ticket Form */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-12">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-0.5">
            <svg className="w-4 h-4 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h2 className="text-base font-bold text-gray-900">Submit a Help Ticket</h2>
          </div>
          <p className="text-sm text-gray-500">
            Your message goes directly to the TTT admin team. We&rsquo;ll reply to your email as soon as possible.
          </p>
        </div>
        <div className="px-6 py-6">
          <HelpTicketForm userEmail={userEmail} userTypeLabel={userTypeLabel} />
        </div>
      </section>
    </div>
  );
}
