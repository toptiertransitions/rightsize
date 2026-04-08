import { getQBOToken, saveQBOToken, deleteQBOToken } from "./airtable";

const INTUIT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export function getQBOBaseUrl(): string {
  return process.env.QBO_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export function buildQBOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID!,
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: process.env.QBO_REDIRECT_URI!,
    response_type: "code",
    state,
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

function getBasicCredentials(): string {
  return Buffer.from(
    `${process.env.QBO_CLIENT_ID!}:${process.env.QBO_CLIENT_SECRET!}`
  ).toString("base64");
}

export async function exchangeQBOCode(code: string, realmId: string): Promise<void> {
  const res = await fetch(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${getBasicCredentials()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.QBO_REDIRECT_URI!,
    }).toString(),
  });
  if (!res.ok) throw new Error(`QBO token exchange failed: ${await res.text()}`);
  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Fetch company name
  let companyName = "";
  try {
    const infoRes = await fetch(
      `${getQBOBaseUrl()}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
      { headers: { Authorization: `Bearer ${data.access_token}`, Accept: "application/json" } }
    );
    if (infoRes.ok) {
      const info = await infoRes.json();
      companyName = info.CompanyInfo?.CompanyName || "";
    }
  } catch { /* ignore */ }

  await saveQBOToken({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    realmId,
    companyName,
  });
}

async function refreshQBOToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: string }> {
  const res = await fetch(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${getBasicCredentials()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  const body = await res.text();
  if (!res.ok) {
    // Parse the error so callers can detect invalid_grant specifically
    let parsed: { error?: string } = {};
    try { parsed = JSON.parse(body); } catch { /* ignore */ }
    const err = new Error(`QBO token refresh failed: ${body}`) as Error & { code?: string };
    err.code = parsed.error;
    throw err;
  }
  const data = JSON.parse(body);
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  return { accessToken: data.access_token, expiresAt };
}

export async function getValidQBOToken(): Promise<{ accessToken: string; realmId: string } | null> {
  const record = await getQBOToken();
  if (!record) return null;

  const expiresAt = new Date(record.expiresAt).getTime();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt > Date.now() + fiveMinutes) {
    return { accessToken: record.accessToken, realmId: record.realmId };
  }

  // Refresh — if the token has been revoked, clear it and treat as disconnected
  try {
    const { accessToken, expiresAt: newExpiresAt } = await refreshQBOToken(record.refreshToken);
    await saveQBOToken({
      accessToken,
      refreshToken: record.refreshToken,
      expiresAt: newExpiresAt,
      realmId: record.realmId,
      companyName: record.companyName,
    });
    return { accessToken, realmId: record.realmId };
  } catch (e) {
    const code = (e as Error & { code?: string }).code;
    if (code === "invalid_grant") {
      // Refresh token revoked or expired — clear stored credentials
      await deleteQBOToken().catch(() => {});
      return null;
    }
    throw e;
  }
}

function buildQBOUrl(path: string, realmId: string): string {
  const base = getQBOBaseUrl();
  const url = new URL(`${base}/v3/company/${realmId}${path}`);
  if (!url.searchParams.has("minorversion")) {
    url.searchParams.set("minorversion", "65");
  }
  return url.toString();
}

function logQBOError(context: string, tid: string | null, status: number, body: string) {
  console.error(`[QBO] ${context} | intuit_tid=${tid ?? "none"} | status=${status} | body=${body}`);
}

async function doQBOFetch(path: string, accessToken: string, realmId: string, options?: RequestInit): Promise<Response> {
  return fetch(buildQBOUrl(path, realmId), {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

export async function qboFetch(path: string, options?: RequestInit): Promise<Response> {
  const auth = await getValidQBOToken();
  if (!auth) throw new Error("QuickBooks is not connected");
  const { accessToken, realmId } = auth;

  const res = await doQBOFetch(path, accessToken, realmId, options);
  const tid = res.headers.get("intuit_tid");

  // If we get a 401, the token may have been revoked mid-session.
  // Force a token refresh and retry once before giving up.
  if (res.status === 401) {
    const body = await res.text();
    logQBOError(`401 on ${options?.method ?? "GET"} ${path}`, tid, 401, body);
    const record = await getQBOToken();
    if (!record) throw new Error("QuickBooks is not connected");
    try {
      const { accessToken: newToken, expiresAt } = await refreshQBOToken(record.refreshToken);
      await saveQBOToken({ ...record, accessToken: newToken, expiresAt });
      return doQBOFetch(path, newToken, realmId, options);
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      if (code === "invalid_grant") {
        await deleteQBOToken().catch(() => {});
        throw new Error("QuickBooks authorization expired — please reconnect");
      }
      throw e;
    }
  }

  // Log non-2xx responses for troubleshooting
  if (!res.ok) {
    const body = await res.clone().text();
    logQBOError(`${options?.method ?? "GET"} ${path}`, tid, res.status, body);
  }

  return res;
}

export async function getQBOServiceItems(): Promise<Array<{ Id: string; Name: string }>> {
  // Include both Service and NonInventory types — QBO accounts commonly use either for services
  const query = "SELECT * FROM Item WHERE (Type = 'Service' OR Type = 'NonInventory') AND Active = true MAXRESULTS 200";
  const res = await qboFetch(`/query?query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`QBO items query failed: ${await res.text()}`);
  const data = await res.json();
  return (data.QueryResponse?.Item ?? [])
    .map((item: { Id: string; Name: string }) => ({ Id: item.Id, Name: item.Name }))
    .sort((a: { Name: string }, b: { Name: string }) => a.Name.localeCompare(b.Name));
}

