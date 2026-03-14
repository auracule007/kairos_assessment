import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { EmailService } from '../notifications/email.service';

const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  [ApplicationStatus.APPLIED]: [
    ApplicationStatus.INTERVIEWING,
    ApplicationStatus.CLOSED,
  ],
  [ApplicationStatus.INTERVIEWING]: [
    ApplicationStatus.CONTRACTED,
    ApplicationStatus.CLOSED,
  ],
  [ApplicationStatus.CONTRACTED]: [
    ApplicationStatus.COMPLETED,
    ApplicationStatus.CLOSED,
  ],
  [ApplicationStatus.COMPLETED]: [ApplicationStatus.CLOSED],
  [ApplicationStatus.CLOSED]: [],
};

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async createApplication(dto: CreateApplicationDto) {
    if (!dto.candidateEmail) {
      throw new BadRequestException('candidateEmail is required.');
    }

    return this.prisma.application.create({
      data: {
        candidateEmail: dto.candidateEmail,
      },
    });
  }

  async transitionStatus(
    id: string,
    dto: UpdateApplicationStatusDto,
    user: RequestUser,
  ): Promise<{
    applicationId: string;
    status: ApplicationStatus;
    emailNotified: boolean;
  }> {
    const application = await this.prisma.application.findUnique({
      where: { id },
    });

    if (!application) {
      throw new NotFoundException('Application not found.');
    }

    if (application.status === dto.newStatus) {
      throw new BadRequestException(
        'Application is already in the requested status.',
      );
    }

    if (!VALID_TRANSITIONS[application.status].includes(dto.newStatus)) {
      throw new BadRequestException(
        `Invalid transition: ${application.status} -> ${dto.newStatus}`,
      );
    }

    const isRestrictedTransition =
      dto.newStatus === ApplicationStatus.INTERVIEWING ||
      dto.newStatus === ApplicationStatus.CONTRACTED;

    if (
      isRestrictedTransition &&
      ![UserRole.COMPANY, UserRole.ADMIN].includes(user.role)
    ) {
      throw new ForbiddenException(
        'Only COMPANY or ADMIN can perform this transition.',
      );
    }

    if (
      dto.newStatus === ApplicationStatus.CONTRACTED &&
      !dto.contractUrl &&
      !application.contractUrl
    ) {
      throw new BadRequestException(
        'contractUrl is required before transitioning to CONTRACTED.',
      );
    }

    const resolvedContractUrl = dto.contractUrl ?? application.contractUrl;
    if (
      dto.newStatus === ApplicationStatus.CONTRACTED &&
      (!resolvedContractUrl || !this.isValidHttpUrl(resolvedContractUrl))
    ) {
      throw new BadRequestException(
        'contractUrl must be a valid http(s) URL before transitioning to CONTRACTED.',
      );
    }

    const metadata = dto.metadata
      ? (dto.metadata as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id },
        data: {
          status: dto.newStatus,
          contractUrl: resolvedContractUrl,
        },
      });

      await tx.statusHistory.create({
        data: {
          applicationId: id,
          previousStatus: application.status,
          newStatus: dto.newStatus,
          changedBy: user.id,
          metadata,
        },
      });

      return updated;
    });

    let emailNotified = false;
    if (dto.newStatus === ApplicationStatus.CONTRACTED && result.contractUrl) {
      emailNotified = await this.emailService.sendContractConfirmation({
        to: result.candidateEmail,
        applicationId: result.id,
        contractUrl: result.contractUrl,
      });

      if (!emailNotified) {
        this.logger.warn(
          `Contract email was not delivered for application ${result.id}.`,
        );
      }
    }

    return {
      applicationId: result.id,
      status: result.status,
      emailNotified,
    };
  }

  async getHistory(id: string) {
    const exists = await this.prisma.application.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Application not found.');
    }

    return this.prisma.statusHistory.findMany({
      where: { applicationId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  private isValidHttpUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
