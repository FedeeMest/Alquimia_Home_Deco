export interface Cliente {
    id: number;
    nombre: string;
    telefono?: string;
    email?: string;
    tipo: string;
    notas?: string;
    activo: boolean;
}