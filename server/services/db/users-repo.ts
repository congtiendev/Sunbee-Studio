import { randomUUID } from "node:crypto";
import type { User } from "../../../shared/types.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { getDb } from "./client.js";

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "user" | "admin";
  created_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function countUsers(): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS count FROM users`).get() as {
    count: number;
  };
  return row.count;
}

export function createUser(
  email: string,
  name: string,
  password: string,
): User {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = getDb()
    .prepare(`SELECT id FROM users WHERE email = ?`)
    .get(normalizedEmail);
  if (existing) {
    throw new Error("Email này đã được đăng ký.");
  }

  const role: "user" | "admin" = countUsers() === 0 ? "admin" : "user";
  const row: UserRow = {
    id: randomUUID(),
    email: normalizedEmail,
    name,
    password_hash: hashPassword(password),
    role,
    created_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
       VALUES (@id, @email, @name, @password_hash, @role, @created_at)`,
    )
    .run(row);

  return rowToUser(row);
}

export function verifyCredentials(
  email: string,
  password: string,
): User | null {
  const normalizedEmail = email.trim().toLowerCase();
  const row = getDb()
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .get(normalizedEmail) as UserRow | undefined;
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return rowToUser(row);
}

export function getUserById(id: string): User | null {
  const row = getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(id) as
    | UserRow
    | undefined;
  return row ? rowToUser(row) : null;
}

export function listAllUsers(): User[] {
  const rows = getDb()
    .prepare(`SELECT * FROM users ORDER BY created_at ASC`)
    .all() as UserRow[];
  return rows.map(rowToUser);
}
