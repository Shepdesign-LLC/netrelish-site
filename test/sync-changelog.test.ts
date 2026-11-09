import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve('scripts/sync-changelog.mjs');
const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sync-changelog-'));
  temporary.push(root);
  const app = join(root, 'app');
  const site = join(root, 'site');
  mkdirSync(join(app, 'docs/releases'), { recursive: true });
  mkdirSync(join(site, 'src/lib'), { recursive: true });
  mkdirSync(join(site, '.git'));
  const secret = 'SYNTHETIC_CI_WRITE_TOKEN_DO_NOT_PUBLISH';
  const config = join(site, '.git/config');
  writeFileSync(config, `[http "https://github.com/"]\n\textraheader = ${secret}\n`);
  const note = join(app, 'docs/releases/v0.5.0.md');
  writeFileSync(note, 'A **safe** release.\n\n## New in 0.5.0\n- A new feature.\n');
  const git = (...args: string[]) => execFileSync('git', ['-C', app, ...args], { encoding: 'utf8', stdio: 'pipe' });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Sync test');
  git('config', 'user.email', 'sync-test@example.invalid');
  const commit = (message: string) => {
    git('add', '-A');
    git('commit', '-m', message);
  };
  commit('Initial release');
  git('tag', 'v0.5.0');
  const output = join(site, 'src/lib/changelog.generated.ts');
  const run = () => spawnSync(process.execPath, [script, app], { cwd: site, encoding: 'utf8' });
  return { app, site, note, config, secret, git, commit, output, run };
}

describe('changelog sync trust boundary', () => {
  it('reads regular committed release notes and unreleased commits', () => {
    const f = fixture();
    f.git('commit', '--allow-empty', '-m', 'feat: another feature (#12)');
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    const output = readFileSync(f.output, 'utf8');
    expect(output).toContain('A safe release');
    expect(output).toContain('A new feature');
    expect(output).toContain('Another feature');
  });

  it('rejects a committed release-note symlink before generating output', () => {
    const f = fixture();
    rmSync(f.note);
    symlinkSync(f.config, f.note);
    f.commit('Replace tagged release note with a symlink');
    const result = f.run();
    // Any generated output must never contain the synthetic runner credential.
    if (existsSync(f.output)) expect(readFileSync(f.output, 'utf8')).not.toContain(f.secret);
    expect(result.status).not.toBe(0);
    expect(existsSync(f.output)).toBe(false);
  });

  it.each(['docs', 'docs/releases'])('does not follow a committed %s directory symlink', (parent) => {
    const f = fixture();
    const external = join(f.site, 'external');
    mkdirSync(join(external, 'releases'), { recursive: true });
    writeFileSync(join(external, 'v0.5.0.md'), f.secret);
    writeFileSync(join(external, 'releases/v0.5.0.md'), f.secret);
    rmSync(join(f.app, parent), { recursive: true });
    symlinkSync(external, join(f.app, parent));
    f.commit('Replace release-note parent with a symlink');
    const result = f.run();
    if (existsSync(f.output)) expect(readFileSync(f.output, 'utf8')).not.toContain(f.secret);
    expect(result.status).not.toBe(0);
    expect(existsSync(f.output)).toBe(false);
  });

  it('ignores working-tree symlinks and reads only committed blobs', () => {
    const f = fixture();
    rmSync(f.note);
    symlinkSync(f.config, f.note);
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    const output = readFileSync(f.output, 'utf8');
    expect(output).toContain('A safe release');
    expect(output).not.toContain(f.secret);
  });
});
