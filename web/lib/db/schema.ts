import { boolean, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

// ============ Better Auth core tables (admin plugin adds role/banned/impersonatedBy) ============
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  role: text("role").default("member"),
  banned: boolean("banned").default(false),
  banReason: text("banReason"),
  banExpires: timestamp("banExpires"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonatedBy"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

// ============ App tables (snake_case; queried by FastAPI api via asyncpg) ============
export const invites = pgTable("invites", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  invitedBy: text("invited_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const servers = pgTable("servers", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  note: text("note").default(""),
  // How tool calls reach the box: "ssh" (stored creds) or "agent" (local agent, no creds).
  connectionType: text("connection_type").notNull().default("ssh"),
  sshEnabled: boolean("ssh_enabled").notNull().default(false),
  sshHost: text("ssh_host").default(""),
  sshPort: integer("ssh_port").default(22),
  sshUsername: text("ssh_username").default("root"),
  aapanelEnabled: boolean("aapanel_enabled").notNull().default(false),
  aapanelBaseUrl: text("aapanel_base_url").default(""),
  aapanelVerifySsl: boolean("aapanel_verify_ssl").notNull().default(false),
  monitorEnabled: boolean("monitor_enabled").notNull().default(false),
  monitorInterval: integer("monitor_interval").default(60),
  monitorServices: jsonb("monitor_services").default([]),
  secrets: jsonb("secrets").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Saved AI chat conversations. `messages` holds the full thread (incl. tool-call
// parts) as JSONB so a reload restores the exact rendering. Scoped per user.
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Hội thoại mới"),
  serverId: text("server_id"),
  messages: jsonb("messages").default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ChatOps: binds an external chat (Telegram chat_id) to a user + server. A pending
// row carries a one-time `code`; sending `/link <code>` to the bot fills `chat_id`.
export const chatopsLinks = pgTable("chatops_links", {
  id: text("id").primaryKey(),
  channel: text("channel").notNull().default("telegram"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  serverId: text("server_id").references(() => servers.id, { onDelete: "cascade" }),
  chatId: text("chat_id"),
  code: text("code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// "Always allow" rules for risky tool calls — when a (user, server, rule_key) row
// exists, the agent auto-runs that action without asking again. Revocable from the UI.
export const toolApprovals = pgTable(
  "tool_approvals",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    serverId: text("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
    ruleKey: text("rule_key").notNull(),
    label: text("label").default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ uq: unique().on(t.userId, t.serverId, t.ruleKey) }),
);

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").references(() => servers.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  level: text("level").notNull(),
  message: text("message").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Singleton (id='global') JSONB holding admin-editable LLM + notification config.
export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("global"),
  data: jsonb("data").default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const serviceStatus = pgTable(
  "service_status",
  {
    serverId: text("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    active: boolean("active").notNull(),
    since: timestamp("since").defaultNow(),
    checkedAt: timestamp("checked_at").defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.serverId, t.name] }) }),
);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),
  target: text("target").default(""),
  detail: text("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
