

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "deskflow.db"

PRIORITIES = {"baixa", "media", "alta"}
STATUSES = {"aberto", "em_andamento", "concluido"}


def now():
    return datetime.now(timezone.utc).isoformat()


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                priority TEXT NOT NULL DEFAULT 'media',
                status TEXT NOT NULL DEFAULT 'aberto',
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="DeskFlow API",
    description="API para gerenciamento de chamados de TI",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)


class TicketCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    description: str = Field(min_length=1, max_length=5000)
    priority: str = "media"

    @field_validator("title", "description")
    @classmethod
    def clean_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("O campo não pode ficar vazio.")
        return value

    @field_validator("priority")
    @classmethod
    def check_priority(cls, value):
        if value not in PRIORITIES:
            raise ValueError("Prioridade deve ser baixa, media ou alta.")
        return value


class TicketUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, min_length=1, max_length=5000)
    priority: str | None = None
    status: str | None = None

    @field_validator("title", "description")
    @classmethod
    def clean_optional_text(cls, value):
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("O campo não pode ficar vazio.")
        return value

    @field_validator("priority")
    @classmethod
    def check_optional_priority(cls, value):
        if value is not None and value not in PRIORITIES:
            raise ValueError("Prioridade inválida.")
        return value

    @field_validator("status")
    @classmethod
    def check_optional_status(cls, value):
        if value is not None and value not in STATUSES:
            raise ValueError("Status inválido.")
        return value


def find_ticket(ticket_id: int):
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM tickets WHERE id = ?",
            (ticket_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Chamado não encontrado.")

    return dict(row)


@app.get("/")
def home():
    return {
        "name": "DeskFlow API",
        "version": "1.0.0",
        "documentation": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/tickets", status_code=201)
def create_ticket(ticket: TicketCreate):
    with connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO tickets
                (title, description, priority, status, created_at)
            VALUES (?, ?, ?, 'aberto', ?)
            """,
            (ticket.title, ticket.description, ticket.priority, now()),
        )
        ticket_id = cursor.lastrowid

    return find_ticket(ticket_id)


@app.get("/tickets")
def list_tickets(
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=150),
):
    sql = "SELECT * FROM tickets WHERE 1=1"
    params = []

    if status is not None:
        if status not in STATUSES:
            raise HTTPException(status_code=400, detail="Status inválido.")
        sql += " AND status = ?"
        params.append(status)

    if priority is not None:
        if priority not in PRIORITIES:
            raise HTTPException(status_code=400, detail="Prioridade inválida.")
        sql += " AND priority = ?"
        params.append(priority)

    if search and search.strip():
        term = "%" + search.strip() + "%"
        sql += " AND (title LIKE ? OR description LIKE ?)"
        params.extend([term, term])

    sql += " ORDER BY id DESC"

    with connect() as conn:
        rows = conn.execute(sql, params).fetchall()

    return [dict(row) for row in rows]


@app.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: int):
    return find_ticket(ticket_id)


@app.put("/tickets/{ticket_id}")
def update_ticket(ticket_id: int, data: TicketUpdate):
    changes = data.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=400,
            detail="Envie pelo menos um campo para atualizar.",
        )

    find_ticket(ticket_id)
    changes["updated_at"] = now()

    columns = ", ".join(f"{key} = ?" for key in changes)
    values = list(changes.values()) + [ticket_id]

    with connect() as conn:
        conn.execute(
            f"UPDATE tickets SET {columns} WHERE id = ?",
            values,
        )

    return find_ticket(ticket_id)


@app.patch("/tickets/{ticket_id}/status")
def change_status(ticket_id: int, status: str = Query(...)):
    if status not in STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Status deve ser aberto, em_andamento ou concluido.",
        )

    find_ticket(ticket_id)

    with connect() as conn:
        conn.execute(
            "UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?",
            (status, now(), ticket_id),
        )

    return find_ticket(ticket_id)


@app.delete("/tickets/{ticket_id}")
def delete_ticket(ticket_id: int):
    with connect() as conn:
        cursor = conn.execute(
            "DELETE FROM tickets WHERE id = ?",
            (ticket_id,),
        )

    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Chamado não encontrado.")

    return {"message": "Chamado excluído com sucesso."}


@app.get("/stats")
def statistics():
    with connect() as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM tickets"
        ).fetchone()[0]

        rows = conn.execute("""
            SELECT status, COUNT(*) AS total
            FROM tickets
            GROUP BY status
        """).fetchall()

    counts = {status: 0 for status in STATUSES}
    for row in rows:
        counts[row["status"]] = row["total"]

    return {
        "total": total,
        "abertos": counts["aberto"],
        "em_andamento": counts["em_andamento"],
        "concluidos": counts["concluido"],
    }
