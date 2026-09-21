import { JobRegistry } from './job-registry';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let registry: JobRegistry;
  let jobsService: JobsService;

  beforeEach(() => {
    registry = new JobRegistry();
    jobsService = new JobsService(registry);
  });

  it('runs no handlers when the registry is empty', async () => {
    const result = await jobsService.run();
    expect(result).toEqual({ ok: true, ran: 0, results: [] });
  });

  it('runs every registered handler once and reports success', async () => {
    const calls: string[] = [];
    registry.register('a', async () => {
      calls.push('a');
    });
    registry.register('b', async () => {
      calls.push('b');
    });

    const result = await jobsService.run();
    expect(result).toEqual({
      ok: true,
      ran: 2,
      results: expect.arrayContaining([
        { name: 'a', ok: true },
        { name: 'b', ok: true },
      ]),
    });
    expect(calls).toEqual(['a', 'b']);
  });

  it('single-flight mutex: concurrent runs execute the handlers exactly once', async () => {
    let executions = 0;
    registry.register('slow-handler', async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      executions += 1;
    });

    const [first, second, third] = await Promise.all([
      jobsService.run(),
      jobsService.run(),
      jobsService.run(),
    ]);

    expect(executions).toBe(1);
    expect(first.ran).toBe(1);
    expect(second.ran).toBe(1);
    expect(third.ran).toBe(1);
  });

  it('isolates a failing handler and reports it in results', async () => {
    registry.register('fail', async () => {
      throw new Error('nope');
    });
    registry.register('ok', async () => undefined);

    const result = await jobsService.run();
    expect(result.ok).toBe(false);
    expect(result.ran).toBe(2);
    const fail = result.results.find((r) => r.name === 'fail');
    const ok = result.results.find((r) => r.name === 'ok');
    expect(fail?.ok).toBe(false);
    expect(fail?.error).toBe('Error: nope');
    expect(ok?.ok).toBe(true);
  });
});
