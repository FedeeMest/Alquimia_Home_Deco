import { Entity, Property, PrimaryKey, OneToMany, Collection } from "@mikro-orm/core";
import { Venta } from "../ventas/venta.entity.js";

@Entity()
export class Cliente {
    @PrimaryKey()
    id!: number;

    @Property({ nullable: false })
    nombre!: string;

    @Property({ nullable: true })
    telefono?: string;

    @Property({ nullable: true })
    email?: string;

    @Property({ default: 'Feria' }) // 'Feria', 'Minorista', 'Mayorista'
    tipo!: string;

    @Property({ type: 'text', nullable: true })
    notas?: string;

    @Property({ default: true })
    activo: boolean = true;

    @Property({ onCreate: () => new Date() })
    fecha_creacion = new Date();

    @Property({ onUpdate: () => new Date() })
    fecha_actualizacion = new Date();

    // Relación inversa: Un cliente puede tener muchas ventas
    @OneToMany(() => Venta, venta => venta.cliente)
    ventas = new Collection<Venta>(this);
}