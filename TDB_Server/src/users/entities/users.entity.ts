import {
  Entity,
  Column,
  PrimaryColumn,
  OneToMany,
} from 'typeorm';
import { Machine } from 'src/machine/entities/machine.entity';
import { Schedule } from 'src/schedule/entities/schedule.entity';
import { Medicine } from 'src/medicine/entities/medicine.entity';
import { DoseHistory } from 'src/dose-history/dose-history.entity';

export enum UserRole {
  PARENT = 'parent',
  CHILD = 'child',
}

@Entity('users')
export class User {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  user_id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  connect: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  m_uid: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  k_uid: string | null;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  role: UserRole;

  @Column({ type: 'int', default: 0 })
  took_today: number;

  @Column({ type: 'date', nullable: true })
  birthDate?: string;

  @Column({ type: 'int', nullable: true })
  age: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  refresh_token: string;

  // OneToMany: machine.owner → users.connect
  @OneToMany(() => Machine, (machine) => machine.ownerUser)
  machines: Machine[];

  // OneToMany: machine.machine_id → users.m_uid (기기 소유자)
  @OneToMany(() => Machine, (machine) => machine.user)
  ownedMachines: Machine[];

  // OneToMany: medicine.connect → users.connect
  @OneToMany(() => Medicine, (medicine) => medicine.user)
  medicines: Medicine[];

  @OneToMany(() => Schedule, (schedule) => schedule.user)
  schedules: Schedule[];

  // OneToMany: schedule.connect → users.connect
  @OneToMany(() => Schedule, (schedule) => schedule.connectedUser)
  connectedSchedules: Schedule[];

  // OneToMany: dose_history.user_id → users.user_id
  @OneToMany(() => DoseHistory, (doseHistory) => doseHistory.user)
  doseHistories: DoseHistory[];
}
