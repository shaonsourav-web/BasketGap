import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

export type SqlClient = ReturnType<typeof postgres>;
export type Db = ReturnType<typeof drizzle>;

export function createSqlClient(databaseUrl: string): SqlClient {
  return postgres(databaseUrl, { prepare: false, max: 1 });
}

export function createDb(sql: SqlClient): Db {
  return drizzle(sql);
}
