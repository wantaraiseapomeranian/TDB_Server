import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { MedicineService } from './medicine.service';
import { AccessTokenGuard } from '../auth/guard/bearer-token.guard';

@Controller('medicine')
@UseGuards(AccessTokenGuard)
export class MedicineController {
  constructor(private readonly medicineService: MedicineService) {}

  // 약 목록 조회
  @Get('list/:memberId')
  async getMedicineList(@Param('memberId') memberId: string) {
    return this.medicineService.getMedicineListByMember(memberId);
  }

  // 약 정보 저장
  @Post(':memberId')
  async addMedicine(
    @Param('memberId') memberId: string,
    @Body() medicineDto: any,
  ) {
    return this.medicineService.addMedicine(memberId, medicineDto);
  }

  // 약 정보 수정
  @Put(':memberId/:medicineId')
  async updateMedicine(
    @Param('memberId') memberId: string,
    @Param('medicineId') medicineId: string,
    @Body() medicineDto: any,
  ) {
    return this.medicineService.updateMedicine(memberId, medicineId, medicineDto);
  }

  // 약 정보 삭제
  @Delete(':memberId/:medicineId')
  async deleteMedicine(
    @Param('memberId') memberId: string,
    @Param('medicineId') medicineId: string,
  ) {
    return this.medicineService.deleteMedicine(memberId, medicineId);
  }
}
