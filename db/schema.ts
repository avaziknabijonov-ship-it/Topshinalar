import {sqliteTable,text,integer} from "drizzle-orm/sqlite-core";
export const records=sqliteTable("records",{id:text("id").primaryKey(),kind:text("kind").notNull(),payload:text("payload").notNull(),updatedAt:integer("updated_at").notNull()});
export const throttles=sqliteTable("throttles",{id:text("id").primaryKey(),count:integer("count").notNull(),expires:integer("expires").notNull()});
