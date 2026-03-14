import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ApplicationStatus } from '@prisma/client';
import { ApplicationsService } from './applications.service';
import { EmailService } from '../notifications/email.service';
import { UserRole } from '../common/enums/user-role.enum';

type MockFn = jest.Mock;

describe('ApplicationsService', () => {
  const prismaMock = {
    application: {
      create: jest.fn() as MockFn,
      findUnique: jest.fn() as MockFn,
      update: jest.fn() as MockFn,
    },
    statusHistory: {
      create: jest.fn() as MockFn,
      findMany: jest.fn() as MockFn,
    },
    $transaction: jest.fn() as MockFn,
  };

  const emailServiceMock: {
    sendContractConfirmation: jest.MockedFunction<
      EmailService['sendContractConfirmation']
    >;
  } = {
    sendContractConfirmation: jest.fn(),
  };

  const actor = { id: 'admin-1', role: UserRole.ADMIN };

  let service: ApplicationsService;

  beforeEach(() => {
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation((...args: unknown[]) => {
      const callback = args[0] as (tx: {
        application: { update: MockFn };
        statusHistory: { create: MockFn };
      }) => unknown;

      return callback({
        application: { update: prismaMock.application.update },
        statusHistory: { create: prismaMock.statusHistory.create },
      });
    });

    const prismaService = prismaMock as unknown as ConstructorParameters<
      typeof ApplicationsService
    >[0];
    const emailService = emailServiceMock as unknown as ConstructorParameters<
      typeof ApplicationsService
    >[1];

    service = new ApplicationsService(prismaService, emailService);
  });

  it('creates application when candidateEmail is provided', async () => {
    prismaMock.application.create.mockReturnValue(
      Promise.resolve({
        id: 'app-1',
        candidateEmail: 'dev@example.com',
      }),
    );

    const result = await service.createApplication({
      candidateEmail: 'dev@example.com',
    });

    expect(result).toEqual({ id: 'app-1', candidateEmail: 'dev@example.com' });
    expect(prismaMock.application.create).toHaveBeenCalledWith({
      data: { candidateEmail: 'dev@example.com' },
    });
  });

  it('throws when candidateEmail is missing', async () => {
    await expect(
      service.createApplication({ candidateEmail: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws for invalid state transition', async () => {
    prismaMock.application.findUnique.mockReturnValue(
      Promise.resolve({
        id: 'app-1',
        status: ApplicationStatus.APPLIED,
        contractUrl: null,
      }),
    );

    await expect(
      service.transitionStatus(
        'app-1',
        { newStatus: ApplicationStatus.COMPLETED },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when application is not found during transition', async () => {
    prismaMock.application.findUnique.mockReturnValue(Promise.resolve(null));

    await expect(
      service.transitionStatus(
        'missing-id',
        { newStatus: ApplicationStatus.INTERVIEWING },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when transitioning to the same status', async () => {
    prismaMock.application.findUnique.mockReturnValue(
      Promise.resolve({
        id: 'app-1',
        status: ApplicationStatus.APPLIED,
        contractUrl: null,
      }),
    );

    await expect(
      service.transitionStatus(
        'app-1',
        { newStatus: ApplicationStatus.APPLIED },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws for CONTRACTED transition without contractUrl', async () => {
    prismaMock.application.findUnique.mockReturnValue(
      Promise.resolve({
        id: 'app-1',
        status: ApplicationStatus.INTERVIEWING,
        contractUrl: null,
      }),
    );

    await expect(
      service.transitionStatus(
        'app-1',
        { newStatus: ApplicationStatus.CONTRACTED },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws for CONTRACTED transition with invalid contractUrl', async () => {
    prismaMock.application.findUnique.mockReturnValue(
      Promise.resolve({
        id: 'app-1',
        status: ApplicationStatus.INTERVIEWING,
        contractUrl: null,
      }),
    );

    await expect(
      service.transitionStatus(
        'app-1',
        { newStatus: ApplicationStatus.CONTRACTED, contractUrl: 'invalid-url' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks candidate from restricted transitions', async () => {
    prismaMock.application.findUnique.mockReturnValue(
      Promise.resolve({
        id: 'app-1',
        status: ApplicationStatus.APPLIED,
        contractUrl: null,
      }),
    );

    await expect(
      service.transitionStatus(
        'app-1',
        { newStatus: ApplicationStatus.INTERVIEWING },
        { id: 'candidate-1', role: UserRole.CANDIDATE },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('writes audit entry inside transaction and returns transition result', async () => {
    prismaMock.application.findUnique.mockReturnValue(
      Promise.resolve({
        id: 'app-1',
        candidateEmail: 'dev@example.com',
        status: ApplicationStatus.APPLIED,
        contractUrl: null,
      }),
    );
    prismaMock.application.update.mockReturnValue(
      Promise.resolve({
        id: 'app-1',
        candidateEmail: 'dev@example.com',
        status: ApplicationStatus.INTERVIEWING,
        contractUrl: null,
      }),
    );

    const result = await service.transitionStatus(
      'app-1',
      {
        newStatus: ApplicationStatus.INTERVIEWING,
        metadata: { source: 'test' },
      },
      actor,
    );

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.statusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: 'app-1',
        previousStatus: ApplicationStatus.APPLIED,
        newStatus: ApplicationStatus.INTERVIEWING,
        changedBy: 'admin-1',
      }),
    });
    expect(result).toEqual({
      applicationId: 'app-1',
      status: ApplicationStatus.INTERVIEWING,
      emailNotified: false,
    });
  });

  it('sends contracted email and exposes status', async () => {
    prismaMock.application.findUnique.mockReturnValue(
      Promise.resolve({
        id: 'app-1',
        candidateEmail: 'dev@example.com',
        status: ApplicationStatus.INTERVIEWING,
        contractUrl: null,
      }),
    );
    prismaMock.application.update.mockReturnValue(
      Promise.resolve({
        id: 'app-1',
        candidateEmail: 'dev@example.com',
        status: ApplicationStatus.CONTRACTED,
        contractUrl: 'https://contracts.dev/1',
      }),
    );
    emailServiceMock.sendContractConfirmation.mockResolvedValue(true);

    const result = await service.transitionStatus(
      'app-1',
      {
        newStatus: ApplicationStatus.CONTRACTED,
        contractUrl: 'https://contracts.dev/1',
      },
      actor,
    );

    expect(emailServiceMock.sendContractConfirmation).toHaveBeenCalledWith({
      to: 'dev@example.com',
      applicationId: 'app-1',
      contractUrl: 'https://contracts.dev/1',
    });
    expect(result.emailNotified).toBe(true);
  });

  it('returns emailNotified false when contracted email fails', async () => {
    prismaMock.application.findUnique.mockReturnValue(
      Promise.resolve({
        id: 'app-1',
        candidateEmail: 'dev@example.com',
        status: ApplicationStatus.INTERVIEWING,
        contractUrl: null,
      }),
    );
    prismaMock.application.update.mockReturnValue(
      Promise.resolve({
        id: 'app-1',
        candidateEmail: 'dev@example.com',
        status: ApplicationStatus.CONTRACTED,
        contractUrl: 'https://contracts.dev/2',
      }),
    );
    emailServiceMock.sendContractConfirmation.mockResolvedValue(false);

    const result = await service.transitionStatus(
      'app-1',
      {
        newStatus: ApplicationStatus.CONTRACTED,
        contractUrl: 'https://contracts.dev/2',
      },
      actor,
    );

    expect(result).toEqual({
      applicationId: 'app-1',
      status: ApplicationStatus.CONTRACTED,
      emailNotified: false,
    });
  });

  it('returns not found for unknown application history', async () => {
    prismaMock.application.findUnique.mockReturnValue(Promise.resolve(null));

    await expect(service.getHistory('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns ordered status history records', async () => {
    prismaMock.application.findUnique.mockReturnValue(
      Promise.resolve({ id: 'app-1' }),
    );
    prismaMock.statusHistory.findMany.mockReturnValue(
      Promise.resolve([{ id: 'h-1' }, { id: 'h-2' }]),
    );

    const result = await service.getHistory('app-1');

    expect(prismaMock.statusHistory.findMany).toHaveBeenCalledWith({
      where: { applicationId: 'app-1' },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toEqual([{ id: 'h-1' }, { id: 'h-2' }]);
  });
});
