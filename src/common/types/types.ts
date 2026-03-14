import { RequestUser } from '../../common/interfaces/request-user.interface';
import { ApplicationStatus } from '@prisma/client';

export type RequestWithAuthorization = Request & {
  headers: {
    authorization?: string;
  };
  user?: RequestUser;
};

export type RequestWithUser = Request & {
  body: { newStatus?: ApplicationStatus };
  user?: RequestUser;
};