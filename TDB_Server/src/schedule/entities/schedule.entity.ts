import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from 'src/users/entities/users.entity';
import { Medicine } from 'src/medicine/entities/medicine.entity';

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

@Entity('schedule')
export class Schedule {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  schedule_id: string;

  @Column({ type: 'varchar', length: 50 })
  connect: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  user_id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  medi_id: string;

  @Column({
    type: 'enum',
    enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  })
  day_of_week: DayOfWeek;

  @Column({
    type: 'enum',
    enum: ['morning', 'afternoon', 'evening'],
    nullable: true,
  })
  time_of_day: TimeOfDay;

  @Column({ type: 'int' })
  dose: number;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  // 연결된 사용자
  @ManyToOne(() => User, (user) => user.schedules, { nullable: true })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'user_id' })
  user: User;

  // connect → users.connect
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'connect', referencedColumnName: 'connect' })
  connectedUser: User;

  // Medicine 관계 (medi_id 기준 단일 FK 연결만 우선 처리)
  @ManyToOne(() => Medicine, (medicine) => medicine.schedules, {
    nullable: true,
  })
  @JoinColumn({ name: 'medi_id', referencedColumnName: 'medi_id' })
  medicine: Medicine;
}
