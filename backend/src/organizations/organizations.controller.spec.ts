import type { Response } from 'express';
import type { AccountToken } from '../common/interfaces/account-token.interface';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/**
 * Response double that mimics Express `res.vary`: it appends to the existing
 * header instead of replacing it, which is exactly the CORS-safe behavior the
 * public profile route depends on.
 */
function responseDouble(initialVary?: string): Response {
  const headers: Record<string, string> = {};
  if (initialVary) headers.Vary = initialVary;

  return {
    headers,
    vary(field: string) {
      const current = headers.Vary;
      headers.Vary = current ? `${current}, ${field}` : field;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  } as unknown as Response;
}

describe('OrganizationsController public profile headers', () => {
  function buildController() {
    const service = {
      getPublicBySlug: jest.fn().mockResolvedValue({}),
    };
    return {
      service,
      controller: new OrganizationsController(
        service as unknown as OrganizationsService,
      ),
    };
  }

  it('passes the viewer and appends cache Vary values without dropping CORS', async () => {
    const { service, controller } = buildController();
    const account: AccountToken = {
      sub: '64b000000000000000000001',
      role: 'volunteer',
      sessionId: '64b000000000000000000020',
    };
    const res = responseDouble('Origin');

    await controller.getBySlug('alpha-org', account, res);

    expect(service.getPublicBySlug).toHaveBeenCalledWith('alpha-org', account);
    expect(
      (res as unknown as { headers: Record<string, string> }).headers,
    ).toMatchObject({
      Vary: 'Origin, Authorization, Cookie',
      'Cache-Control': 'private, no-store',
    });
  });

  it('keeps guest reads working and still varies the response', async () => {
    const { service, controller } = buildController();
    const res = responseDouble();

    await controller.getBySlug('alpha-org', undefined, res);

    expect(service.getPublicBySlug).toHaveBeenCalledWith(
      'alpha-org',
      undefined,
    );
    expect(
      (res as unknown as { headers: Record<string, string> }).headers,
    ).toMatchObject({
      Vary: 'Authorization, Cookie',
      'Cache-Control': 'private, no-store',
    });
  });
});
