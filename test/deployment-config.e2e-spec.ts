import { readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * S20 acceptance criterion 1: `render.yaml` aligns with `.env.example`, the
 * keep-alive workflow exists with the right schedule/secret wiring, and
 * `docs/DEPLOY.md` is present with the click-path + env contract. Pure file
 * assertions, no DB — path-stable relative to `backend/test/`.
 */
describe('deployment configuration (S20)', () => {
  const repoRoot = resolve(__dirname, '..', '..');
  const backendDir = join(repoRoot, 'backend');

  const renderYaml = readFileSync(join(repoRoot, 'render.yaml'), 'utf8');
  const envExample = readFileSync(join(backendDir, '.env.example'), 'utf8');
  const workflow = readFileSync(
    join(repoRoot, '.github', 'workflows', 'keep-alive.yml'),
    'utf8',
  );
  const deployDoc = readFileSync(join(repoRoot, 'docs', 'DEPLOY.md'), 'utf8');
  const packageJson = JSON.parse(
    readFileSync(join(backendDir, 'package.json'), 'utf8'),
  ) as { scripts: Record<string, string> };

  const envNames = Array.from(
    envExample.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm),
    (m) => m[1],
  );
  const renderKeys = Array.from(
    renderYaml.matchAll(/^\s*-\s+key:\s*(\S+)\s*$/gm),
    (m) => m[1],
  );

  it('render.yaml declares the exact build and start commands', () => {
    expect(renderYaml).toContain('buildCommand: npm ci && npm run build');
    expect(renderYaml).toContain('startCommand: npm run start:prod');
    expect(packageJson.scripts.build).toBe('nest build');
    expect(packageJson.scripts['start:prod']).toBe('node dist/main');
  });

  it('every .env.example variable maps to a render.yaml envVar except injected PORT', () => {
    const missing = envNames.filter(
      (name) => name !== 'PORT' && !renderKeys.includes(name),
    );
    expect(missing).toEqual([]);
    expect(renderKeys).not.toContain('PORT');
  });

  it('sets NODE_ENV=production and pins the Node runtime', () => {
    expect(renderYaml).toContain('key: NODE_ENV');
    expect(renderYaml).toContain('value: production');
    expect(renderYaml).toContain('runtime: node');
  });

  it('keep-alive workflow runs every 15 minutes with the jobs secret', () => {
    expect(workflow).toContain('cron: "*/15 * * * *"');
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toContain('/api/v1/internal/jobs/run');
    expect(workflow).toContain('X-Jobs-Key: ${{ secrets.JOBS_KEY }}');
    expect(workflow).toContain('${{ vars.RENDER_SERVICE_URL }}');
    expect(workflow).toContain('continue-on-error: true');
  });

  it('DEPLOY.md captures the click-path, health check and the full env list', () => {
    expect(deployDoc).toContain('npm ci && npm run build');
    expect(deployDoc).toContain('npm run start:prod');
    expect(deployDoc).toContain('/api/v1/health');
    expect(deployDoc).toContain('cron-job.org');
    expect(deployDoc).toContain('JOBS_KEY');
    for (const name of envNames) {
      expect(deployDoc).toContain(name);
    }
  });
});
