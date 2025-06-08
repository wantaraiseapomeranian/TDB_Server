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
import { AuthService } from 'src/auth/auth.service';
import { UsersService } from 'src/users/users.service';

// @UseGuards(AccessTokenGuard) // 임시로 주석처리 (대시보드 테스트용)
@Controller('family')
export class FamilyController {
  constructor(
    private readonly familyService: FamilyService,
    private readonly authService: AuthService, // 임시 추가
    private readonly usersService: UsersService,
  ) {
    // 임시 추가
  }

  /**
   * 사용자 ID를 통한 가족 구성원 목록 조회
   */
  @Get('members/:userId')
  async getMembers(@Param('userId') userId: string) {
    return this.familyService.getFamilyMembersByUserId(userId);
  }

  /**
   * connect ID를 통한 가족 구성원 목록 조회 (대시보드용)
   */
  @Get('members-by-connect/:connect')
  async getMembersByConnect(@Param('connect') connect: string) {
    return this.familyService.getFamilyMembersByConnect(connect);
  }

  /**
   * 자녀 구성원 추가
   */
  @Post('members')
  async addMember(
    @Body()
    data: {
      user_id: string;
      uid: string;
      name: string;
      birthDate: string;
      age: number;
      connect: string;
    },
  ) {
    return this.familyService.addFamilyMember(data);
  }

  /**
   * 자녀 구성원 정보 수정
   */
  @Put('members/:id')
  async updateMember(
    @Param('id') id: string,
    @Body()
    data: {
      name?: string;
      birthDate?: string;
      age?: number;
    },
  ) {
    return this.familyService.updateFamilyMember(id, data);
  }

  /**
   * 자녀 구성원 삭제
   */
  @Delete('members/:id')
  async deleteMember(@Param('id') id: string) {
    return this.familyService.deleteFamilyMember(id);
  }

  /**
   * 전체 가족 스케줄 요약 조회 (자녀 기준)
   */
  @Get('dashboard/family-summary')
  async getFamilyMedicineSummary() {
    return this.familyService.getFamilySummary();
  }
}
