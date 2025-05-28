import {
  Controller, Get, Post, Put, Body, Param
} from '@nestjs/common';
import { SupplementService } from './supplement.service';

@Controller('supplement')
export class SupplementController {
  constructor(private readonly supplementService: SupplementService) {}

  @Get('list/:memberId')
  getList(@Param('memberId') memberId: string) {
    return this.supplementService.getSupplementList(memberId);
  }

  @Post()
  saveSupplement(@Body() data: any) {
    return this.supplementService.saveSupplement(data);
  }

  @Get(':id')
  getDetail(@Param('id') supplementId: string) {
    return this.supplementService.getSupplementDetails(supplementId);
  }

  @Post('schedule/:memberId')
  saveSchedule(@Param('memberId') memberId: string, @Body() schedule: any) {
    return this.supplementService.saveSupplementSchedule(memberId, schedule);
  }

  @Get('inventory/:memberId')
  getInventory(@Param('memberId') memberId: string) {
    return this.supplementService.getSupplementInventory(memberId);
  }

  @Put('quantity/:memberId')
  updateQuantity(
    @Param('memberId') memberId: string,
    @Body() data: { supplementId: string; quantity: number },
  ) {
    return this.supplementService.updateQuantity(memberId, data);
  }

  @Post('completion/:memberId')
  completeIntake(
    @Param('memberId') memberId: string,
    @Body() data: { supplementId: string },
  ) {
    return this.supplementService.completeSupplement(memberId, data);
  }
}
