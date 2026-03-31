import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Producto } from '../Interfaces/producto.interface';
import { environment } from '../../environments/environment.prod';

export interface ProductoResponse {
  data: Producto[];
  total: number;
  page: number;
  totalPages: number;
  
}
const CLAVE_OFFLINE = 'alquimia_productos_offline';

@Injectable({ providedIn: 'root' })
export class ProductoService {
  private http = inject(HttpClient);
  // Usamos la URL del entorno + la ruta específica
  private apiUrl = `${environment.apiUrl}/productos`; 
  

  constructor() { }

getPublicCatalog() {
    // Apunta al nuevo endpoint que creamos, el cual NO requiere token
    return this.http.get<{data: any[]}>(`${this.apiUrl}/public/catalogo`);
  }

getAll(buscar: string = '', activo: boolean = true, page: number = 1, limit: number = 10): Observable<ProductoResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString())
      .set('activo', activo.toString());

    if (buscar) params = params.set('buscar', buscar);

    return this.http.get<ProductoResponse>(this.apiUrl, { params });
  }

getOne(id: number): Observable<Producto> {
    return this.http.get<Producto>(`${this.apiUrl}/${id}`);
  }

create(producto: Producto): Observable<Producto> {
    return this.http.post<Producto>(this.apiUrl, producto);
  }

update(id: number, producto: Partial<Producto>): Observable<Producto> {
    return this.http.put<Producto>(`${this.apiUrl}/${id}`, producto);
  }

delete(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

restaurar(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/restaurar`, {});
  }

fixPrecios() {
    return this.http.post(`${this.apiUrl}/fix-precios`, {});
  }

updateGananciaMasiva(nuevaGanancia: number): Observable<any> {
  return this.http.put(`${this.apiUrl}/actualizar-ganancias-masivo`, { nueva_ganancia: nuevaGanancia });
}

sincronizarDatosOffline(): Observable<boolean> {
    return this.getAll('', true, 1, 5000).pipe(
      map(response => {
        try {
          // Mapeamos usando las propiedades REALES de tu interfaz
          const datosMinimos = response.data.map(p => ({
            id: p.id,
            nombre: p.nombre,
            // CORRECCIÓN: Es codigo_barra (singular), no codigo_barras
            codigo_barra: p.codigo_barra, 
            
            // GUARDAMOS LOS 3 PRECIOS CALCULADOS
            precio_efectivo: p.precio_efectivo,
            precio_tarjeta: p.precio_tarjeta,
            precio_tarjeta_local: p.precio_tarjeta_local,
            
            stock: p.stock,
            categoria: p.categoria
          }));
          
          localStorage.setItem(CLAVE_OFFLINE, JSON.stringify(datosMinimos));
          return true;
        } catch (e) {
          console.error('Error guardando en local', e);
          return false;
        }
      })
    );
  }

getAllOffline(buscar: string = ''): Observable<ProductoResponse> {
    const dataRaw = localStorage.getItem(CLAVE_OFFLINE);
    // Forzamos el tipo 'any' temporalmente al parsear porque el objeto guardado 
    // es una versión reducida de Producto, pero compatible en los campos que usamos.
    let productos: any[] = dataRaw ? JSON.parse(dataRaw) : [];

    if (buscar) {
      const termino = buscar.toLowerCase();
      productos = productos.filter(p => 
        (p.nombre && p.nombre.toLowerCase().includes(termino)) || 
        (p.codigo_barra && p.codigo_barra.includes(termino))
      );
    }

    

    return of({
      data: productos,
      total: productos.length,
      page: 1,
      totalPages: 1
    });
  }

vaciarCamion(): Observable<any> {
    return this.http.post(`${this.apiUrl}/vaciar-camion`, {});
  }

ventaFeriaRápida(productoId: number, cantidad: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/venta-feria`, { productoId, cantidad });
}

actualizarStockRapido(id: number, stockAlmacen: number, stockCamion: number): Observable<any> {
    // Fíjate que enviamos stockAlmacen y stockCamion
    return this.http.patch(`${this.apiUrl}/${id}/stock`, { stockAlmacen, stockCamion });
}

getByBarcode(codigo: string): Observable<{ data: Producto }> {
    return this.http.get<{ data: Producto }>(`${this.apiUrl}/codigo/${codigo}`);
  }
}