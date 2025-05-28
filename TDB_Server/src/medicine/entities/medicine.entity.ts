// src/medicine/entities/medicine.entity.ts

import { Schedule } from 'src/schedule/entities/schedule.entity';
import { Entity, Column, PrimaryColumn, OneToMany } from 'typeorm';

@Entity('medicine')
export class Medicine {
  @PrimaryColumn()
  medi_id: string;

  @PrimaryColumn()
  user_id: string;

  @Column()
  name: string;

  @Column({ type: 'tinyint', default: 0 })
  warning: boolean;

  @Column({ type: 'enum', enum: ['medicine', 'supplement'], default: 'medicine' })
  type: 'medicine' | 'supplement';

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', nullable: true })
  manufacturer?: string;

  @Column({ type: 'varchar', nullable: true })
  image_url?: string;

  @Column({ type: 'date', nullable: true })
  start_date?: Date;

  @Column({ type: 'date', nullable: true })
  end_date?: Date;

  @OneToMany(() => Schedule, (schedule) => schedule.medicine)
  schedules: Schedule[];
    machines: any;

  
}
