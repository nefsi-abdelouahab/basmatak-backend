import { Types } from 'mongoose';
import {
  InertOrgFootprintProvider,
  ORG_FOOTPRINT_PROVIDER,
} from './org-footprint';

describe('org-footprint seam', () => {
  it('exposes a stable DI token', () => {
    expect(ORG_FOOTPRINT_PROVIDER).toBe('ORG_FOOTPRINT_PROVIDER');
  });

  it('inert default returns a zeroed footprint', async () => {
    const provider = new InertOrgFootprintProvider();
    await expect(provider.getFootprint(new Types.ObjectId())).resolves.toEqual({
      opportunities: 0,
      applications: 0,
      participants: 0,
      experiences: 0,
      hours: 0,
      reliability: null,
    });
  });
});
