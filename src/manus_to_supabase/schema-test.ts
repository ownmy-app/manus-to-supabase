import { mysqlTable, int, varchar, mysqlEnum, timestamp, text, decimal } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  email: varchar("email", { length: 255 }).notNull(),
  // "status" is a Postgres reserved-ish keyword in our guard list — gets hoisted as status_enum.
  status: mysqlEnum("status", ["active", "suspended"]).default("active"),
  role: mysqlEnum("role", ["admin", "member", "viewer"]).default("member"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});
export type User = typeof users.$inferSelect;

export const authCredentials = mysqlTable("authCredentials", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
});
export type AuthCredential = typeof authCredentials.$inferSelect;
export type InsertAuthCredential = typeof authCredentials.$inferInsert;

export const orders = mysqlTable("orders", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  // Same enum name "role" but different values -> must get a distinct type name.
  role: mysqlEnum("role", ["buyer", "seller"]).default("buyer"),
});

export const posts = mysqlTable("posts", {
  id: int("id").primaryKey(),
  body: text("body"),
  state: mysqlEnum("state", ["draft", "published"]).default("draft"),
});
