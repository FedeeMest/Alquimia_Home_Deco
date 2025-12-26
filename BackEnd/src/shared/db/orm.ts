import { MikroORM } from "@mikro-orm/core";
import { MySqlDriver } from "@mikro-orm/mysql";
import { SqlHighlighter } from "@mikro-orm/sql-highlighter";
import * as dotenv from 'dotenv';

dotenv.config();

// 1. CORRECCIÓN IMPORTANTE: Convertimos a booleano (true/false)
const isProduction = process.env.NODE_ENV === 'production';

// Validación de seguridad (Muy bien implementada 👍)
if (!process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_HOST || !process.env.DB_PORT || !process.env.NODE_ENV)  {
    console.error('FATAL ERROR: Las variables de entorno de la base de datos no están todas configuradas.');
    process.exit(1);
}

export const orm = await MikroORM.init({
  entities: ['dist/**/*.entity.js'],
  entitiesTs: ['src/**/*.entity.ts'],
  
  dbName: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  
  driver: MySqlDriver,
  highlighter: new SqlHighlighter(),
  
  // 2. CORRECCIÓN AQUÍ: Usamos la negación (!). 
  // Si NO es producción, activamos debug.
  debug: !isProduction, 
  
  driverOptions: isProduction ? {
    connection: {
      ssl: { rejectUnauthorized: false }
    }
  } : undefined,

  schemaGenerator: {
    disableForeignKeys: true,
    createForeignKeyConstraints: true,
    ignoreSchema: [],
  },
});

export const syncSchema = async () => {
  try {
    const generator = orm.getSchemaGenerator();
    await generator.updateSchema({ safe: true }); 
    console.log('✅ Esquema de Base de Datos Sincronizado');
  } catch (error: any) {
    if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.message?.includes('already exists')) {
        console.warn('⚠️ La tabla ya existía, omitiendo creación. El servidor continuará iniciando.');
    } else {
        console.error('❌ Error menor sincronizando esquema (ignorando para iniciar):', error.message);
    }
  }
};