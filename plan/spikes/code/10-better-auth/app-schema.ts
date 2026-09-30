// A stand-in for every user-owned table in the real app (contacts, threads, automations, ...).
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth-schema.ts'

export const spikeContacts = pgTable('spike_contacts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
