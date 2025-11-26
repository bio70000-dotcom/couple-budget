import React, { useEffect, useMemo, useState } from "react";
import {
  fetchUsers,
  fetchSummary,
  fetchExpenses,
  createExpense,
  setBudget,
} from "./api";
import type { User, Expense, Summary } from "./api";

type YearMonth = {
  year: number;
  month: number;
};

function getCurrentYearMonth(): YearMonth {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

const categories = ["식비", "카페", "교통", "생활", "쇼핑", "기타"];

const App: React.FC = () => {
  const [ym, setYm] = useState<YearMonth>(getCurrentYearMonth);
  const [users, setUsers] = useState<User[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 예산 입력 상태
  const [budgetInput, setBudgetInput] = useState<string>("");

  // 지출 입력 상태
  const [expenseDate, setExpenseDate] = useState<string>(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [expenseUserId, setExpenseUserId] = useState<number | undefined>();
  const [expenseCategory, setExpenseCategory] = useState<string>("식비");
  const [expenseMemo, setExpenseMemo] = useState<string>("");
  const [expenseAmount, setExpenseAmount] = useState<string>("");

  // 초기 사용자 목록 불러오기
  useEffect(() => {
    fetchUsers()
      .then((data) => {
        setUsers(data);
        if (data.length > 0 && expenseUserId === undefined) {
          setExpenseUserId(data[0].id);
        }
      })
      .catch((err) => {
        console.error(err);
        setError("사용자 목록을 불러오는 중 오류가 발생했습니다.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async (year: number, month: number) => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, expensesData] = await Promise.all([
        fetchSummary(year, month),
        fetchExpenses(year, month),
      ]);
      setSummary(summaryData);
      setExpenses(expensesData);
      setBudgetInput(
        summaryData.budget !== null ? String(summaryData.budget) : ""
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 연/월이 바뀔 때마다 데이터 로딩
  useEffect(() => {
    loadData(ym.year, ym.month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym.year, ym.month]);

  const handleChangeMonth = (delta: number) => {
    setYm((prev) => {
      const date = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
  };

  const handleSaveBudget = async () => {
    if (!budgetInput.trim()) {
      alert("예산 금액을 입력하세요.");
      return;
    }
    const amount = Number(budgetInput.replace(/,/g, ""));
    if (Number.isNaN(amount) || amount <= 0) {
      alert("올바른 예산 금액을 입력하세요.");
      return;
    }
    try {
      await setBudget({ year: ym.year, month: ym.month, amount });
      await loadData(ym.year, ym.month);
      alert("예산이 저장되었습니다.");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "예산 저장 중 오류가 발생했습니다.");
    }
  };

  const handleCreateExpense = async () => {
    if (!expenseDate) {
      alert("사용일자를 입력하세요.");
      return;
    }
    if (!expenseUserId) {
      alert("사용자를 선택하세요.");
      return;
    }
    if (!expenseAmount.trim()) {
      alert("금액을 입력하세요.");
      return;
    }
    const amount = Number(expenseAmount.replace(/,/g, ""));
    if (Number.isNaN(amount) || amount <= 0) {
      alert("올바른 금액을 입력하세요.");
      return;
    }

    try {
      await createExpense({
        date: expenseDate,
        user_id: expenseUserId,
        category: expenseCategory,
        memo: expenseMemo.trim() || undefined,
        amount,
      });
      // 입력값 일부 초기화
      setExpenseAmount("");
      setExpenseMemo("");
      await loadData(ym.year, ym.month);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "지출 저장 중 오류가 발생했습니다.");
    }
  };

  const niceMonthLabel = useMemo(
    () => `${ym.year}년 ${ym.month}월`,
    [ym.year, ym.month]
  );

  return (
    <div className="app-root">
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          부부 생활비 가계부
        </h1>
        <p style={{ color: "#555", fontSize: 14 }}>
          이번 달 예산과 지출을 한눈에 관리하세요.
        </p>
      </header>

      {/* 연/월 선택 */}
      <section className="month-bar">
        <button onClick={() => handleChangeMonth(-1)}>◀</button>
        <strong>{niceMonthLabel}</strong>
        <button onClick={() => handleChangeMonth(1)}>▶</button>
      </section>

      {error && <div className="error-box">{error}</div>}

      {/* 여기부터 좌우 2단(데스크탑), 모바일에서는 세로 1단 */}
      <div className="app-layout">
        {/* 왼쪽 영역: 요약/예산 */}
        <div className="app-left">
          {/* 요약 카드 */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <div style={cardStyle}>
              <div style={cardTitle}>예산</div>
              <div style={cardNumber}>
                {summary?.budget != null
                  ? summary.budget.toLocaleString()
                  : "미설정"}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={cardTitle}>사용 금액</div>
              <div style={cardNumber}>
                {summary ? summary.total_used.toLocaleString() : "-"}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={cardTitle}>잔액</div>
              <div style={cardNumber}>
                {summary?.remain != null
                  ? summary.remain.toLocaleString()
                  : summary
                  ? "-"
                  : "-"}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={cardTitle}>사용률</div>
              <div style={cardNumber}>
                {summary?.usage_rate != null ? `${summary.usage_rate}%` : "-"}
              </div>
            </div>
          </section>

          {/* 예산 설정 */}
          <section style={{ marginBottom: 24 }}>
            <h2 className="section-title">예산 설정</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                placeholder="예: 1500000"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="input-base"
              />
              <button onClick={handleSaveBudget} className="btn-primary">
                저장
              </button>
            </div>
          </section>

          {/* 사람별 / 카테고리별 요약 */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div>
              <h2 className="section-title">사람별 사용 금액</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {summary?.by_user.map((u) => (
                    <tr key={u.user_name}>
                      <td>{u.user_name}</td>
                      <td className="td-right">
                        {u.total_used.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {summary && summary.by_user.length === 0 && (
                    <tr>
                      <td colSpan={2}>데이터 없음</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <h2 className="section-title">카테고리별 사용 금액</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>카테고리</th>
                    <th>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {summary?.by_category.map((c) => (
                    <tr key={c.category}>
                      <td>{c.category}</td>
                      <td className="td-right">
                        {c.total_used.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {summary && summary.by_category.length === 0 && (
                    <tr>
                      <td colSpan={2}>데이터 없음</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* 오른쪽 영역: 입력 + 목록 */}
        <div className="app-right">
          {/* 지출 입력 */}
          <section style={{ marginBottom: 24 }}>
            <h2 className="section-title">지출 입력</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div>
                <label className="field-label">일자</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="input-base"
                />
              </div>
              <div>
                <label className="field-label">사용자</label>
                <select
                  value={expenseUserId ?? ""}
                  onChange={(e) => setExpenseUserId(Number(e.target.value))}
                  className="select-base"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">카테고리</label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="select-base"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">금액</label>
                <input
                  type="number"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="예: 35000"
                  className="input-base"
                />
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label className="field-label">메모</label>
              <input
                type="text"
                value={expenseMemo}
                onChange={(e) => setExpenseMemo(e.target.value)}
                placeholder="예: 이마트 장보기"
                className="input-base"
              />
            </div>
            <button onClick={handleCreateExpense} className="btn-primary">
              지출 추가
            </button>
          </section>

          {/* 지출 목록 */}
          <section>
            <h2 className="section-title">지출 목록</h2>
            {loading && <div style={{ marginBottom: 8 }}>로딩 중...</div>}
            <table className="table">
              <thead>
                <tr>
                  <th>일자</th>
                  <th>사용자</th>
                  <th>카테고리</th>
                  <th>메모</th>
                  <th>금액</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td>{e.user_name}</td>
                    <td>{e.category}</td>
                    <td>{e.memo || ""}</td>
                    <td className="td-right">{e.amount.toLocaleString()}</td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={5}>지출 내역이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: "12px 16px",
  background: "#fafafa",
};

const cardTitle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 4,
};

const cardNumber: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
};

export default App;
