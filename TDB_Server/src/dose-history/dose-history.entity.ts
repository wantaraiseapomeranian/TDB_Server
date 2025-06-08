import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/entities/users.entity';
import { Medicine } from '../medicine/entities/medicine.entity';
import { v4 as uuidv4 } from 'uuid';

export enum DoseStatus {
  COMPLETED = 'completed',
  MISSED = 'missed',
  PARTIAL = 'partial',
}

@Entity('dose_history')
export class DoseHistory {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  history_id: string = uuidv4();

  @Column({ type: 'varchar', length: 50 })
  connect: string;

  @Column({ type: 'varchar', length: 50 })
  user_id: string;

  @Column({ type: 'varchar', length: 50 })
  medi_id: string;

  @Column({
    type: 'enum',
    enum: ['morning', 'afternoon', 'evening'],
  })
  time_of_day: 'morning' | 'afternoon' | 'evening';

  @Column({ type: 'date' })
  dose_date: string; // YYYY-MM-DD 형식

  @Column({ type: 'int' })
  scheduled_dose: number; // 복용 예정량

  @Column({ type: 'int', default: 0 })
  actual_dose: number; // 실제 복용량

  @Column({
    type: 'enum',
    enum: ['completed', 'missed', 'partial'],
    default: 'missed',
  })
  status: DoseStatus;

  @CreateDateColumn({ type: 'datetime' })
  completed_at?: Date; // 복용 완료 시간

  @Column({ type: 'text', nullable: true })
  notes?: string; // 메모 (부작용, 특이사항 등)

  // 관계 설정
  @ManyToOne(() => User, (user) => user.doseHistories, { nullable: false })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'user_id' })
  user: User;

  @ManyToOne(() => Medicine, (medicine) => medicine.doseHistories, {
    nullable: false,
  })
  @JoinColumn([
    { name: 'medi_id', referencedColumnName: 'medi_id' },
    { name: 'connect', referencedColumnName: 'connect' }
  ])
  medicine: Medicine;
} 