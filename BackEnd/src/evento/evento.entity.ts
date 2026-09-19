import { Entity, ManyToOne, Property, PrimaryKey, Index } from "@mikro-orm/core";
import { Producto } from "../productos/producto.entity.js";

export type TipoEvento = 'vista' | 'carrito' | 'whatsapp';

@Entity()
export class EventoProducto {
    @PrimaryKey()
    id!: number;

    @ManyToOne(() => Producto)
    producto!: Producto;

    @Index()
    @Property()
    tipo!: string; // 'vista' | 'carrito' | 'whatsapp'

    @Index()
    @Property({ onCreate: () => new Date() })
    fecha = new Date();
}