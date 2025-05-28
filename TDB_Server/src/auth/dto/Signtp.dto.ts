import { IsString, IsEnum, IsOptional, IsDateString, IsNumber } from 'class-validator';

export class SignupDto {
  @IsString() id: string;
  @IsString() password: string;
  @IsString() name: string;
  @IsDateString() birthDate: string;
  @IsNumber() age: number;
  @IsEnum(['main', 'sub']) accountType: 'parent' | 'child';
  @IsOptional() @IsString() uuid?: string;
  @IsOptional() @IsString() parentUuid?: string;
}
