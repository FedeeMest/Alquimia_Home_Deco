import { Router } from 'express';
import { findAll, findOne, add, update, remove, inputS, restaurar, fixPrecios, actualizarGananciasMasivo, vaciarCamion, ventaFeria, updateStockRapido,findByBarcode, getPublicCatalog } from './producto.controller.js';
import { authMiddleware } from '../shared/middleware/auth.middleware.js';
import multer from 'multer';
import cloudinary from '../shared/config/cloudinary.js';

export const productoRouter = Router();


productoRouter.get('/public/catalogo', getPublicCatalog);

productoRouter.use(authMiddleware);

const upload = multer({ dest: 'uploads/' });
productoRouter.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se recibió ninguna imagen' });
    }
    
    // Subimos la imagen a Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'alquimia_productos',
    });

    // Devolvemos la URL generada
    return res.status(200).json({ url: result.secure_url });
  } catch (error) {
    console.error('Error Cloudinary:', error);
    return res.status(500).json({ message: 'Error interno al subir a Cloudinary' });
  }
});

productoRouter.get('/', findAll);           // Obtener todos (con paginación)
productoRouter.post('/vaciar-camion', vaciarCamion);
productoRouter.post('/venta-feria', ventaFeria);
productoRouter.patch('/:id/stock', updateStockRapido);
productoRouter.get('/:id', findOne);        // Obtener uno
productoRouter.get('/codigo/:codigo', findByBarcode); // Obtener por código de barra
productoRouter.post('/', inputS, add); 
productoRouter.put('/actualizar-ganancias-masivo', actualizarGananciasMasivo);     // Crear (Pasa por sanitización)
productoRouter.put('/:id', inputS, update); // Editar (Pasa por sanitización)
productoRouter.delete('/:id', remove);      // Borrar
productoRouter.patch('/:id/restaurar', restaurar);        // Restaurar producto eliminado
productoRouter.post('/fix-precios', fixPrecios);
