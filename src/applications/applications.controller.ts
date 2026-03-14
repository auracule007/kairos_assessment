import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApplicationsService } from './applications.service';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { StatusTransitionGuard } from '../common/guards/status-transition.guard';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { CreateApplicationDto } from './dto/create-application.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

type RequestWithUser = Request & { user: RequestUser };

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  createApplication(@Body() dto: CreateApplicationDto) {
    return this.applicationsService.createApplication(dto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, StatusTransitionGuard)
  async transitionStatus(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @Req() request: RequestWithUser,
  ) {
    return this.applicationsService.transitionStatus(id, dto, request.user);
  }

  @Get(':id/history')
  async getHistory(@Param('id') id: string) {
    return this.applicationsService.getHistory(id);
  }
}
