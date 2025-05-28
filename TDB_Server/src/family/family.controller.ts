import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FamilyService } from './family.service';
import { AccessTokenGuard } from '../auth/guard/bearer-token.guard';

@Controller('family')
@UseGuards(AccessTokenGuard)
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @Get('members')
  async getMembers(@Query('uuid') uuid: string) {
    return this.familyService.getFamilyMembersByUuid(uuid);
  }

  @Post('members')
  async addMember(@Body() data: any) {
    return this.familyService.addFamilyMember(data);
  }

  @Put('members/:id')
  async updateMember(
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.familyService.updateFamilyMember(id, data);
  }

  @Delete('members/:id')
  async deleteMember(@Param('id') id: string) {
    return this.familyService.deleteFamilyMember(id);
  }

  @Get('/dashboard/family-summary')
  async getFamilyMedicineSummary() {
    return this.familyService.getFamilySummary();
  }
}