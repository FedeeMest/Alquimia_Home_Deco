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

  // --- Variables de Paginación ---
  page: number = 1;
  limit: number = 10;
  total: number = 0;
  totalPages: number = 0;

  ngOnInit(): void {
    this.cargarProductos();
  }

  cargarProductos() {
    this.loading = true;
    const buscarActivos = !this.verInactivos;

    this.productoService.getAll(this.terminoBusqueda, buscarActivos, this.page, this.limit)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cd.detectChanges(); // <--- ¡ESTA ES LA CLAVE! Forzamos la actualización visual aquí.
        })
      )
      .subscribe({
        next: (resp: ProductoResponse) => {
          this.productos = resp.data;
          this.total = resp.total;
          this.totalPages = resp.totalPages;
          // No hace falta detectChanges aquí porque finalize corre después de esto
        },
        error: (err) => {
          console.error('Error al cargar productos', err);
          this.notificationService.show('Error al cargar los productos', 'error');
        }
      });
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

  buscar() {
    this.page = 1; 
    this.cargarProductos();
  }

  limpiar() {
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