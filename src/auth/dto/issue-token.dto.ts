import { UserRole } from '../../common/enums/user-role.enum';
import { IsEnum, IsString, MinLength } from 'class-validator';

export class IssueTokenDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