async function findOrCreateQBOCustomer(displayName: string): Promise<string> {
  const safe = displayName.replace(/'/g, "\\'");
  const query = `SELECT * FROM Customer WHERE DisplayName = '${safe}' MAXRESULTS 1`;
  const res = await qboFetch(`/query?query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`QBO customer query failed: ${await res.text()}`);
  const data = await res.json();
  const customers = data.QueryResponse?.Customer;
  if (customers?.length > 0) return customers[0].Id;

  const createRes = await qboFetch("/customer", {
    method: "POST",
    body: JSON.stringify({ DisplayName: displayName }),
  });
  if (!createRes.ok) throw new Error(`QBO customer creation failed: ${await createRes.text()}`);
  const created = await createRes.json();
  return created.Customer.Id;
}

async function findOrCreateQBOItem(serviceName: string): Promise<string> {
  const safe = serviceName.replace(/'/g, "\\'");
  const query = `SELECT * FROM Item WHERE Name = '${safe}' MAXRESULTS 1`;
  const res = await qboFetch(`/query?query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`QBO item query failed: ${await res.text()}`);
  const data = await res.json();
  const items = data.QueryResponse?.Item;
  if (items?.length > 0) return items[0].Id;

  // Need an income account to create a service item
  const acctRes = await qboFetch(
    `/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Income' AND Active = true MAXRESULTS 1")}`
  );
  if (!acctRes.ok) throw new Error("QBO income account query failed");
  const acctData = await acctRes.json();
  const account = acctData.QueryResponse?.Account?.[0];
  if (!account) throw new Error("No income account found in QBO — please create one first");

  const createRes = await qboFetch("/item", {
    method: "POST",
    body: JSON.stringify({
      Name: serviceName,
      Type: "Service",
      IncomeAccountRef: { value: account.Id },
    }),
  });
  if (!createRes.ok) throw new Error(`QBO item creation failed: ${await createRes.text()}`);
  const created = await createRes.json();
  return created.Item.Id;
}

export async function createQBOInvoice(opts: {
  customerName: string;
  lineItems: Array<{
    serviceName: string;
    hours: number;
    rate: number;
    qboItemId?: string;
  }>;
  memo?: string;
}): Promise<{ id: string; docNumber: string }> {
  const customerId = await findOrCreateQBOCustomer(opts.customerName);

  const lines = await Promise.all(
    opts.lineItems.map(async (item) => {
      const itemId = item.qboItemId || (await findOrCreateQBOItem(item.serviceName));
      return {
        Amount: Math.round(item.hours * item.rate * 100) / 100,
        DetailType: "SalesItemLineDetail",
        Description: `${item.serviceName} (${item.hours} hrs @ $${item.rate}/hr)`,
        SalesItemLineDetail: {
          ItemRef: { value: itemId },
          Qty: item.hours,
          UnitPrice: item.rate,
        },
      };
    })
  );

  const invoicePayload: Record<string, unknown> = {
    CustomerRef: { value: customerId },
    Line: lines,
  };
  if (opts.memo) invoicePayload["CustomerMemo"] = { value: opts.memo };

  const res = await qboFetch("/invoice", {
    method: "POST",
    body: JSON.stringify(invoicePayload),
  });
  if (!res.ok) throw new Error(`QBO invoice creation failed: ${await res.text()}`);
  const created = await res.json();
  return {
    id: created.Invoice.Id,
    docNumber: created.Invoice.DocNumber || String(created.Invoice.Id),
  };
}
