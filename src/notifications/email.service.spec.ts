import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { EmailService } from './email.service';

describe('EmailService', () => {
  const originalEnv = process.env;
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.RESEND_API_KEY = 're_test_123';
    process.env.RESEND_FROM_EMAIL = 'no-reply@example.com';
    process.env.EMAIL_MAX_RETRIES = '3';
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns false when email env vars are missing', async () => {
    delete process.env.RESEND_API_KEY;

    const service = new EmailService();
    const result = await service.sendContractConfirmation({
      to: 'dev@example.com',
      applicationId: 'app-1',
      contractUrl: 'https://contracts.dev/1',
    });

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends email successfully on first attempt', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    } as Response);

    const service = new EmailService();
    const result = await service.sendContractConfirmation({
      to: 'dev@example.com',
      applicationId: 'app-1',
      contractUrl: 'https://contracts.dev/1',
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds when first request fails', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('temporary failure'),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      } as Response);

    const service = new EmailService();
    const result = await service.sendContractConfirmation({
      to: 'dev@example.com',
      applicationId: 'app-1',
      contractUrl: 'https://contracts.dev/1',
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
