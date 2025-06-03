import {
  Entity,
  Column,
  PrimaryColumn,
  OneToMany,
} from 'typeorm';
import { Machine } from 'src/machine/entities/machine.entity';
import { Schedule } from 'src/schedule/entities/schedule.entity';

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

  @Column({ type: 'tinyint', width: 1, default: 0 })
  took_today: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  birthDate: string;

  @Column({ type: 'int', nullable: true })
  age: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  refresh_token: string;

  // OneToMany: machine.owner → users.connect
  @OneToMany(() => Machine, (machine) => machine.owner_user)
  machines: Machine[];

  @OneToMany(() => Schedule, (schedule) => schedule.user)
  schedules: Schedule[];
}
