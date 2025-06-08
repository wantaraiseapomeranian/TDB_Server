import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from 'src/users/entities/users.entity';
import { Medicine } from 'src/medicine/entities/medicine.entity';

@Entity('machine')
export class Machine {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  machine_id: string;

  @PrimaryColumn({ type: 'varchar', length: 50 })
  medi_id: string;

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

  @Column({ type: 'tinyint', default: 3 })
  max_slot: number;

  // 관계 정의 (fk_machine_user_muid: machine_id → users.m_uid)
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'machine_id', referencedColumnName: 'm_uid' })
  user: User;

  // 관계 정의 (fk_machine_owner: owner → users.connect)
  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner', referencedColumnName: 'connect' })
  ownerUser: User;

  // 관계 정의 (fk_machine_medi: medi_id → medicine.medi_id) 
  // Note: 실제 DB에서는 단일 FK (medi_id만 참조)
  @ManyToOne(() => Medicine)
  @JoinColumn({ name: 'medi_id', referencedColumnName: 'medi_id' })
  medicine: Medicine;
}
