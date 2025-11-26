from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import sqlite3
from datetime import datetime
from pathlib import Path  # 경로 처리를 위해 추가

# ---------- 경로 설정 ----------
BASE_DIR = Path(__file__).resolve().parent
DB_DIR = BASE_DIR / "db"
DB_PATH = DB_DIR / "budget_app.db"


app = FastAPI(
    title="Couple Monthly Budget API",
    description="부부 공동 생활비 관리를 위한 간단한 API",
    version="1.0.0",
)

# CORS 설정: 나중에 러버블 프론트엔드 도메인으로 바꿀 예정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 단계: 일단 전체 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- DB 유틸 ----------

def get_conn():
    # db 폴더가 없으면 자동 생성
    DB_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    # users 테이블: 사용자(부부) 정보
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )
        """
    )

    # budgets 테이블: 월별 예산
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            amount INTEGER NOT NULL,
            UNIQUE(year, month)
        )
        """
    )

    # expenses 테이블: 지출 내역
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            memo TEXT,
            amount INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )

    conn.commit()

    # 기본 사용자 2명 등록 (남편, 아내) – 이미 있으면 무시
    try:
        cur.execute("INSERT INTO users (name) VALUES (?)", ("남편",))
    except sqlite3.IntegrityError:
        pass
    try:
        cur.execute("INSERT INTO users (name) VALUES (?)", ("아내",))
    except sqlite3.IntegrityError:
        pass

    conn.commit()
    conn.close()


@app.on_event("startup")
def on_startup():
    # 서버 시작될 때 DB/테이블이 없으면 자동 생성
    init_db()


# ---------- Pydantic 모델 ----------

class BudgetIn(BaseModel):
    year: int
    month: int
    amount: int


class ExpenseIn(BaseModel):
    date: str  # YYYY-MM-DD
    user_id: int
    category: str
    memo: Optional[str] = None
    amount: int


class ExpenseOut(BaseModel):
    id: int
    date: str
    user_id: int
    user_name: str
    category: str
    memo: Optional[str]
    amount: int
    created_at: str


class SummaryUser(BaseModel):
    user_name: str
    total_used: int


class SummaryCategory(BaseModel):
    category: str
    total_used: int


class SummaryOut(BaseModel):
    year: int
    month: int
    budget: Optional[int]
    total_used: int
    remain: Optional[int]
    usage_rate: Optional[float]
    by_user: List[SummaryUser]
    by_category: List[SummaryCategory]


# ---------- 엔드포인트 ----------

@app.get("/users", summary="사용자 목록 조회")
def list_users():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM users ORDER BY id")
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/budget", summary="월 예산 설정 또는 수정")
def set_budget(budget: BudgetIn):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO budgets (year, month, amount)
        VALUES (?, ?, ?)
        ON CONFLICT(year, month) DO UPDATE SET amount=excluded.amount
        """,
        (budget.year, budget.month, budget.amount),
    )
    conn.commit()
    conn.close()
    return {"message": "예산이 저장되었습니다.", "data": budget}


@app.get("/budget", summary="특정 월의 예산 조회")
def get_budget(year: int = Query(...), month: int = Query(...)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT year, month, amount FROM budgets WHERE year=? AND month=?",
        (year, month),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="해당 월의 예산이 설정되어 있지 않습니다.")
    return dict(row)


@app.post("/expenses", response_model=ExpenseOut, summary="지출 등록")
def create_expense(expense: ExpenseIn):
    # date 포맷 간단 검증
    try:
        datetime.strptime(expense.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="date 형식은 YYYY-MM-DD 여야 합니다.")

    now_str = datetime.now().isoformat(timespec="seconds")

    conn = get_conn()
    cur = conn.cursor()

    # user 존재 여부 확인
    cur.execute("SELECT id, name FROM users WHERE id=?", (expense.user_id,))
    user_row = cur.fetchone()
    if not user_row:
        conn.close()
        raise HTTPException(status_code=400, detail="존재하지 않는 사용자입니다.")

    cur.execute(
        """
        INSERT INTO expenses (date, user_id, category, memo, amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            expense.date,
            expense.user_id,
            expense.category,
            expense.memo,
            expense.amount,
            now_str,
        ),
    )
    expense_id = cur.lastrowid

    conn.commit()

    # 방금 추가한 데이터 조회
    cur.execute(
        """
        SELECT e.id, e.date, e.user_id, u.name as user_name,
               e.category, e.memo, e.amount, e.created_at
        FROM expenses e
        JOIN users u ON e.user_id = u.id
        WHERE e.id=?
        """,
        (expense_id,),
    )
    row = cur.fetchone()
    conn.close()

    return ExpenseOut(**dict(row))


