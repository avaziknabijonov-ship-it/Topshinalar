import {sqliteTable,text,integer} from "drizzle-orm/sqlite-core";
export const records=sqliteTable("records",{id:text("id").primaryKey(),kind:text("kind").notNull(),payload:text("payload").notNull(),updatedAt:integer("updated_at").notNull()});
export const throttles=sqliteTable("throttles",{id:text("id").primaryKey(),count:integer("count").notNull(),expires:integer("expires").notNull()});
export const catalogReplica=sqliteTable('catalog_replica',{
 sourceProductId:text('source_product_id').primaryKey(),
 sourceVersion:integer('source_version').notNull(),
 payload:text('payload').notNull(),
 digest:text('digest').notNull(),
 syncedAt:integer('synced_at').notNull(),
});
export const catalogNonces=sqliteTable('catalog_nonces',{
 nonce:text('nonce').primaryKey(),expires:integer('expires').notNull(),
});
export const catalogMode=sqliteTable('catalog_mode',{
 id:integer('id').primaryKey(),enabled:integer('enabled').notNull(),
});
