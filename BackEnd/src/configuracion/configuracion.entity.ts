import { Entity, Property, PrimaryKey } from "@mikro-orm/core";

@Entity()
export class Configuracion {
    @PrimaryKey()
    id!: number;

    // Ya NO usamos valores por defecto fijos, los gestionará la base de datos
    @Property({ type: 'decimal', precision: 5, scale: 2 })
    porcentaje_efectivo!: number;

    @Property({ type: 'decimal', precision: 5, scale: 2 })
    porcentaje_tarjeta!: number;

    @Property({ type: 'decimal', precision: 5, scale: 2 })
    porcentaje_local!: number;
}