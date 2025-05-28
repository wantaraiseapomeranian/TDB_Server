import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  ManyToMany,
} from 'typeorm';
import { User } from 'src/users/entities/users.entity';
import { Medicine } from 'src/medicine/entities/medicine.entity';

@Entity('schedule')
export class Schedule {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  schedule_id: string;

  @Column({ type: 'varchar', length: 50 })
  user_id: string;

  @Column({ type: 'varchar', length: 50 })
  medi_id: string;

  @Column({
    type: 'set',
    enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  })
  day_of_week: string[];

  @Column({
    type: 'set',
    enum: ['morning', 'afternoon', 'evening'],
    nullable: true,
  })
  time_of_day: string[];

  @Column({ type: 'int' })
  dose: number;

  @ManyToOne(() => User, (user) => user.schedules)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Medicine, (medicine) => medicine.schedules)
  @JoinColumn({ name: 'medi_id' })
  medicine: Medicine;
}
