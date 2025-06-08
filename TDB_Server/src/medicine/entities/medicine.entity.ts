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
import { Machine } from 'src/machine/entities/machine.entity';
import { DoseHistory } from 'src/dose-history/dose-history.entity';

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

  // 새로 추가: 복용 대상 사용자 목록
  @Column({ 
    type: 'json', 
    nullable: true,
    comment: '복용 대상 ["user1","user2"] 또는 NULL(전체)' 
  })
  target_users?: string[] | null;

  // FK 관계 정의 (connect → users.connect)
  @ManyToOne(() => User, (user) => user.medicines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'connect', referencedColumnName: 'connect' })
  user: User;

  @OneToMany(() => Schedule, (schedule) => schedule.medicine)
  schedules: Schedule[];

  @OneToMany(() => Machine, (machine) => machine.medicine)
  machines: Machine[];

  @OneToMany(() => DoseHistory, (doseHistory) => doseHistory.medicine)
  doseHistories: DoseHistory[];
}
