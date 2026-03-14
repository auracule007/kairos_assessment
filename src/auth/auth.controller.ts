import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { IssueTokenDto } from './dto/issue-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('token')
  issueToken(@Body() dto: IssueTokenDto) {
    return this.authService.issueAccessToken(dto.userId, dto.role);
  }
}
