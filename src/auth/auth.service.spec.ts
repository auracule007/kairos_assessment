import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { UserRole } from '../common/enums/user-role.enum';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const secret = 'test-secret';
  let jwtService: JwtService;
  let service: AuthService;

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
    jwtService = new JwtService();
    service = new AuthService(jwtService);
  });

  it('issues token for valid user id and role', async () => {
    const { accessToken } = service.issueAccessToken('admin-1', UserRole.ADMIN);

    const payload = await jwtService.verifyAsync<{
      sub: string;
      role: UserRole;
    }>(accessToken, { secret });
    expect(payload.sub).toBe('admin-1');
    expect(payload.role).toBe(UserRole.ADMIN);
  });

  it('rejects missing user id', () => {
    expect(() => service.issueAccessToken('', UserRole.ADMIN)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects invalid role', () => {
    expect(() =>
      service.issueAccessToken('user-1', 'MANAGER' as UserRole),
    ).toThrow(UnauthorizedException);
  });
});