@app.get("/expenses", response_model=List[ExpenseOut], summary="지출 목록 조회")
def list_expenses(
    year: int = Query(...),
    month: int = Query(...),
    user_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
):
    # year, month 기반으로 기간 계산 (해당 월 1일 ~ 다음 달 1일)
    start_date = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end_date = f"{year + 1:04d}-01-01"
    else:
        end_date = f"{year:04d}-{month + 1:02d}-01"

    conn = get_conn()
    cur = conn.cursor()

    query = """
        SELECT e.id, e.date, e.user_id, u.name as user_name,
               e.category, e.memo, e.amount, e.created_at
        FROM expenses e
        JOIN users u ON e.user_id = u.id
        WHERE e.date >= ? AND e.date < ?
    """
    params = [start_date, end_date]

    if user_id is not None:
        query += " AND e.user_id = ?"
        params.append(user_id)

    if category is not None:
        query += " AND e.category = ?"
        params.append(category)

    query += " ORDER BY e.date ASC, e.id ASC"

    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()

    return [ExpenseOut(**dict(r)) for r in rows]


@app.delete("/expenses/{expense_id}", summary="지출 삭제")
def delete_expense(expense_id: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM expenses WHERE id=?", (expense_id,))
    changes = conn.total_changes
    conn.commit()
    conn.close()
    if changes == 0:
        raise HTTPException(status_code=404, detail="해당 ID의 지출 내역이 없습니다.")
    return {"message": "삭제되었습니다."}


@app.get("/summary", response_model=SummaryOut, summary="월별 요약 정보")
def get_summary(year: int = Query(...), month: int = Query(...)):
    # 기간 계산
    start_date = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end_date = f"{year + 1:04d}-01-01"
    else:
        end_date = f"{year:04d}-{month + 1:02d}-01"

    conn = get_conn()
    cur = conn.cursor()

    # 예산 조회
    cur.execute(
        "SELECT amount FROM budgets WHERE year=? AND month=?",
        (year, month),
    )
    row = cur.fetchone()
    budget_amount = row["amount"] if row else None

    # 전체 사용 합계
    cur.execute(
        """
        SELECT COALESCE(SUM(amount), 0) as total_used
        FROM expenses
        WHERE date >= ? AND date < ?
        """,
        (start_date, end_date),
    )
    total_used = cur.fetchone()["total_used"]

    # 사용자별 합계
    cur.execute(
        """
        SELECT u.name as user_name, COALESCE(SUM(e.amount), 0) as total_used
        FROM users u
        LEFT JOIN expenses e
            ON u.id = e.user_id
           AND e.date >= ?
           AND e.date < ?
        GROUP BY u.id, u.name
        ORDER BY u.id
        """,
        (start_date, end_date),
    )
    by_user_rows = cur.fetchall()

    # 카테고리별 합계
    cur.execute(
        """
        SELECT category, COALESCE(SUM(amount), 0) as total_used
        FROM expenses
        WHERE date >= ? AND date < ?
        GROUP BY category
        ORDER BY total_used DESC
        """,
        (start_date, end_date),
    )
    by_cat_rows = cur.fetchall()

    conn.close()

    remain = None
    usage_rate = None
    if budget_amount is not None:
        remain = budget_amount - total_used
        if budget_amount > 0:
            usage_rate = round(total_used / budget_amount * 100, 1)

    return SummaryOut(
        year=year,
        month=month,
        budget=budget_amount,
        total_used=total_used,
        remain=remain,
        usage_rate=usage_rate,
        by_user=[SummaryUser(**dict(r)) for r in by_user_rows],
        by_category=[SummaryCategory(**dict(r)) for r in by_cat_rows],
    )
