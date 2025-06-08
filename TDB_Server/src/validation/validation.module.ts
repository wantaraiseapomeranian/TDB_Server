import { Module } from '@nestjs/common';
import { AgeValidationService } from './age-validation.service';

@Module({
  providers: [AgeValidationService],
  exports: [AgeValidationService],
})
export class ValidationModule {} 