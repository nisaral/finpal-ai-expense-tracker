import { sqliteTable, integer, text, index, unique } from 'drizzle-orm/sqlite-core';

// Categories table - system and user-defined expense categories
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  emoji: text('emoji'),
  color: text('color'),
  isDefault: integer('is_default', { mode: 'boolean' }).default(true),
});

// Transactions table - core expense records
export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'), // nullable for now, will add auth later
  date: text('date').notNull(), // DATE format YYYY-MM-DD
  description: text('description').notNull(),
  vendor: text('vendor'),
  amountCents: integer('amount_cents').notNull(),
  categoryId: integer('category_id').references(() => categories.id).notNull(),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  idxTransactionsUserDate: index('idx_transactions_user_date').on(table.userId, table.date),
  idxTransactionsCategory: index('idx_transactions_category').on(table.categoryId),
}));

// Vendor rules - user-specific keyword-to-category mappings for auto-classification
export const vendorRules = sqliteTable('vendor_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'), // nullable for now
  keyword: text('keyword').notNull(), // lowercased, trimmed
  categoryId: integer('category_id').references(() => categories.id).notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  uniqueUserKeyword: unique().on(table.userId, table.keyword),
}));

// Budgets - per-user global budget settings
export const budgets = sqliteTable('budgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'), // nullable for now
  totalMonthlyBudgetCents: integer('total_monthly_budget_cents'),
  cycleStartDay: integer('cycle_start_day').notNull().default(1), // CHECK 1<=cycle_start_day<=28
  createdAt: text('created_at').notNull(),
});

// Category budgets - per-category spending limits
export const categoryBudgets = sqliteTable('category_budgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'), // nullable for now
  categoryId: integer('category_id').references(() => categories.id).notNull(),
  monthlyLimitCents: integer('monthly_limit_cents'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  uniqueUserCategory: unique().on(table.userId, table.categoryId),
}));

// Recurring expenses - scheduled recurring transactions
export const recurringExpenses = sqliteTable('recurring_expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'), // nullable for now
  description: text('description').notNull(),
  vendor: text('vendor'),
  amountCents: integer('amount_cents').notNull(),
  categoryId: integer('category_id').references(() => categories.id).notNull(),
  dayOfMonth: integer('day_of_month').notNull(), // CHECK 1<=day_of_month<=28
  nextRunDate: text('next_run_date'), // DATE format, managed by scheduler
  active: integer('active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull(),
});

// Splits - optional detail records for split transactions
export const splits = sqliteTable('splits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transactionId: integer('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }).notNull(),
  participant: text('participant').notNull(),
  shareCents: integer('share_cents').notNull(),
});


// Auth tables for better-auth
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});