import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  issueAccessToken(userId: string, role: UserRole): { accessToken: string } {
    if (!userId || !role) {
      throw new UnauthorizedException('userId and role are required.');
    }

    if (!Object.values(UserRole).includes(role)) {
      throw new UnauthorizedException('Invalid role supplied.');
    }

    const payload: JwtPayload = {
      sub: userId,
      role,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      expiresIn: '1h',
    });

    return { accessToken };
  }
}
