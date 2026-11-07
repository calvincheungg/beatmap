import { describe, expect, it } from 'vitest';

const files = import.meta.glob('../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Strips SQL comments, so a commented-out statement doesn't count. */
const sql = (text: string) => text.replace(/--.*$/gm, '').toLowerCase();

describe('database migrations', () => {
  const names = Object.keys(files).map((path) => path.split('/').pop()!);
  const all = Object.values(files).map(sql).join('\n');

  it('exist, with names that sort in order', () => {
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(new Set(names.map((name) => name.slice(0, 14))).size).toBe(names.length);
  });

  it('turn on row level security for every table', () => {
    const tables = [...all.matchAll(/create table (?:if not exists )?(?:public\.)?"?(\w+)"?/g)].map((match) => match[1]!);
    expect(tables).toContain('events');
    for (const table of tables) {
      expect(all, `${table} needs row level security`).toMatch(
        new RegExp(`alter table (?:public\\.)?"?${table}"? enable row level security`),
      );
    }
  });

  it('make every view respect the access rules of its tables', () => {
    const views = [...all.matchAll(/create (?:or replace )?view[\s\S]*?\bas\b/g)].map((match) => match[0]);
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) expect(view).toContain('security_invoker');
  });

  it('never grant write access to the public roles', () => {
    expect(all).not.toMatch(/grant\s+(all|insert|update|delete)[^;]*\bto\b[^;]*\banon\b/);
  });
});
