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
    return this.machineRepository.find();
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
    return await this.userRepository.findOne({ where: { k_uid: uid } });
  }

  async getTodayScheduleByUid(uid: string): Promise<any> {
    const user = await this.findUserByUid(uid);
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');

    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const weekday = days[new Date().getDay()];

    const schedules = await this.scheduleRepository.find({
      where: {
        user_id: user.user_id,
        day_of_week: weekday,
      },
      relations: ['medicine'],
    });

    const timeMap = {
      morning: [],
      afternoon: [],
      evening: [],
    };

    for (const sched of schedules) {
        if (sched.dose > 0 && Array.isArray(sched.time_of_day)) {
            for (const time of sched.time_of_day) {
                if (timeMap[time]) {
                    timeMap[time].push({
                        medi_id: sched.medi_id,
                        dose: sched.dose,
                    });
                }
            }
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
      relations: ['medicine'],
    });

    return machineRows.map((row) => ({
      medi_id: row.medi_id,
      name: row.medicine?.name ?? '(이름 없음)',
      total: row.total,
      remain: row.remain,
      slot: row.slot,
    }));
  }

  async getUsersByMachineId(m_uid: string) {
    const machines = await this.machineRepository.find({
      where: { machine_id: m_uid },
      relations: ['owner_user'],
    });

    const userMap = new Map();

    machines.forEach((m) => {
      const u = m.owner_user;
      if (u) {
        userMap.set(u.user_id, {
          user_id: u.user_id,
          name: u.name,
          role: u.role,
        });
      }
    });

    return [...userMap.values()];
  }

  async getSchedulesByMachineAndDate(m_uid: string, date: string) {
    const dayOfWeek = new Date(date)
      .toLocaleString('en-US', { weekday: 'short' })
      .toLowerCase();

    const machineRows = await this.machineRepository.find({
      where: { machine_id: m_uid },
      relations: ['owner_user'],
    });

    const userIds = machineRows
      .map((m) => m.owner_user?.user_id)
      .filter(Boolean);

    if (userIds.length === 0) {
      return [];
    }

    const schedules = await this.scheduleRepository.find({
      where: {
        user_id: In(userIds),
        day_of_week: dayOfWeek,
      },
      relations: ['user', 'medicine'],
    });

    return schedules
      .filter((s) => s.user && s.medicine)
      .map((s) => ({
        user_name: s.user.name,
        medicine_name: s.medicine.name,
        time_of_day: s.time_of_day,
      }));
  }
}