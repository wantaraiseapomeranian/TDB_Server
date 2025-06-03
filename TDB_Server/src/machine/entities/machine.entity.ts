import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from 'src/users/entities/users.entity';
import { Medicine } from 'src/medicine/entities/medicine.entity';

@Entity('machine')
export class Machine {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  machine_id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  medi_id: string | null;

  @Column({ type: 'varchar', length: 50 })
  owner: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  error_status: string;

  @Column({ type: 'datetime' })
  last_error_at: Date;

  @Column({ type: 'int' })
  total: number;

  @Column({ type: 'int' })
  remain: number;

  @Column({ type: 'tinyint', nullable: true })
  slot: number;

  // owner → users.connect
  @ManyToOne(() => User, (user) => user.machines)
  @JoinColumn({ name: 'owner', referencedColumnName: 'connect' })
  owner_user: User;

  // medi_id → medicine.medi_id (nullable)
  @ManyToOne(() => Medicine, { nullable: true })
  @JoinColumn({ name: 'medi_id', referencedColumnName: 'medi_id' })
  medicine: Medicine | null;
}
