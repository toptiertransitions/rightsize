"use client";

import { useState, useEffect } from "react";
import type { Tenant, Invoice, InvoiceSettings, Service, Contract, TimeEntry, InvoiceExpenseItem } from "@/lib/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (inv: Invoice) => void;
  tenant: Tenant;
  services: Service[];
  contracts: Contract[];
  timeEntries: TimeEntry[];
  recipientOptions?: { label: string; email: string }[];
  ownerEmail?: string;
  currentUserEmail: string;
  invoiceSettings: InvoiceSettings | null;
  invoices?: Invoice[];
  defaultBillToName?: string;
}

type Tab = "Deposit" | "Full";
type DepositMode = "percent" | "amount";
type FullSource = "contract" | "logged" | "specific";

function fmt(n: number) {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function InvoiceCreatorModal({
  isOpen,
  onClose,
  onCreated,
  tenant,
  services,
  contracts,
  timeEntries,
  recipientOptions: recipientOptionsProp = [],
  ownerEmail = "",
  currentUserEmail,
  invoiceSettings,
  invoices = [],
  defaultBillToName,
}: Props) {
  const recipientOptions = recipientOptionsProp.length > 0
    ? recipientOptionsProp
    : ownerEmail ? [{ label: "Project Owner", email: ownerEmail }] : [];
  const [tab, setTab] = useState<Tab>("Deposit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [qboWarning, setQboWarning] = useState<{ message: string; invoice: Invoice } | null>(null);

  // Deposit state
  const [depositMode, setDepositMode] = useState<DepositMode>("percent");
  const [depositPercent, setDepositPercent] = useState(40);
  const [depositAmount, setDepositAmount] = useState("");
  const [selectedContractId, setSelectedContractId] = useState(contracts.length > 1 ? "__all__" : (contracts[0]?.id ?? ""));
  const [depositServiceId, setDepositServiceId] = useState(
    (services.find((s) => s.name.toLowerCase() === "services") ?? services[0])?.id ?? ""
  );

  // Full invoice state
  const [fullSource, setFullSource] = useState<FullSource>("contract");
  const [fullContractId, setFullContractId] = useState(contracts.length > 1 ? "__all__" : (contracts[0]?.id ?? ""));
  const [specificAmount, setSpecificAmount] = useState("");
  const [specificServiceId, setSpecificServiceId] = useState(services[0]?.id ?? "");

  // Deposit credit state — include both fully and partially paid deposits
  const paidDeposits = invoices.filter((inv) => inv.type === "Deposit" && (inv.status === "Paid" || inv.status === "PartiallyPaid"));
  function getDepositAmount(inv: (typeof paidDeposits)[number]): number {
    return inv.status === "PartiallyPaid" ? (inv.paidAmount ?? 0) : (inv.paidAmount ?? inv.amount);
  }
  const totalPaidDeposit = paidDeposits.reduce((s, inv) => s + getDepositAmount(inv), 0);
  // Per-deposit selection: default to all selected (matches previous "apply all" behaviour)
  const [selectedDepositIds, setSelectedDepositIds] = useState<Set<string>>(() => new Set(paidDeposits.map(d => d.id)));
  const selectedDepositTotal = paidDeposits
    .filter(d => selectedDepositIds.has(d.id))
    .reduce((s, d) => s + getDepositAmount(d), 0);

  // Promo code state (for Full Invoice — Logged Hours source)
  const [promoCode, setPromoCode] = useState("");
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoResult, setPromoResult] = useState<{ code: string; label: string; discountPercent: number; maxDiscount?: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  // Consignment earnings state
  const [includeConsignment, setIncludeConsignment] = useState(false);
  const [consignmentRaw, setConsignmentRaw] = useState("");
  const consignmentAmount = includeConsignment ? (parseFloat(consignmentRaw) || 0) : 0;

  // Expenses state
  const [expenseItems, setExpenseItems] = useState<InvoiceExpenseItem[]>([]);
  const [includeExpenses, setIncludeExpenses] = useState(true);
  const [expensesLoaded, setExpensesLoaded] = useState(false);
  const [editingExpenseIdx, setEditingExpenseIdx] = useState<number | null>(null);
  const [newExpense, setNewExpense] = useState<Partial<InvoiceExpenseItem> | null>(null);

  // Hours and expenses already billed in prior paid Full invoices
  const paidFullInvoices = invoices.filter(inv => inv.type === "Full" && inv.status === "Paid");

  const billedHoursByServiceId = new Map<string, number>();
  for (const inv of paidFullInvoices) {
    for (const li of (inv.lineItems ?? [])) {
      if (!li.serviceId) continue; // skip deposit-credit line items (serviceId === "")
      billedHoursByServiceId.set(li.serviceId, (billedHoursByServiceId.get(li.serviceId) ?? 0) + li.hours);
    }
  }

  const billedExpenseIds = new Set<string>(
    paidFullInvoices.flatMap(inv => (inv.expenseItems ?? []).map(ei => ei.expenseId).filter(Boolean) as string[])
  );

  // Fetch project expenses when Full tab is opened (once)
  useEffect(() => {
    if (tab !== "Full" || expensesLoaded) return;
    fetch(`/api/expenses?tenantId=${tenant.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.expenses) {
          setExpenseItems(
            d.expenses
              .filter((e: { id: string }) => !billedExpenseIds.has(e.id))
              .map((e: { id: string; vendor: string; description: string; date: string; total: number }) => ({
                expenseId: e.id,
                vendor: e.vendor,
                description: e.description,
                date: e.date,
                amount: e.total,
              }))
          );
        }
        setExpensesLoaded(true);
      })
      .catch(() => setExpensesLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, expensesLoaded, tenant.id]);

  const expensesTotal = includeExpenses ? expenseItems.reduce((s, e) => s + e.amount, 0) : 0;

  // Reset deposit selection to "all selected" when switching to Full tab
  useEffect(() => {
    if (tab === "Full") setSelectedDepositIds(new Set(paidDeposits.map(d => d.id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Bill To
  const [billToName, setBillToName] = useState(defaultBillToName ?? tenant.name);

  // Shared
  const [sendEmail, setSendEmail] = useState(true);
  const [toRecipient, setToRecipient] = useState(recipientOptions[0]?.email ?? "__custom__");
  const [customToEmail, setCustomToEmail] = useState("");
  const [ccEmail, setCcEmail] = useState(currentUserEmail);
  const useCustomTo = toRecipient === "__custom__";
  const sentToEmail = useCustomTo ? customToEmail : toRecipient;
  const [pushToQBO, setPushToQBO] = useState(true);

  // Deposit calc
  const selectedContract = contracts.find((c) => c.id === selectedContractId);
  const contractTotal = selectedContractId === "__all__"
    ? contracts.reduce((s, c) => s + c.totalCost, 0)
    : (selectedContract?.totalCost ?? 0);
  const depositAmountCalc =
    depositMode === "percent"
      ? Math.round((depositPercent / 100) * contractTotal * 100) / 100
      : parseFloat(depositAmount) || 0;

  // Full invoice calc
  const fullContract = contracts.find((c) => c.id === fullContractId);
  const contractLineItems = fullContractId === "__all__"
    ? contracts.flatMap((c) => c.lineItems ?? [])
    : (fullContract?.lineItems ?? []);
  const contractNetTotal = contractLineItems.reduce((s, li) => s + li.hours * li.rate, 0);
  const fullContractDiscount = fullSource === "contract"
    ? (fullContractId === "__all__"
        ? contracts.reduce((s, c) => s + (c.discountAmount ?? 0), 0)
        : (fullContract?.discountAmount ?? 0))
    : 0;
  const discountLineItem = fullContractDiscount > 0 ? {
    serviceId: "",
    serviceName: fullContractId === "__all__"
      ? "Discounts Applied"
      : `Discount — ${fullContract?.discountCode ?? "Code Applied"}`,
    hours: 1,
    rate: -fullContractDiscount,
  } : null;

  // Contracts that already have a discount code applied (used to show reminder)
  const contractDiscountReminder = contracts.find((c) => c.discountCode && (c.discountAmount ?? 0) > 0)?.discountCode ?? null;

  // Logged hours: group timeEntries by focusArea -> match to service
  const serviceByName = new Map(services.map((s) => [s.name.toLowerCase(), s]));
  const loggedGroups: Map<string, { service: Service; hours: number }> = new Map();
  for (const entry of timeEntries) {
    const svc = serviceByName.get(entry.focusArea.toLowerCase());
    if (!svc) continue;
    const existing = loggedGroups.get(svc.id);
    const hrs = entry.durationMinutes / 60;
    if (existing) {
      existing.hours += hrs;
    } else {
      loggedGroups.set(svc.id, { service: svc, hours: hrs });
    }
  }
  // Subtract hours already billed in prior paid Full invoices, then drop services at zero
  for (const [svcId, group] of loggedGroups) {
    const alreadyBilled = billedHoursByServiceId.get(svcId) ?? 0;
    group.hours = Math.max(0, group.hours - alreadyBilled);
  }
  for (const [svcId, group] of loggedGroups) {
    if (group.hours <= 0) loggedGroups.delete(svcId);
  }
  // Round hours to 2 decimal places here so loggedTotal matches the line items
  // that are actually submitted (which also round to 2dp). Without this, the
  // displayed/stored invoice amount diverges from the sum of line item values.
  const loggedTotal = Array.from(loggedGroups.values()).reduce(
    (s, g) => s + g.service.hourlyRate * (Math.round(g.hours * 100) / 100),
    0
  );

  // Promo discount for logged-hours source (must be after loggedTotal)
  const loggedPromoDiscount = promoResult && fullSource === "logged"
    ? Math.round(Math.min(
        loggedTotal * promoResult.discountPercent / 100,
        promoResult.maxDiscount ?? Infinity
      ) * 100) / 100
    : 0;
  const loggedPromoLineItem = loggedPromoDiscount > 0 ? {
    serviceId: "",
    serviceName: `Discount — ${promoResult?.code ?? "Code Applied"}`,
    hours: 1,
    rate: -loggedPromoDiscount,
  } : null;

  const fullSubtotal =
    fullSource === "contract"
      ? contractNetTotal - fullContractDiscount
      : fullSource === "logged"
      ? loggedTotal - loggedPromoDiscount
      : parseFloat(specificAmount) || 0;

  const effectiveDeposit = tab === "Full" && selectedDepositTotal > 0 ? selectedDepositTotal : 0;
  const consignmentLineItem = consignmentAmount > 0 ? {
    serviceId: "__consignment__",
    serviceName: "Consignment Earnings",
    hours: 1,
    rate: -consignmentAmount,
  } : null;
  const fullAmount = fullSubtotal + expensesTotal - effectiveDeposit - consignmentAmount;

  const selectedDepositService = services.find((s) => s.id === depositServiceId);
  const selectedSpecificService = services.find((s) => s.id === specificServiceId);

  const finalAmount = tab === "Deposit" ? depositAmountCalc : fullAmount;

  useEffect(() => {
    if (contracts.length > 0) {
      const defaultId = contracts.length > 1 ? "__all__" : contracts[0].id;
      setSelectedContractId(defaultId);
      setFullContractId(defaultId);
    }
    if (services.length > 0) {
      const servicesEntry = services.find((s) => s.name.toLowerCase() === "services") ?? services[0];
      setDepositServiceId(servicesEntry.id);
      setSpecificServiceId(services[0].id);
    }
  }, [contracts, services]);

  // Reset email + promo + billTo fields only when the modal opens (not on every render)
  useEffect(() => {
    if (isOpen) {
      setToRecipient(recipientOptions[0]?.email ?? "__custom__");
      setCustomToEmail("");
      setCcEmail(currentUserEmail);
      setPromoCode("");
      setPromoResult(null);
      setPromoError(null);
      setBillToName(defaultBillToName ?? tenant.name);
      setIncludeConsignment(false);
      setConsignmentRaw("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Reset promo when switching away from logged-hours source
  useEffect(() => {
    if (fullSource !== "logged") {
      setPromoCode("");
      setPromoResult(null);
      setPromoError(null);
    }
  }, [fullSource]);

  const depositCreditLineItem = {
    serviceId: "",
    serviceName: "Deposit Applied",
    hours: 1,
    rate: -selectedDepositTotal,
  };

  async function validatePromoCode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) { setPromoResult(null); setPromoError(null); return; }
    setPromoValidating(true);
    setPromoError(null);
    setPromoResult(null);
    try {
      const res = await fetch(`/api/admin/discount-codes?code=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) {
        setPromoError(data.error ?? "Invalid code");
      } else {
        setPromoResult({
          code: data.discount.code,
          label: data.discount.label,
          discountPercent: data.discount.discountPercent,
          maxDiscount: data.discount.maxDiscount,
        });
      }
    } catch {
      setPromoError("Failed to validate code");
    } finally {
      setPromoValidating(false);
    }
  }

  async function handleSubmit() {
    setError("");
    setSubmitting(true);
    try {
      const activeExpenseItems = tab === "Full" && includeExpenses && expenseItems.length > 0 ? expenseItems : undefined;

      let body: Record<string, unknown> = {
        tenantId: tenant.id,
        type: tab,
        amount: Math.max(0, finalAmount),
        tenantName: tenant.name,
        billToName: billToName.trim() || tenant.name,
        pushToQBO,
        sendEmail,
        sentToEmail: sendEmail ? sentToEmail : undefined,
        ccEmail: sendEmail ? ccEmail : undefined,
        expenseItems: activeExpenseItems,
      };

      if (tab === "Deposit") {
        body = {
          ...body,
          serviceId: depositServiceId,
          serviceName: selectedDepositService?.name ?? "",
          depositType: depositMode === "percent" ? "PercentOfEstimate" : "SpecificAmount",
          depositPercent: depositMode === "percent" ? depositPercent : undefined,
          contractId: depositMode === "percent" && selectedContractId !== "__all__" ? selectedContractId : undefined,
        };
      } else {
        // Full invoice
        const withDepositCredit = effectiveDeposit > 0;

        if (fullSource === "contract") {
          const svc = services.find((s) => s.name.toLowerCase() === "services") ?? services[0];
          const lineItems = [
            ...contractLineItems.map((li) => ({
              serviceId: li.serviceId,
              serviceName: li.serviceName,
              hours: li.hours,
              rate: li.rate,
            })),
            ...(discountLineItem ? [discountLineItem] : []),
            ...(withDepositCredit ? [depositCreditLineItem] : []),
            ...(consignmentLineItem ? [consignmentLineItem] : []),
          ];
          body = {
            ...body,
            serviceId: svc?.id ?? "",
            serviceName: svc?.name ?? "Services",
            contractId: fullContractId !== "__all__" ? fullContractId : undefined,
            lineItems,
          };
        } else if (fullSource === "logged") {
          const svc = services.find((s) => s.name.toLowerCase() === "services") ?? services[0];
          const lineItems = [
            ...Array.from(loggedGroups.values()).map((g) => ({
              serviceId: g.service.id,
              serviceName: g.service.name,
              hours: Math.round(g.hours * 100) / 100,
              rate: g.service.hourlyRate,
            })),
            ...(loggedPromoLineItem ? [loggedPromoLineItem] : []),
            ...(withDepositCredit ? [depositCreditLineItem] : []),
            ...(consignmentLineItem ? [consignmentLineItem] : []),
          ];
          body = {
            ...body,
            serviceId: svc?.id ?? "",
            serviceName: svc?.name ?? "Services",
            lineItems,
          };
        } else {
          // Specific amount
          const needsLineItems = withDepositCredit || !!consignmentLineItem;
          const lineItems = needsLineItems
            ? [
                {
                  serviceId: specificServiceId,
                  serviceName: selectedSpecificService?.name ?? "",
                  hours: 1,
                  rate: fullSubtotal,
                },
                ...(withDepositCredit ? [depositCreditLineItem] : []),
                ...(consignmentLineItem ? [consignmentLineItem] : []),
              ]
            : undefined;
          body = {
            ...body,
            serviceId: specificServiceId,
            serviceName: selectedSpecificService?.name ?? "",
            ...(lineItems ? { lineItems } : {}),
          };
        }
      }

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invoice");
      if (data.qboError) {
        // Keep modal open so the error is visible before closing
        setQboWarning({ message: data.qboError, invoice: data.invoice });
        return;
      }
      onCreated(data.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Create Invoice</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            {(["Deposit", "Full"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "Full" ? "Full Invoice" : "Deposit"}
              </button>
            ))}
          </div>

          {/* Bill To */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Bill To
            </label>
            <input
              type="text"
              value={billToName}
              onChange={(e) => setBillToName(e.target.value)}
              placeholder={tenant.name}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
            <p className="text-xs text-gray-400 mt-1">Project: {tenant.name}</p>
          </div>

          {/* DEPOSIT TAB */}
          {tab === "Deposit" && (
            <div className="space-y-4">
              {/* Mode pills */}
              <div className="flex gap-2">
                {(["percent", "amount"] as DepositMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setDepositMode(m)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                      depositMode === m
                        ? "bg-forest-600 text-white border-forest-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {m === "percent" ? "% of Estimate" : "Specific Amount"}
                  </button>
                ))}
              </div>

              {depositMode === "percent" && (
                <>
                  {/* Contract selector */}
                  {contracts.length > 0 ? (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Signed Contract
                      </label>
                      <select
                        value={selectedContractId}
                        onChange={(e) => setSelectedContractId(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                      >
                        {contracts.length > 1 && (
                          <option value="__all__">All Contracts (Combined) — {fmt(contracts.reduce((s, c) => s + c.totalCost, 0))}</option>
                        )}
                        {contracts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.signedAt ? new Date(c.signedAt).toLocaleDateString() : "Signed"} — {fmt(c.totalCost)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-600 bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                      No signed contracts found. Sign a contract first to create a deposit from it.
                    </p>
                  )}

                  {/* Percent input */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Deposit Percentage
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={100}
                        value={depositPercent}
                        onChange={(e) => setDepositPercent(Number(e.target.value))}
                        className="flex-1"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={depositPercent}
                          onChange={(e) => setDepositPercent(Math.max(1, Math.min(100, Number(e.target.value))))}
                          className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-forest-500"
                        />
                        <span className="text-sm text-gray-500">%</span>
                      </div>
                    </div>
                    {contractTotal > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        = <span className="font-semibold text-gray-800">{fmt(depositAmountCalc)}</span> of {fmt(contractTotal)}
                      </p>
                    )}
                  </div>
                </>
              )}

              {depositMode === "amount" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Deposit Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                    />
                  </div>
                </div>
              )}

              {/* Service selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Service
                </label>
                <select
                  value={depositServiceId}
                  onChange={(e) => setDepositServiceId(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                >
                  {services.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* FULL INVOICE TAB */}
          {tab === "Full" && (
            <div className="space-y-4">
              {/* Source radio */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Invoice Source
                </label>
                <div className="space-y-2">
                  {(["contract", "logged", "specific"] as FullSource[]).map((src) => (
                    <label key={src} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        checked={fullSource === src}
                        onChange={() => setFullSource(src)}
                        className="text-forest-600"
                      />
                      <span className="text-sm text-gray-700">
                        {src === "contract" ? "Contract Hours" : src === "logged" ? "Logged Hours" : "Specific Amount"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {fullSource === "contract" && (
                <div className="space-y-3">
                  {contracts.length > 0 ? (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Contract
                      </label>
                      <select
                        value={fullContractId}
                        onChange={(e) => setFullContractId(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                      >
                        {contracts.length > 1 && (
                          <option value="__all__">All Contracts (Combined) — {fmt(contracts.reduce((s, c) => s + c.totalCost, 0))}</option>
                        )}
                        {contracts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.signedAt ? new Date(c.signedAt).toLocaleDateString() : "Signed"} — {fmt(c.totalCost)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-600 bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                      No signed contracts found.
                    </p>
                  )}
                  {contractLineItems.length > 0 && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 text-gray-500 font-medium">Service</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Hrs</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Rate</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contractLineItems.map((li, i) => (
                            <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                              <td className="px-3 py-2 text-gray-700">{li.serviceName}</td>
                              <td className="px-3 py-2 text-gray-600 text-right">{li.hours}</td>
                              <td className="px-3 py-2 text-gray-600 text-right">{fmt(li.rate)}</td>
                              <td className="px-3 py-2 text-gray-800 font-medium text-right">{fmt(li.hours * li.rate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {fullSource === "logged" && (
                <div className="space-y-3">
                  {/* Reminder if a promo was used on the contract/deposit */}
                  {contractDiscountReminder && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                      <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>
                        Promo code <strong>{contractDiscountReminder}</strong> was used on this project&apos;s contract.
                        Apply it below if it should also apply to this invoice.
                      </span>
                    </div>
                  )}

                  {loggedGroups.size === 0 ? (
                    <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
                      {billedHoursByServiceId.size > 0
                        ? "All logged hours have already been included in a prior paid invoice."
                        : "No logged time entries found for this project."}
                    </p>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 text-gray-500 font-medium">Service</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Hrs</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Rate</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from(loggedGroups.values()).map((g, i) => (
                            <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                              <td className="px-3 py-2 text-gray-700">{g.service.name}</td>
                              <td className="px-3 py-2 text-gray-600 text-right">
                                {Math.round(g.hours * 100) / 100}
                              </td>
                              <td className="px-3 py-2 text-gray-600 text-right">{fmt(g.service.hourlyRate)}</td>
                              <td className="px-3 py-2 text-gray-800 font-medium text-right">
                                {fmt(g.service.hourlyRate * g.hours)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Promo code input */}
                  <div className="border border-gray-200 rounded-xl px-3 py-3 space-y-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Promo Code <span className="normal-case font-normal text-gray-400">(optional)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => {
                          setPromoCode(e.target.value.toUpperCase());
                          if (!e.target.value.trim()) { setPromoResult(null); setPromoError(null); }
                        }}
                        onBlur={(e) => validatePromoCode(e.target.value)}
                        placeholder="Enter code"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 uppercase"
                      />
                      {promoValidating && (
                        <span className="text-xs text-gray-400 self-center">Checking...</span>
                      )}
                    </div>
                    {promoResult && (
                      <p className="text-xs text-green-700 font-medium">
                        {promoResult.label} — {promoResult.discountPercent}% off
                        {promoResult.maxDiscount ? ` (max ${fmt(promoResult.maxDiscount)})` : ""}
                        {loggedPromoDiscount > 0 ? ` = ${fmt(loggedPromoDiscount)} discount` : ""}
                      </p>
                    )}
                    {promoError && (
                      <p className="text-xs text-red-500">{promoError}</p>
                    )}
                  </div>
                </div>
              )}

              {fullSource === "specific" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Amount
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={specificAmount}
                        onChange={(e) => setSpecificAmount(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Service
                    </label>
                    <select
                      value={specificServiceId}
                      onChange={(e) => setSpecificServiceId(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                    >
                      {services.filter((s) => s.isActive).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Deposit credit section */}
              {paidDeposits.length > 0 && (
                <div className="border border-blue-200 bg-blue-50 rounded-xl px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-900">
                      Apply paid deposit{paidDeposits.length > 1 ? "s" : ""}
                    </span>
                    {paidDeposits.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const allSelected = paidDeposits.every(d => selectedDepositIds.has(d.id));
                          setSelectedDepositIds(allSelected ? new Set() : new Set(paidDeposits.map(d => d.id)));
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                      >
                        {paidDeposits.every(d => selectedDepositIds.has(d.id)) ? "Deselect All" : "Select All"}
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {paidDeposits.map(dep => (
                      <label key={dep.id} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedDepositIds.has(dep.id)}
                          onChange={() => setSelectedDepositIds(prev => {
                            const next = new Set(prev);
                            next.has(dep.id) ? next.delete(dep.id) : next.add(dep.id);
                            return next;
                          })}
                          className="rounded text-forest-600 w-4 h-4 flex-shrink-0"
                        />
                        <span className="text-sm text-blue-900 flex-1 min-w-0">
                          {dep.invoiceNumber}
                          {dep.status === "PartiallyPaid" && <span className="ml-1.5 text-xs text-blue-500">(partial)</span>}
                        </span>
                        <span className="text-sm font-medium text-blue-800 tabular-nums">{fmt(getDepositAmount(dep))}</span>
                      </label>
                    ))}
                  </div>
                  {selectedDepositTotal > 0 && fullSubtotal > 0 && (
                    <div className="space-y-1.5 text-sm border-t border-blue-200 pt-3">
                      <div className="flex justify-between text-gray-700">
                        <span>Subtotal</span>
                        <span>{fmt(fullSubtotal)}</span>
                      </div>
                      <div className="flex justify-between text-blue-700">
                        <span>Deposit Applied</span>
                        <span>-{fmt(selectedDepositTotal)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-gray-900 border-t border-blue-200 pt-1.5">
                        <span>Balance Owed</span>
                        <span>{fmt(Math.max(0, fullSubtotal - selectedDepositTotal))}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Expenses section (Full Invoice only) ─────────────────────── */}
          {tab === "Full" && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeExpenses}
                    onChange={e => setIncludeExpenses(e.target.checked)}
                    className="rounded text-forest-600 w-4 h-4"
                  />
                  <span className="text-sm font-semibold text-gray-800">
                    Include Project Expenses
                    {expensesTotal !== 0 && <span className="ml-1.5 text-forest-700">({expensesTotal > 0 ? "+" : ""}{fmt(expensesTotal)})</span>}
                  </span>
                </label>
                {includeExpenses && (
                  <button
                    type="button"
                    onClick={() => setNewExpense({ vendor: "", description: "", date: new Date().toISOString().slice(0, 10), amount: 0 })}
                    className="text-xs text-forest-600 hover:text-forest-800 font-medium flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add
                  </button>
                )}
              </div>

              {includeExpenses && (
                <div className="divide-y divide-gray-100">
                  {!expensesLoaded && (
                    <p className="px-4 py-3 text-xs text-gray-400">Loading expenses…</p>
                  )}
                  {expensesLoaded && expenseItems.length === 0 && !newExpense && (
                    <p className="px-4 py-3 text-xs text-gray-400">No expenses linked to this project yet. Use the Expenses page to associate expenses with this project, or add one manually above.</p>
                  )}
                  {expenseItems.map((ei, idx) =>
                    editingExpenseIdx === idx ? (
                      <div key={idx} className="px-4 py-2.5 bg-forest-50 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Vendor</label>
                            <input value={ei.vendor} onChange={e => setExpenseItems(prev => prev.map((x, i) => i === idx ? { ...x, vendor: e.target.value } : x))}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Date</label>
                            <input type="date" value={ei.date} onChange={e => setExpenseItems(prev => prev.map((x, i) => i === idx ? { ...x, date: e.target.value } : x))}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Description</label>
                            <input value={ei.description} onChange={e => setExpenseItems(prev => prev.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Amount ($)</label>
                            <input type="number" step="0.01" value={ei.amount} onChange={e => setExpenseItems(prev => prev.map((x, i) => i === idx ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400" />
                          </div>
                        </div>
                        <button onClick={() => setEditingExpenseIdx(null)} className="text-xs text-forest-600 hover:text-forest-800 font-medium">Done</button>
                      </div>
                    ) : (
                      <div key={idx} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 group ${ei.amount < 0 ? "bg-blue-50/40" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm text-gray-800 font-medium truncate">{ei.vendor || "—"}</p>
                            {ei.amount < 0 && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 shrink-0">Credit</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">{ei.description}{ei.date ? ` · ${ei.date}` : ""}</p>
                        </div>
                        <span className={`text-sm font-semibold tabular-nums shrink-0 ${ei.amount < 0 ? "text-blue-600" : "text-gray-900"}`}>{fmt(ei.amount)}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingExpenseIdx(idx)} className="text-xs text-gray-400 hover:text-forest-600 px-1.5 py-0.5 rounded hover:bg-gray-100">Edit</button>
                          <button onClick={() => { setExpenseItems(prev => prev.filter((_, i) => i !== idx)); if (editingExpenseIdx === idx) setEditingExpenseIdx(null); }}
                            className="text-xs text-gray-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50">×</button>
                        </div>
                      </div>
                    )
                  )}

                  {/* New expense row */}
                  {newExpense !== null && (
                    <div className="px-4 py-2.5 bg-forest-50 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Vendor</label>
                          <input value={newExpense.vendor ?? ""} onChange={e => setNewExpense(p => ({ ...p!, vendor: e.target.value }))}
                            placeholder="e.g. Home Depot"
                            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Date</label>
                          <input type="date" value={newExpense.date ?? ""} onChange={e => setNewExpense(p => ({ ...p!, date: e.target.value }))}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Description</label>
                          <input value={newExpense.description ?? ""} onChange={e => setNewExpense(p => ({ ...p!, description: e.target.value }))}
                            placeholder="Brief description"
                            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Amount ($)</label>
                          <input type="number" step="0.01" value={newExpense.amount ?? ""} onChange={e => setNewExpense(p => ({ ...p!, amount: parseFloat(e.target.value) || 0 }))}
                            placeholder="0.00"
                            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (newExpense.vendor || newExpense.amount) {
                              setExpenseItems(prev => [...prev, { vendor: newExpense.vendor || "", description: newExpense.description || "", date: newExpense.date || "", amount: newExpense.amount || 0 }]);
                            }
                            setNewExpense(null);
                          }}
                          className="text-xs bg-forest-600 text-white px-2.5 py-1 rounded-lg hover:bg-forest-700"
                        >
                          Add
                        </button>
                        <button onClick={() => setNewExpense(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                    </div>
                  )}

                  {expenseItems.length > 0 && (
                    <div className={`flex justify-between px-4 py-2 text-xs font-semibold ${expensesTotal < 0 ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-700"}`}>
                      <span>{expensesTotal < 0 ? "Credits net" : "Expenses subtotal"}</span>
                      <span>{fmt(expensesTotal)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Consignment Earnings section (Full Invoice only) */}
          {tab === "Full" && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeConsignment}
                    onChange={e => setIncludeConsignment(e.target.checked)}
                    className="rounded text-amber-600 w-4 h-4"
                  />
                  <span className="text-sm font-semibold text-amber-900">
                    Consignment Earnings
                    {consignmentAmount > 0 && (
                      <span className="ml-1.5 text-amber-700">(-{fmt(consignmentAmount)})</span>
                    )}
                  </span>
                </label>
              </div>
              {includeConsignment && (
                <div className="px-4 pb-3 space-y-2 border-t border-amber-200">
                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Amount to deduct
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={consignmentRaw}
                        onFocus={e => e.target.select()}
                        onChange={e => setConsignmentRaw(e.target.value)}
                        className="w-full border border-amber-300 rounded-xl pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-amber-700">
                    Deducted from the invoice balance. Pushed to QuickBooks as &ldquo;Consignment Payout 10.1.&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Amount summary */}
          <div className="bg-forest-50 border border-forest-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-forest-800">Invoice Total</span>
              {finalAmount < 0 && (
                <p className="text-xs text-emerald-600 mt-0.5">Credits cover full balance — will create as $0.00 Paid</p>
              )}
            </div>
            <span className="text-xl font-bold text-forest-700">{fmt(Math.max(0, finalAmount))}</span>
          </div>

          {/* Email section */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="rounded text-forest-600 w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-700">Send email notification</span>
            </label>
            {sendEmail && (
              <div className="space-y-2 pl-7">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <div className="flex flex-col gap-1.5">
                    <select
                      value={toRecipient}
                      onChange={(e) => setToRecipient(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white"
                    >
                      {recipientOptions.map((opt) => (
                        <option key={opt.email} value={opt.email}>
                          {opt.label} — {opt.email}
                        </option>
                      ))}
                      <option value="__custom__">Other — enter email…</option>
                    </select>
                    {useCustomTo && (
                      <input
                        type="email"
                        value={customToEmail}
                        onChange={(e) => setCustomToEmail(e.target.value)}
                        placeholder="recipient@example.com"
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">CC (optional)</label>
                  <input
                    type="email"
                    value={ccEmail}
                    onChange={(e) => setCcEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* QBO toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={pushToQBO}
              onChange={(e) => setPushToQBO(e.target.checked)}
              className="rounded text-forest-600 w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-700">Push to QuickBooks</span>
          </label>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
          )}

          {/* QBO Warning — invoice saved but QBO sync failed */}
          {qboWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-amber-800">Invoice created — QuickBooks sync failed</p>
              <p className="text-xs text-amber-700 font-mono break-all">{qboWarning.message}</p>
              <button
                onClick={() => onCreated(qboWarning.invoice)}
                className="text-xs font-semibold text-amber-800 underline hover:text-amber-900"
              >
                Close and go to invoices
              </button>
            </div>
          )}

          {/* Actions */}
          {!qboWarning && (
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-forest-600 text-white font-semibold text-sm hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Creating…" : "Create Invoice"}
            </button>
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
