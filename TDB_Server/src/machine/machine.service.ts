import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/users.entity';
import { Schedule } from '../schedule/entities/schedule.entity';
import { Medicine } from '../medicine/entities/medicine.entity';
import { Machine } from './entities/machine.entity';

@Injectable()
export class DispenserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(Schedule)
    private scheduleRepository: Repository<Schedule>,

    @InjectRepository(Medicine)
    private medicineRepository: Repository<Medicine>,

    @InjectRepository(Machine)
    private machineRepository: Repository<Machine>,
  ) {}

  async findAllUsers(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findAllMedicine(): Promise<Medicine[]> {
    return this.medicineRepository.find();
  }

  async findAllSchedule(): Promise<Schedule[]> {
    return this.scheduleRepository.find();
  }

  async findAllMachine(): Promise<Machine[]> {
    return this.machineRepository.find({
      relations: ['ownerUser'],
    });
  }

  async verifyUid(
    uid: string,
  ): Promise<
    | { confirmed: true; type: 'kit'; user: User }
    | { confirmed: true; type: 'machine'; m_uid: string }
    | { confirmed: false; type: 'unknown'; uid: string; qr_data: string }
  > {
    try {
      const user = await this.userRepository.findOne({ where: { k_uid: uid } });
      if (user) {
        return { confirmed: true, type: 'kit', user };
      }

      const machine = await this.machineRepository.findOne({
        where: { machine_id: uid },
      });
      if (machine) {
        return { confirmed: true, type: 'machine', m_uid: machine.machine_id };
      }

      const qr_data = JSON.stringify({
        type: 'link',
        uid_type: 'kit',
        k_uid: uid,
        createdAt: new Date().toISOString(),
      });

      return { confirmed: false, type: 'unknown', uid, qr_data };
    } catch (err) {
      console.error('verifyUid error:', err);
      throw new InternalServerErrorException('UID 검증 중 오류 발생');
    }
  }

  async findUserByUid(uid: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { k_uid: uid } });
  }

  async getTodayScheduleByUid(uid: string) {
    const user = await this.findUserByUid(uid);
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');

    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const weekday = days[new Date().getDay()];

    const schedules = await this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.medicine', 'medicine')
      .where('schedule.connect = :connect', { connect: user.connect })
      .andWhere('FIND_IN_SET(:day, schedule.day_of_week)', { day: weekday })
      .getMany();

    const timeMap: Record<
      'morning' | 'afternoon' | 'evening',
      { medi_id: string; dose: number }[]
    > = {
      morning: [],
      afternoon: [],
      evening: [],
    };

    for (const sched of schedules) {
      if (sched.time_of_day && sched.dose > 0) {
        timeMap[sched.time_of_day]?.push({
          medi_id: sched.medi_id,
          dose: sched.dose,
        });
      }
    }

    return {
      status: 'ok',
      weekday,
      schedule: timeMap,
    };
  }

  async getMedicineRemainByMachine(m_uid: string) {
    const machineRows = await this.machineRepository.find({
      where: { machine_id: m_uid },
    });

    const medicineIds = machineRows
      .map((row) => row.medi_id)
      .filter((id): id is string => id !== null && !id.startsWith('TEMP_'));
    
    const medicines = await this.medicineRepository.findBy({
      medi_id: In(medicineIds),
    });

    const medicineMap = new Map(medicines.map((m) => [m.medi_id, m]));

    return machineRows.map((row) => ({
      medi_id: row.medi_id,
      name: row.medi_id && !row.medi_id.startsWith('TEMP_') 
        ? medicineMap.get(row.medi_id)?.name ?? '(이름 없음)' 
        : '(약 미등록)',
      total: row.total,
      remain: row.remain,
      slot: row.slot,
    }));
  }

  async getUsersByMachineId(m_uid: string) {
    const machines = await this.machineRepository.find({
      where: { machine_id: m_uid },
      relations: ['ownerUser'],
    });

    const userMap = new Map<
      string,
      { user_id: string; name: string; role: string }
    >();

    for (const m of machines) {
      const user = m.ownerUser;
      if (user) {
        userMap.set(user.user_id, {
          user_id: user.user_id,
          name: user.name,
          role: user.role,
        });
      }
    }

    return Array.from(userMap.values());
  }

  async getSchedulesByMachineAndDate(m_uid: string, date: string) {
    const dayOfWeek = new Date(date)
      .toLocaleString('en-US', { weekday: 'short' })
      .toLowerCase();

    const machineRows = await this.machineRepository.find({
      where: { machine_id: m_uid },
      relations: ['ownerUser'],
    });

    const connects = machineRows
      .map((m) => m.ownerUser?.connect)
      .filter((c): c is string => !!c);

    if (connects.length === 0) {
      return [];
    }

    const schedules = await this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.user', 'user')
      .leftJoinAndSelect('schedule.medicine', 'medicine')
      .where('schedule.connect IN (:...connects)', { connects })
      .andWhere('FIND_IN_SET(:day, schedule.day_of_week)', { day: dayOfWeek })
      .getMany();

    return schedules.map((s) => ({
      user_id: s.user?.user_id,
      user_name: s.user?.name,
      medi_id: s.medi_id,
      medicine_name: s.medicine?.name,
        time_of_day: s.time_of_day,
      dose: s.dose,
      }));
  }

  // 🔥 connect 기반 가족 기기 상태 조회
  async getMachineStatusByConnect(connect: string) {
    try {
      // 해당 connect의 가족 구성원들 조회
      const familyMembers = await this.userRepository.find({
        where: { connect },
        select: ['user_id', 'name', 'role', 'm_uid']
      });

      if (!familyMembers.length) {
        return {
          connectedDevices: 0,
          totalDevices: 0,
          machineStatus: [],
          lastUpdated: new Date().toISOString()
        };
      }

      // 가족이 사용하는 모든 기기 ID 수집
      const machineIds = [...new Set(
        familyMembers
          .map(member => member.m_uid)
          .filter((m_uid): m_uid is string => !!m_uid)
      )];

      if (!machineIds.length) {
        return {
          connectedDevices: 0,
          totalDevices: 0,
          machineStatus: [],
          lastUpdated: new Date().toISOString()
        };
      }

      // 각 기기의 상세 정보 조회
      const machineStatusPromises = machineIds.map(async (m_uid) => {
        // 기기의 약물 잔여량 정보
        const medicineRemain = await this.getMedicineRemainByMachine(m_uid);
        
        // 기기 기본 정보
        const machineInfo = await this.machineRepository.findOne({
          where: { machine_id: m_uid },
          relations: ['ownerUser']
        });

        // 해당 기기를 사용하는 가족 구성원들
        const machineUsers = familyMembers.filter(member => member.m_uid === m_uid);

        // 전체 약물 슬롯 수와 활성 슬롯 수 계산
        const totalSlots = medicineRemain.length;
        const activeSlots = medicineRemain.filter(slot => 
          slot.medi_id && !slot.medi_id.startsWith('TEMP_') && slot.remain > 0
        ).length;
        const lowStockSlots = medicineRemain.filter(slot => 
          slot.remain > 0 && slot.remain < 5
        ).length;

        return {
          machine_id: m_uid,
          isConnected: true, // 기본적으로 연결된 것으로 가정
          totalSlots,
          activeSlots,
          lowStockSlots,
          users: machineUsers.map(user => ({
            user_id: user.user_id,
            name: user.name,
            role: user.role
          })),
          medicineSlots: medicineRemain.map(slot => ({
            slot: slot.slot,
            medicine_name: slot.name,
            total: slot.total,
            remain: slot.remain,
            isLowStock: slot.remain > 0 && slot.remain < 5
          }))
        };
      });

      const machineStatus = await Promise.all(machineStatusPromises);
      
      // 연결된 기기 수 계산
      const connectedDevices = machineStatus.filter(machine => machine.isConnected).length;

      return {
        connectedDevices,
        totalDevices: machineIds.length,
        machineStatus,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error('기기 상태 조회 오류:', error);
      return {
        connectedDevices: 0,
        totalDevices: 0,
        machineStatus: [],
        lastUpdated: new Date().toISOString()
      };
    }
  }
}
