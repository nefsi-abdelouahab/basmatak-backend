import { AppLogger } from './app.logger';

describe('AppLogger', () => {
  afterEach(() => {
    delete process.env.LOG_LEVEL;
  });

  it('defaults to the log level', () => {
    delete process.env.LOG_LEVEL;
    expect(new AppLogger('test').getLevel()).toBe('log');
  });

  it('honors LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'error';
    expect(new AppLogger('test').getLevel()).toBe('error');
    process.env.LOG_LEVEL = 'verbose';
    expect(new AppLogger('test').getLevel()).toBe('verbose');
  });

  it('falls back to log for an unknown value', () => {
    process.env.LOG_LEVEL = 'nonsense';
    expect(new AppLogger('test').getLevel()).toBe('log');
  });
});
