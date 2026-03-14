import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';
import { UserRole } from '../enums/user-role.enum';
import { RequestUser } from '../interfaces/request-user.interface';

type RequestWithUser = Request & {
  body: { newStatus?: ApplicationStatus };
  user?: RequestUser;
};

@Injectable()
export class StatusTransitionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    const role = request.user.role;
    if (!Object.values(UserRole).includes(role)) {
      throw new UnauthorizedException('Invalid authenticated user role.');
    }

    const newStatus = request.body?.newStatus;
    const isRestrictedTransition =
      newStatus === ApplicationStatus.INTERVIEWING ||
      newStatus === ApplicationStatus.CONTRACTED;

    if (
      newStatus &&
      isRestrictedTransition &&
      ![UserRole.COMPANY, UserRole.ADMIN].includes(role)
    ) {
      throw new ForbiddenException(
        'Only COMPANY or ADMIN can transition to INTERVIEWING or CONTRACTED.',
      );
    }

    return true;
  }
}
