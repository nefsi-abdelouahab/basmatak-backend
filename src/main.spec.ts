import { INestApplication } from '@nestjs/common';
import { applyTrustProxy, resolveTrustProxy } from './main';

function fakeApp() {
  const set = jest.fn();
  const app = {
    getHttpAdapter: () => ({ getInstance: () => ({ set }) }),
  } as unknown as INestApplication;
  return { app, set };
}

describe('trust proxy configuration (S12)', () => {
  it('trusts one hop by default in production and nothing locally', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'production' })).toBe(1);
    expect(resolveTrustProxy({ NODE_ENV: 'development' })).toBe(false);
    expect(resolveTrustProxy({})).toBe(false);
  });

  it('honors explicit hop counts and disable switches', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: '1' })).toBe(1);
    expect(resolveTrustProxy({ TRUST_PROXY: ' 2 ' })).toBe(2);
    expect(resolveTrustProxy({ TRUST_PROXY: 'false' })).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: 'FALSE' })).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: '0' })).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: 'off' })).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: 'true' })).toBe(true);
  });

  it('fails closed on invalid, negative, or fractional values', () => {
    for (const value of ['', 'yes', '-1', '1.5', 'one', '01', '1e3']) {
      expect(resolveTrustProxy({ TRUST_PROXY: value })).toBe(false);
    }
  });

  it('writes the resolved value onto the Express instance', () => {
    const { app, set } = fakeApp();
    expect(applyTrustProxy(app, { NODE_ENV: 'production' })).toBe(1);
    expect(set).toHaveBeenCalledWith('trust proxy', 1);

    applyTrustProxy(app, { NODE_ENV: 'development' });
    expect(set).toHaveBeenLastCalledWith('trust proxy', false);
  });
});
