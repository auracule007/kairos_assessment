import { IsEmail } from 'class-validator';

export class CreateApplicationDto {
  @IsEmail()
  candidateEmail!: string;
}
