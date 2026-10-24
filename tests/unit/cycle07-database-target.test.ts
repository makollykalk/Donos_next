import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { assertCycle07Target, CYCLE07_APPROVED_DEV_REF } from '../helpers/cycle07-local-db.js';

const target = {
  requestedProjectRef: CYCLE07_APPROVED_DEV_REF,
  projectRef: CYCLE07_APPROVED_DEV_REF,
  supabaseUrl: `https://${CYCLE07_APPROVED_DEV_REF}.supabase.co`,
  databaseUrl: `postgresql://donos_api.${CYCLE07_APPROVED_DEV_REF}:synthetic-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`,
  configDirectory: tmpdir(),
  workspaceRoot: process.cwd(),
};

describe('Cycle 07 DEV database target guard', () => {
  it('accepts only the explicitly authorized DEV project and its scoped pooler credentials', () => {
    expect(() => assertCycle07Target(target)).not.toThrow();
  });

  it('rejects a run without explicit target opt-in', () => {
    const withoutOptIn = {
      projectRef: target.projectRef,
      supabaseUrl: target.supabaseUrl,
      databaseUrl: target.databaseUrl,
      configDirectory: target.configDirectory,
      workspaceRoot: target.workspaceRoot,
    };
    expect(() => assertCycle07Target(withoutOptIn)).toThrow(/explicit/i);
  });

  it('rejects a different project reference even if its API URL matches the allowlist', () => {
    expect(() => assertCycle07Target({ ...target, projectRef: 'other-project' })).toThrow(/project/i);
  });

  it('rejects a database endpoint outside the authorized Supabase pooler', () => {
    const databaseUrl = target.databaseUrl.replace('aws-0-us-east-1.pooler.supabase.com', 'db.other-project.supabase.co');
    expect(() => assertCycle07Target({ ...target, databaseUrl })).toThrow(/database/i);
  });

  it('rejects credential files stored inside the code worktree', () => {
    expect(() => assertCycle07Target({ ...target, configDirectory: resolve(process.cwd(), '.local') })).toThrow(/outside/i);
  });

  it('rejects an external-looking path that resolves through a junction into the code worktree', () => {
    const workspaceConfig = mkdtempSync(join(process.cwd(), '.cycle07-guard-'));
    let externalParent: string | undefined;
    try {
      externalParent = mkdtempSync(join(tmpdir(), 'cycle07-guard-'));
      const externalJunction = join(externalParent, 'config');
      symlinkSync(workspaceConfig, externalJunction, 'junction');
      expect(() => assertCycle07Target({ ...target, configDirectory: externalJunction })).toThrow(/outside/i);
    } finally {
      if (externalParent) rmSync(externalParent, { recursive: true, force: true });
      rmSync(workspaceConfig, { recursive: true, force: true });
    }
  });

  it('rejects a credential path outside the config directory that resolves into the code worktree', () => {
    const workspaceConfig = mkdtempSync(join(process.cwd(), '.cycle07-guard-'));
    let externalDirectory: string | undefined;
    try {
      externalDirectory = mkdtempSync(join(tmpdir(), 'cycle07-guard-'));
      const externalLink = join(externalDirectory, 'dev.json');
      symlinkSync(workspaceConfig, externalLink, 'junction');
      expect(() => assertCycle07Target({ ...target, credentialFiles: [externalLink] })).toThrow(/outside/i);
    } finally {
      if (externalDirectory) rmSync(externalDirectory, { recursive: true, force: true });
      rmSync(workspaceConfig, { recursive: true, force: true });
    }
  });
});
