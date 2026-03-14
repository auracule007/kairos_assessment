import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { ApplicationStatus } from '@prisma/client';
import { StatusTransitionGuard } from './status-transition.guard';

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('StatusTransitionGuard', () => {
  const guard = new StatusTransitionGuard();

  it('allows admin to move to INTERVIEWING', () => {
    const request: {
      body: { newStatus: ApplicationStatus };
      user?: { id: string; role: string };
    } = {
      body: {
        newStatus: ApplicationStatus.INTERVIEWING,
      },
      user: {
        id: 'user-1',
        role: 'ADMIN',
      },
    };

    const result = guard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it('rejects candidate moving to CONTRACTED', () => {
    const request = {
      user: {
        id: 'user-1',
        role: 'CANDIDATE',
      },
      body: {
        newStatus: ApplicationStatus.CONTRACTED,
      },
    };

    expect(() => guard.canActivate(createContext(request))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects missing authenticated user', () => {
    const request = {
      body: {
        newStatus: ApplicationStatus.INTERVIEWING,
      },
    };

    expect(() => guard.canActivate(createContext(request))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects invalid authenticated user role', () => {
    const request = {
      user: {
        id: 'user-1',
        role: 'INVALID_ROLE',
      },
      body: {
        newStatus: ApplicationStatus.INTERVIEWING,
      },
    };

    expect(() => guard.canActivate(createContext(request))).toThrow(
      UnauthorizedException,
    );
  });
});
