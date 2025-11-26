const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type User = {
  id: number;
  name: string;
};

export type Expense = {
  id: number;
  date: string;
  user_id: number;
  user_name: string;
  category: string;
  memo?: string | null;
  amount: number;
  created_at: string;
};

export type SummaryUser = {
  user_name: string;
  total_used: number;
};

export type SummaryCategory = {
  category: string;
  total_used: number;
};

export type Summary = {
  year: number;
  month: number;
  budget: number | null;
  total_used: number;
  remain: number | null;
  usage_rate: number | null;
  by_user: SummaryUser[];
  by_category: SummaryCategory[];
};

export type CreateExpensePayload = {
  date: string;
  user_id: number;
  category: string;
  memo?: string;
  amount: number;
};

export type SetBudgetPayload = {
  year: number;
  month: number;
  amount: number;
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `API 오류 (${res.status}): ${text || res.statusText || "Unknown error"}`
    );
  }
  return res.json() as Promise<T>;
}

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE_URL}/users`);
  return handleResponse<User[]>(res);
}

export async function fetchSummary(
  year: number,
  month: number
): Promise<Summary> {
  const res = await fetch(
    `${API_BASE_URL}/summary?year=${year}&month=${month}`
  );
  return handleResponse<Summary>(res);
}

export async function fetchExpenses(
  year: number,
  month: number
): Promise<Expense[]> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  const res = await fetch(`${API_BASE_URL}/expenses?${params.toString()}`);
  return handleResponse<Expense[]>(res);
}

export async function createExpense(
  payload: CreateExpensePayload
): Promise<Expense> {
  const res = await fetch(`${API_BASE_URL}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<Expense>(res);
}

export async function setBudget(payload: SetBudgetPayload): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/budget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await handleResponse(res);
}
