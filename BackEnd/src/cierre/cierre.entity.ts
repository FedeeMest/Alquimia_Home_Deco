import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class CierreCaja {
  @PrimaryKey()
  id!: number;

  @Property()
  fecha_cierre: Date = new Date();

  @Property()
  usuario_responsable!: string; // Quién hizo el cierre

  // --- LO QUE DICE EL SISTEMA (Teórico) ---
  @Property({ type: 'decimal', precision: 12, scale: 2 })
  sistema_efectivo!: number;

  @Property({ type: 'decimal', precision: 12, scale: 2 })
  sistema_tarjeta!: number;
  
  @Property({ type: 'decimal', precision: 12, scale: 2 })
  sistema_otros!: number; // Transferencias, etc.

  // --- LO QUE CUENTA EL CAJERO (Real) ---
  @Property({ type: 'decimal', precision: 12, scale: 2 })
  real_efectivo!: number; // El dinero que contaste billete por billete

  @Property({ type: 'decimal', precision: 12, scale: 2 })
  real_tarjeta!: number; // Suma de cupones (opcional)

  // --- RESULTADO ---
  @Property({ type: 'decimal', precision: 12, scale: 2 })
  diferencia!: number; // Si es negativo, falta plata. Si es positivo, sobra.

  @Property({ type: 'text', nullable: true })
  observaciones?: string;
}