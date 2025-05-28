import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DispenserService } from './machine.service';
import { AccessTokenGuard } from '../auth/guard/bearer-token.guard';

@Controller('machine')
@UseGuards(AccessTokenGuard)
export class MachineController {
  constructor(private readonly dispenserService: DispenserService) {}

  @Get('users')
  getAllUsers() {
    return this.dispenserService.findAllUsers();
  }

  @Get('medicine')
  getAllMedicine() {
    return this.dispenserService.findAllMedicine();
  }

  @Get('schedule')
  getAllSchedules() {
    return this.dispenserService.findAllSchedule();
  }

  @Get('list')
  getAllMachines() {
    return this.dispenserService.findAllMachine();
  }

  @Get('verify/:uid')
  verifyUid(@Param('uid') uid: string) {
    return this.dispenserService.verifyUid(uid);
  }

  @Get('today/:uid')
  getTodaySchedule(@Param('uid') uid: string) {
    return this.dispenserService.getTodayScheduleByUid(uid);
  }

  @Get('remain/:m_uid')
  getMedicineRemain(@Param('m_uid') m_uid: string) {
    return this.dispenserService.getMedicineRemainByMachine(m_uid);
  }

  @Get('users-by-machine/:m_uid')
  getUsersByMachine(@Param('m_uid') m_uid: string) {
    return this.dispenserService.getUsersByMachineId(m_uid);
  }

  @Get('schedule-by-date/:m_uid')
  getScheduleByDate(
    @Param('m_uid') m_uid: string,
    @Query('date') date: string,
  ) {
    return this.dispenserService.getSchedulesByMachineAndDate(m_uid, date);
  }
}
