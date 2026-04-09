import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import { RequestContext } from '@mikro-orm/core';
import { orm, syncSchema } from './shared/db/orm.js';
import { productoRouter } from './productos/producto.routes.js';
import { ventaRouter } from './ventas/venta.routes.js';
import { configuracionRouter } from './configuracion/configuracion.routes.js';
import { cierreRouter } from './cierre/cierre.routes.js';
import { authRouter } from './auth/auth.routes.js';
import { usuarioRouter } from './usuario/usuario.routes.js'; // <--- AGREGADO: Faltaba importar esto
import { initSemillas } from './shared/db/seeds.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { clienteRouter } from './cliente/cliente.routes.js';

const app = express();
app.set('trust proxy', 1);
// 1. SEGURIDAD: Helmet primero (Cabeceras HTTP)
app.use(helmet());

// 2. SEGURIDAD: CORS (Antes del Rate Limit para permitir preflight requests)
const allowedOrigins = [
    'https://alquimia-home-deco.vercel.app', // TU DOMINIO REAL DE FRONTEND
    'http://localhost:4200' // Para que tú puedas seguir trabajando local
];

app.use(cors({
    origin: (origin, callback) => {
        // !origin permite peticiones sin origen (como Postman o Apps móviles), eso está bien.
        if (!origin || allowedOrigins.includes(origin)) { 
            callback(null, true);
        } else {
            callback(new Error('Bloqueado por CORS: Tu origen no está autorizado'));
        }
    },
    credentials: true
}));

// 3. SEGURIDAD: Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 300, // Límite de 100 peticiones por IP
    standardHeaders: true, 
    legacyHeaders: false,
    message: { message: 'Demasiadas peticiones, intenta más tarde.' } // JSON mejor que texto plano
});
app.use(limiter);

// 4. PARSEO DE BODY (Después de seguridad, antes de rutas)
app.use(express.json()); 

// 5. MIKROORM CONTEXT
app.use((req, res, next) => {
    RequestContext.create(orm.em, next);
});

// --- RUTAS ---
app.use('/api/auth', authRouter); // Pública (Login)
app.use('/api/productos', productoRouter); // Ya incluye authMiddleware dentro de producto.routes.ts para permitir catálogo público
app.use('/api/usuarios', usuarioRouter); // Rutas de usuario protegidas por authMiddleware dentro de usuario.routes.ts
app.use('/api/ventas', ventaRouter); // Rutas de ventas protegidas por authMiddleware dentro de venta.routes.ts
app.use('/api/configuracion',configuracionRouter); // Rutas de configuración protegidas por authMiddleware dentro de configuracion.routes.ts
app.use('/api/cierre_caja',cierreRouter); // Rutas de cierre de caja protegidas por authMiddleware dentro de cierre.routes.ts
app.use('/api/clientes', clienteRouter);

// Ruta Base (Health Check)
app.get('/', (req, res) => {
    res.send('Backend Alquimia Sys Funcionando 🚀');
});

// Manejo de Error 404
app.use((_, res) => {
    return res.status(404).json({ message: 'Ruta no encontrada' });
});

// Inicialización del Servidor
async function startServer() {
    try {
        await syncSchema();
        await initSemillas();
        console.log('✅ Base de datos sincronizada y semillas cargadas');

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Error al iniciar el servidor:', error);
    }
}

startServer();