import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common'; 
import { ProductoService, ProductoResponse } from '../../services/producto.service';
import { Producto } from '../../Interfaces/producto.interface';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-producto-list',
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './producto-list.html',
  styleUrl: './producto-list.css',
})
export class ProductoList implements OnInit {
  private productoService = inject(ProductoService);
  private notificationService = inject(NotificationService);
  private cd = inject(ChangeDetectorRef); // <--- Recuperamos el detector de cambios
  
  productos: Producto[] = [];
  loading = true;
  terminoBusqueda: string = '';
  verInactivos = false;

  mostrarFiltros: boolean = false;
  categoriasDisponibles: string[] = [];

  filtros = {
  proveedor: '',
  categoria: '',
  orden: 'nombre_asc'
  };

  productosOriginales: Producto[] = [];
  productosList: Producto[] = [];

  get conteoFiltrosActivos(): number {
  let count = 0;
  if (this.filtros.proveedor.trim() !== '') count++;
  if (this.filtros.categoria !== '') count++;
  return count;
  }

  // --- Variables de Paginación ---
  page: number = 1;
  limit: number = 10;
  total: number = 0;
  totalPages: number = 0;

  ngOnInit(): void {
    this.cargarProductos();
  }

  cargarProductos() {
  this.productoService.getAll().subscribe({
    next: (resp: any) => {
      this.productosOriginales = resp.data;
      this.productosList = [...this.productosOriginales]; 
      this.extraerCategorias(); // Construye el select dinámico
      this.aplicarFiltros(); // Se asegura de que se ordene desde el inicio
    }
  });
}

  extraerCategorias() {
  const cats = this.productosOriginales
    // Si la categoría es undefined, devolvemos un string vacío
    .map(p => p.categoria || '') 
    // Ahora TypeScript sabe con seguridad que 'c' es un string
    .filter(c => c.trim() !== ''); 
  
  this.categoriasDisponibles = [...new Set(cats)].sort();
}

aplicarFiltros() {
  // Siempre arrancamos desde el 100% de los productos
  let filtrados = [...this.productosOriginales];
  
  const termino = (this.terminoBusqueda || '').toLowerCase().trim();
  const provFiltro = this.filtros.proveedor.toLowerCase().trim();
  const catFiltro = this.filtros.categoria;

  // Filtro 1: Búsqueda Global (Busca en nombre, cód. barra o cód. proveedor)
  if (termino !== '') {
    filtrados = filtrados.filter(p => 
      p.nombre.toLowerCase().includes(termino) ||
      p.codigo_barra?.toLowerCase().includes(termino) ||
      p.codigo_proveedor?.toLowerCase().includes(termino)
    );
  }

  // Filtro 2: Proveedor Específico
  if (provFiltro !== '') {
    filtrados = filtrados.filter(p => 
      p.codigo_proveedor?.toLowerCase().includes(provFiltro)
    );
  }

  // Filtro 3: Categoría Exacta
  if (catFiltro !== '') {
    filtrados = filtrados.filter(p => p.categoria === catFiltro);
  }

  // Filtro 4: Ordenamiento de la tabla
  filtrados.sort((a, b) => {
    switch (this.filtros.orden) {
      case 'nombre_asc':
        return a.nombre.localeCompare(b.nombre);
      case 'nombre_desc':
        return b.nombre.localeCompare(a.nombre);
      case 'precio_asc':
        // Si no hay precio, lo tratamos como 0
        const precioAscA = a.precio_efectivo || 0;
        const precioAscB = b.precio_efectivo || 0;
        return precioAscA - precioAscB;
      case 'precio_desc':
        const precioDescA = a.precio_efectivo || 0;
        const precioDescB = b.precio_efectivo || 0;
        return precioDescB - precioDescA;
      default:
        return 0;
    }
  });

  // Reasignamos la lista visual con los resultados finales
  this.productosList = filtrados;
}

buscar() {
  this.aplicarFiltros();
}

limpiar() {
  this.terminoBusqueda = '';
  this.aplicarFiltros();
}

limpiarFiltrosAvanzados() {
  this.filtros = { proveedor: '', categoria: '', orden: 'nombre_asc' };
  this.aplicarFiltros();
}

  cambiarPagina(delta: number) {
    const nuevaPagina = this.page + delta;
    
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPages) {
      this.page = nuevaPagina;
      this.cargarProductos();
    }
  }

  toggleVista() {
    this.verInactivos = !this.verInactivos;
    this.terminoBusqueda = ''; 
    this.page = 1; 
    this.cargarProductos();
  }



  borrarProducto(id: number | undefined) {
    if(!id) return;
    if(confirm('¿Estás seguro de eliminar este producto?')) {
      this.loading = true;
      this.productoService.delete(id)
        .pipe(finalize(() => {
            this.loading = false;
            this.cd.detectChanges(); // También forzamos aquí
        }))
        .subscribe({
          next: () => {
            this.notificationService.show('Producto eliminado', 'error');
            this.cargarProductos();
          },
          error: () => {
             this.notificationService.show('No se pudo eliminar el producto', 'error');
          }
        });
    }
  }

  restaurarProducto(id: number | undefined) {
    if(!id) return;
    if(confirm('¿Deseas restaurar este producto?')) {
      this.loading = true;
      this.productoService.restaurar(id)
        .pipe(finalize(() => {
            this.loading = false;
            this.cd.detectChanges(); // Y aquí
        }))
        .subscribe({
          next: () => {
            this.notificationService.show('Producto restaurado', 'success');
            this.cargarProductos();
          },
          error: () => {
            this.notificationService.show('No se pudo restaurar', 'error');
          }
        });
    }
  }
}