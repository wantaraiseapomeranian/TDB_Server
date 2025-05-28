import { Schedule } from 'src/schedule/entities/schedule.entity';
import { Machine } from 'src/machine/entities/machine.entity';
import { Entity, Column, PrimaryColumn, OneToMany } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryColumn({ type: 'varchar', unique: true })
  user_id: string;

  @Column({ type: 'varchar', nullable: true })
  m_uid?: string;

  @Column({ type: 'varchar', nullable: true })
  k_uid?: string;

  @Column({ type: 'varchar' })
  password: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'enum', enum: ['parent', 'child'] })
  role: 'parent' | 'child';

  @Column({ type: 'tinyint', default: false })
  took_today: boolean;

  @Column({ type: 'varchar', nullable: true })
  birthDate: string | null;

  @Column({ type: 'int', nullable: true })
  age: number | null;

  @Column({ type: 'varchar', nullable: true })
  refresh_token: string | null;

  @Column({ type: 'varchar', length: 8 })
  connect: string;

  @OneToMany(() => Schedule, (schedule) => schedule.user)
  schedules: Schedule[];

  @OneToMany(() => Machine, (machine) => machine.owner_user)
  machines: Machine[];
}
