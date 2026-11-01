import { describe, expect, it } from 'vitest';
import { changelog, later, never, next, now } from '../src/lib/roadmap';

// The scope these hold to is ADR 0012 in Shepdesign-LLC/NetRelish (docs/adr/0012-dec-14-scope.md).
describe('roadmap', () => {
  const names = (list: { name: string }[]) => list.map((e) => e.name);

  it('lists each item in one column only', () => {
    const all = [...names(now), ...names(next), ...names(later)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('ships exactly the two Pro features ADR 0012 puts in 1.0', () => {
    expect(names(now.filter((e) => e.pro))).toEqual(['Reseal & diff', 'Provenance export']);
  });

  it('keeps everything ADR 0012 moved to 1.1 out of Now', () => {
    for (const moved of ['Ask the Pantry', 'Content blocker', 'Split view', 'Jar bundles', 'Semantic search', 'Your own Recipes']) {
      expect(names(now)).not.toContain(moved);
      expect(names(next)).toContain(moved);
    }
  });

  it('never promises what the architecture rules out', () => {
    expect(never).toContain('Accounts');
    expect(never).toContain('Cloud sync through our servers');
    const visible = JSON.stringify({ now, next, later, changelog });
    expect(visible).not.toMatch(/\bInspector\b/);   // the UI word is Panel (ADR 0010, row 9)
    expect(visible).not.toMatch(/Nothing leaves your Mac/);
  });

  it('starts the changelog with what is unreleased', () => {
    expect(changelog[0].label).toBe('Unreleased');
  });
});
