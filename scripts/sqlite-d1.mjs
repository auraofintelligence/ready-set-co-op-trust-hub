// Storage adapter for the local server and server-migration rehearsals. The
// application uses the same prepared SQL and atomic batches as Cloudflare D1.
export function createSqliteD1(database) {
  function statement(sql, values = []) {
    const prepare = () => database.prepare(sql);
    const metadata = changes => ({ changes: Number(changes ?? 0), duration: 0 });
    return {
      bind(...nextValues) { return statement(sql, nextValues); },
      async first(column) {
        const row = prepare().get(...values);
        return row ? (column === undefined ? row : row[column]) : null;
      },
      async all() {
        return { success: true, results: prepare().all(...values), meta: metadata(0) };
      },
      async run() {
        const result = prepare().run(...values);
        return { success: true, results: [], meta: { ...metadata(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
      executeBatch() {
        const prepared = prepare();
        if (prepared.columns().length) {
          const rows = prepared.all(...values);
          const changes = /^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)
            ? database.prepare('SELECT changes() AS count').get().count : 0;
          return { success: true, results: rows, meta: metadata(changes) };
        }
        const result = prepared.run(...values);
        return { success: true, results: [], meta: { ...metadata(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      }
    };
  }

  return {
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(item => item.executeBatch());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    async exec(sql) {
      database.exec(sql);
      return { count: 1, duration: 0 };
    }
  };
}
