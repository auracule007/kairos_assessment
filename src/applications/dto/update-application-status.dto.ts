import { ApplicationStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsUrl } from 'class-validator';

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus)
  newStatus!: ApplicationStatus;

  @IsOptional()
  @IsUrl(
    { require_protocol: true },
    { message: 'contractUrl must be a valid URL.' },
  )
  contractUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
