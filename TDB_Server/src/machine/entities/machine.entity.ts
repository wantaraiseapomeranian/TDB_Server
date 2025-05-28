import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from 'src/users/entities/users.entity';
import { Medicine } from 'src/medicine/entities/medicine.entity';

@Entity('machine')
export class Machine {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  machine_id: string;

  @PrimaryColumn({ type: 'varchar', length: 50 })
  medi_id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  error_status: string;

  @Column({ type: 'datetime' })
  last_error_at: Date;

  @Column({ type: 'varchar', length: 50 })
  owner: string;

  @Column({ type: 'int' })
  total: number;

  @Column({ type: 'int' })
  remain: number;

  @Column({ type: 'tinyint', nullable: true })
  slot: number;

  // 🔗 연관 관계 설정
  @ManyToOne(() => User, (user) => user.machines)
  @JoinColumn({ name: 'owner' })
  owner_user: User;

  @ManyToOne(() => Medicine, (medicine) => medicine.machines)
  @JoinColumn({ name: 'medi_id' })
  medicine: Medicine;
}