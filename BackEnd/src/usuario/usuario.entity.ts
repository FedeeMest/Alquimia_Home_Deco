import { Entity, Property, PrimaryKey } from "@mikro-orm/core";

@Entity()
export class Usuario {
    @PrimaryKey()
    id!: number;

    @Property({ unique: true })
    username!: string;

    @Property()
    password!: string; // Aquí guardaremos la contraseña encriptada

    @Property()
    nombre_completo!: string;

    @Property({ onCreate: () => new Date() })
    fecha_creacion? = new Date();
}