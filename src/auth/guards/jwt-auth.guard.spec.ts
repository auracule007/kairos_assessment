import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { JwtAuthGuard } from './jwt-auth.guard';

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const secret = 'test-secret';
  let jwtService: JwtService;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
    jwtService = new JwtService();
    guard = new JwtAuthGuard(jwtService);
  });

  it('allows request with valid bearer token and attaches user', async () => {
    const token = jwtService.sign(
      {
        sub: 'user-1',
        role: 'ADMIN',
      },
      { secret },
    );

    const request: {
      headers: Record<string, string>;
      user?: { id: string; role: 'ADMIN' | 'COMPANY' | 'CANDIDATE' };
    } = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1', role: 'ADMIN' });
  });

  it('rejects missing authorization header', async () => {
    const request = {
      headers: {},
    };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects invalid token format', async () => {
    const request = {
      headers: {
        authorization: 'Token abc',
      },
    };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects token with invalid role claim', async () => {
    const token = jwtService.sign(
      {
        sub: 'user-1',
        role: 'MANAGER',
      },
      { secret },
    );

    const request = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
