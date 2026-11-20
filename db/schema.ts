import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const freeBots = pgTable('free_bots', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    xml: text('xml').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
