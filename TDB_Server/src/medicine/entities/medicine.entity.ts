import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from 'src/users/entities/users.entity';
import { Schedule } from 'src/schedule/entities/schedule.entity';

@Entity('medicine')
export class Medicine {
  // 복합 PK 구성
  @PrimaryColumn({ type: 'varchar', length: 50 })
  medi_id: string;

  @PrimaryColumn({ type: 'varchar', length: 50 })
  connect: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'tinyint', default: 0 })
  warning: boolean;

  @Column({ type: 'date', nullable: true })
  start_date?: Date;

  @Column({ type: 'date', nullable: true })
  end_date?: Date;

  // FK 관계 정의 (connect → users.connect)
  @ManyToOne(() => User, (user) => user.machines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'connect', referencedColumnName: 'connect' })
  user: User;

  @OneToMany(() => Schedule, (schedule) => schedule.medicine)
  schedules: Schedule[];
}
