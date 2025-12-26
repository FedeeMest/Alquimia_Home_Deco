import { orm } from './orm.js';
import { Usuario } from '../../usuario/usuario.entity.js';
import bcrypt from 'bcryptjs';

export async function initSemillas() {
    const em = orm.em.fork();

    try {
        const countUsuarios = await em.count(Usuario);

        if (countUsuarios === 0) {
            console.log('🌱 Sembrando base de datos: Creando usuario Admin...');

            // 🔒 SEGURIDAD: Validación estricta
            // Si no hay contraseña configurada en el .env, lanzamos error y no creamos nada.
            if (!process.env.ADMIN_DEFAULT_PASSWORD) {
                throw new Error('❌ ERROR CRÍTICO: No se puede crear el admin. Falta la variable ADMIN_DEFAULT_PASSWORD en el .env');
            }

            const admin = new Usuario();
            admin.username = 'admin';
            admin.nombre_completo = 'Administrador Sistema';

            // Usamos la variable directamente, es seguro porque validamos arriba
            admin.password = await bcrypt.hash(process.env.ADMIN_DEFAULT_PASSWORD, 10); 

            await em.persistAndFlush(admin);
            console.log(`✅ Admin creado exitosamente.`);
        }
    } catch (error) {
        console.error('Error en semillas:', error);
    }
}