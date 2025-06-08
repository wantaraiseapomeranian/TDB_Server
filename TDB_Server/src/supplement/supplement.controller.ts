import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Delete,
  BadRequestException,
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
  @Post(':memberId')
  async saveSupplement(
    @Param('memberId') memberId: string,
    @Body()
    data: {
      name: string;
      manufacturer?: string;
      ingredients?: string;
      primaryFunction?: string;
      intakeMethod?: string;
      precautions?: string;
      startDate?: string;
      endDate?: string;
      memberName?: string;
      memberType?: string;
      target_users?: string[] | null;
    },
  ) {
    console.log('🔥 [Supplement Controller] 파라미터 체크:', { memberId, bodyData: Object.keys(data) });
    
    if (!memberId || memberId === 'undefined') {
      throw new BadRequestException('유효하지 않은 memberId입니다.');
    }
    // memberId를 데이터에 추가하고 필드명 매핑
    const supplementData = {
      name: data.name,
      manufacturer: data.manufacturer,
      ingredients: data.ingredients,
      primaryFunction: data.primaryFunction,
      intakeMethod: data.intakeMethod,
      precautions: data.precautions,
      memberName: data.memberName,
      memberType: data.memberType,
      target_users: data.target_users,
      connect: memberId, // connect 필드에 memberId 사용
      medi_id: `supplement_${Date.now()}`, // 고유 ID 생성
      start_date: data.startDate, // startDate -> start_date 매핑
      end_date: data.endDate, // endDate -> end_date 매핑
    };
    
    return this.supplementService.saveSupplement(supplementData);
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

  /**
   * 2-1. 영양제 수정
   */
  @Put(':memberId/:supplementId')
  async updateSupplement(
    @Param('memberId') memberId: string,
    @Param('supplementId') supplementId: string,
    @Body()
    data: {
      name: string;
      manufacturer?: string;
      ingredients?: string;
      primaryFunction?: string;
      intakeMethod?: string;
      precautions?: string;
      startDate?: string;
      endDate?: string;
      memberName?: string;
      memberType?: string;
      target_users?: string[] | null;
    },
  ) {
    // 영양제 수정 데이터 매핑
    const supplementData = {
      name: data.name,
      manufacturer: data.manufacturer,
      ingredients: data.ingredients,
      primaryFunction: data.primaryFunction,
      intakeMethod: data.intakeMethod,
      precautions: data.precautions,
      memberName: data.memberName,
      memberType: data.memberType,
      target_users: data.target_users,
      connect: memberId,
      medi_id: supplementId,
      start_date: data.startDate,
      end_date: data.endDate,
    };
    
    return this.supplementService.saveSupplement(supplementData);
  }

  /**
   * 2-2. 영양제 삭제
   */
  @Delete(':memberId/:supplementId')
  async deleteSupplement(
    @Param('memberId') memberId: string,
    @Param('supplementId') supplementId: string,
  ) {
    // 간단한 삭제 로직 - completeSupplement 재사용 또는 직접 삭제
    return this.supplementService.completeSupplement(memberId, {
      supplementId: supplementId,
    });
  }
}
