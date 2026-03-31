import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductoService } from '../../services/producto.service';
import { FormsModule } from '@angular/forms'; //

@Component({
  selector: 'app-catalogo-publico',
  standalone: true,
  imports: [CommonModule, FormsModule], //
  templateUrl: './catalogo-publico.html'
})
export class CatalogoPublicoComponent implements OnInit {
  private productoService = inject(ProductoService);
  
  productos: any[] = [];
  cargando = true;

  // Listas de datos
  productosOriginales: any[] = [];
  productosFiltrados: any[] = [];
  categoriasDisponibles: string[] = [];

  // Estado de los filtros
  terminoBusqueda: string = '';
  categoriaSeleccionada: string = '';
  ordenSeleccionado: string = 'defecto';

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

  extraerCategorias() {
    const categoriasSet = new Set<string>();
    this.productosOriginales.forEach(p => {
      if (p.categoria) {
        categoriasSet.add(p.categoria);
      }
    });
    this.categoriasDisponibles = Array.from(categoriasSet).sort();
  }

  seleccionarCategoria(cat: string) {
    // Si toca la misma categoría, la deselecciona (toggle)
    this.categoriaSeleccionada = this.categoriaSeleccionada === cat ? '' : cat;
    this.aplicarFiltros();
  }

  limpiarBusqueda() {
    this.terminoBusqueda = '';
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    let resultado = [...this.productosOriginales];

    // 1. Filtro por Búsqueda de Texto
    if (this.terminoBusqueda.trim()) {
      const termino = this.terminoBusqueda.toLowerCase().trim();
      resultado = resultado.filter(p => 
        p.nombre.toLowerCase().includes(termino) || 
        (p.categoria && p.categoria.toLowerCase().includes(termino))
      );
    }

    // 2. Filtro por Categoría
    if (this.categoriaSeleccionada) {
      resultado = resultado.filter(p => p.categoria === this.categoriaSeleccionada);
    }

    // 3. Ordenamiento
    switch (this.ordenSeleccionado) {
      case 'precio_asc':
        resultado.sort((a, b) => a.precio - b.precio);
        break;
      case 'precio_desc':
        resultado.sort((a, b) => b.precio - a.precio);
        break;
      case 'nombre_asc':
        resultado.sort((a, b) => a.nombre.localeCompare(b.nombre));
        break;
      case 'nombre_desc':
        resultado.sort((a, b) => b.nombre.localeCompare(a.nombre));
        break;
      default:
        // 'defecto' - Mantiene el orden de la base de datos
        break;
    }

    this.productosFiltrados = resultado;
  }

  agregarAlCarrito(producto: any) {
    alert(`¡Agregaste ${producto.nombre} al carrito!`);
  }
}
