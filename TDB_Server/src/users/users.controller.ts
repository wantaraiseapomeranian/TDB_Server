import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 전체 유저 조회
  @Get()
  async getAllUsers() {
    const users = await this.usersService.getAllUsers();
    return { success: true, data: users };
  }

  // user_id로 유저 조회
  @Get(':id')
  async getUserById(@Param('id') id: string) {
    const user = await this.usersService.getUserById(id);
    return { success: true, data: user };
  }

  // k_uid로 유저 조회
  @Get('/kit/:k_uid')
  async getUserByKitUid(@Param('k_uid') k_uid: string) {
    const user = await this.usersService.getUserByKitUid(k_uid);
    return { success: true, data: user };
  }

  // m_uid로 유저 조회
  @Get('/machine/:m_uid')
  async getUserByMachineUid(@Param('m_uid') m_uid: string) {
    const user = await this.usersService.getUserByMachineUid(m_uid);
    return { success: true, data: user };
  }

  // 부모 user_id 기준 자녀 목록 조회
  @Get('/children/:parent_id')
  async getChildrenOfParent(@Param('parent_id') parent_id: string) {
    const children = await this.usersService.getChildrenOfParent(parent_id);
    return { success: true, data: children };
  }

  // 🔥 디스펜서 등록 API (max_slot 기본 3개 고정)
  @Post('register-dispenser')
  async registerDispenser(@Body() body: { userId: string; m_uid: string }) {
    console.log(`[Controller] 디스펜서 등록 요청: userId=${body.userId}, m_uid=${body.m_uid}, max_slot=3 (고정)`);
    
    const result = await this.usersService.registerDispenser(body.userId, body.m_uid);
    return { success: true, data: result };
  }

  // 🔥 가족 구성원 m_uid 동기화 API (기존 데이터 수정용)
  @Post('sync-family-muid')
  async syncFamilyMuid(@Body() body: { connect: string }) {
    console.log(`[Controller] 가족 m_uid 동기화 요청: connect=${body.connect}`);
    
    const result = await this.usersService.syncFamilyMuid(body.connect);
    return { 
      success: true, 
      data: result,
      message: `${result.updatedCount}명의 사용자 m_uid가 동기화되었습니다.`
    };
  }

  // 🔥 데일리 키트 등록 API
  @Post('register-daily-kit')
  async registerDailyKit(@Body() body: { userId: string; k_uid: string }) {
    const result = await this.usersService.registerDailyKit(body.userId, body.k_uid);
    return { success: true, data: result };
  }

  // 🔥 디스펜서 정보 조회 API
  @Get(':userId/dispenser-info')
  async getDispenserInfo(@Param('userId') userId: string) {
    console.log(`[Controller] 디스펜서 정보 조회 요청: userId=${userId}`);
    
    const result = await this.usersService.getDispenserInfo(userId);
    return { success: true, data: result };
  }
}
