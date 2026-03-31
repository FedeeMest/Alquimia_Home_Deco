import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductoService } from '../../services/producto.service';

@Component({
  selector: 'app-catalogo-publico',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './catalogo-publico.html'
})
export class CatalogoPublicoComponent implements OnInit {
  private productoService = inject(ProductoService);
  
  productos: any[] = [];
  cargando = true;

  ngOnInit() {
    this.cargarCatalogo();
  }

  cargarCatalogo() {
    this.productoService.getPublicCatalog().subscribe({
      next: (res) => {
        this.productos = res.data;
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error cargando el catálogo:', err);
        this.cargando = false;
      }
    });
  }

  agregarAlCarrito(producto: any) {
    // Alerta temporal, luego lo conectaremos a un carrito real (ej. LocalStorage)
    alert(`¡Agregaste ${producto.nombre} al carrito!`);
  }
}