import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupplementService } from './supplement.service';
import { AccessTokenGuard } from '../auth/guard/bearer-token.guard';

@UseGuards(AccessTokenGuard)
@Controller('supplement')
export class SupplementController {
  constructor(private readonly supplementService: SupplementService) {}

  /**
   * 1. connect 코드 기준 영양제 목록 조회
   */
  @Get('list')
  async getSupplementList(@Query('connect') connect: string) {
    return this.supplementService.getSupplementList(connect);
  }

  /**
   * 2. 영양제 등록
   */
  @Post()
  async saveSupplement(
    @Body()
    data: {
      connect: string;
      medi_id: string;
      name: string;
      warning?: boolean;
      start_date?: string;
      end_date?: string;
    },
  ) {
    return this.supplementService.saveSupplement(data);
  }

  /**
   * 3. 영양제 상세 조회 (복합키: connect + medi_id)
   */
  @Get(':connect/:id')
  async getSupplementDetail(
    @Param('connect') connect: string,
    @Param('id') medi_id: string,
  ) {
    return this.supplementService.getSupplementDetails(connect, medi_id);
  }

  /**
   * 4. 스케줄 저장 (Mock 처리)
   */
  @Post('schedule')
  async saveSchedule(): Promise<{ success: boolean; message: string }> {
    return this.supplementService.saveSupplementSchedule();
  }

  /**
   * 5. 영양제 경고 상태 조회 (재고 부족 여부)
   */
  @Get('inventory')
  async getInventory(@Query('connect') connect: string) {
    return this.supplementService.getSupplementInventory(connect);
  }

  /**
   * 6. 경고 상태 수동 업데이트
   */
  @Put('warning')
  async updateWarning(
    @Body() body: { connect: string; supplementId: string; warning: boolean },
  ) {
    return this.supplementService.updateWarning(body.connect, {
      supplementId: body.supplementId,
      warning: body.warning,
    });
  }

  /**
   * 7. 복용 완료 처리 → 경고 true로 전환
   */
  @Post('completion')
  async completeSupplement(
    @Body() body: { connect: string; supplementId: string },
  ) {
    return this.supplementService.completeSupplement(body.connect, {
      supplementId: body.supplementId,
    });
  }
}
