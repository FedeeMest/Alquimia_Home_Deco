import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService } from '../../services/producto.service';

@Component({
  selector: 'app-catalogo-publico',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalogo-publico.html'
})
export class CatalogoPublicoComponent implements OnInit {
  private productoService = inject(ProductoService);
  private cd = inject(ChangeDetectorRef);
  
  // Listas de datos
  productosOriginales: any[] = [];
  productosFiltrados: any[] = [];
  categoriasDisponibles: string[] = [];
  cargando = true;

  //(PAGINACIÓN FRONT-END)
  productosVisibles: any[] = []; 
  paginaActual: number = 1;
  itemsPorPagina: number = 12; // Cantidad ideal para grillas de 3 o 4 columnas

  // Estado de los filtros
  terminoBusqueda: string = '';
  categoriaSeleccionada: string = '';
  ordenSeleccionado: string = 'defecto';

  // Estado del Modal
  productoSeleccionado: any = null;

  ngOnInit() {
    this.cargarCatalogo();
  }

  cargarCatalogo() {
    this.productoService.getPublicCatalog().subscribe({
      next: (res: any) => {
        const data = res.data ? res.data : res; 
        this.productosOriginales = data;
        this.productosFiltrados = [...this.productosOriginales];
        this.extraerCategorias();
        this.actualizarProductosVisibles();
        this.cargando = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('❌ Error cargando el catálogo:', err);
        this.cargando = false;
        this.cd.detectChanges();
      }
    });
  }

  actualizarProductosVisibles() {
    // Cortamos el array total desde el inicio hasta el límite de la página actual
    const limite = this.paginaActual * this.itemsPorPagina;
    this.productosVisibles = this.productosFiltrados.slice(0, limite);
    this.cd.detectChanges();
  }

  cargarMas() {
    this.paginaActual++;
    this.actualizarProductosVisibles();
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
    this.categoriaSeleccionada = this.categoriaSeleccionada === cat ? '' : cat;
    this.aplicarFiltros();
  }

  limpiarBusqueda() {
    this.terminoBusqueda = '';
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    let resultado = [...this.productosOriginales];

    if (this.terminoBusqueda.trim()) {
      const termino = this.terminoBusqueda.toLowerCase().trim();
      resultado = resultado.filter(p => 
        p.nombre.toLowerCase().includes(termino) || 
        (p.categoria && p.categoria.toLowerCase().includes(termino))
      );
    }

    if (this.categoriaSeleccionada) {
      resultado = resultado.filter(p => p.categoria === this.categoriaSeleccionada);
    }

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
    }

    this.productosFiltrados = resultado;
    // Al filtrar, volvemos a la página 1 y calculamos los visibles
    this.paginaActual = 1;
    this.actualizarProductosVisibles();
  }

  // --- FUNCIONES DEL MODAL ---
  abrirModal(producto: any) {
    this.productoSeleccionado = producto;
    // Bloquear scroll de la página de fondo
    document.body.style.overflow = 'hidden'; 
  }

  cerrarModal() {
    this.productoSeleccionado = null;
    // Restaurar scroll
    document.body.style.overflow = 'auto'; 
  }

  // --- CARRITO ---
  agregarAlCarrito(producto: any) {
    alert(`¡Agregaste ${producto.nombre} al carrito!`);
    // Opcional: Cerrar modal al agregar
    if (this.productoSeleccionado) {
      this.cerrarModal();
    }
  }
}
/* import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
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
  private cd = inject(ChangeDetectorRef);
  
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
      next: (res: any) => {
        // Validación robusta: por si el interceptor modifica la respuesta
        const data = res.data ? res.data : res; 
        
        this.productosOriginales = data;
        this.productosFiltrados = [...this.productosOriginales];
        this.extraerCategorias();
        this.cargando = false;

        console.log('✅ Catálogo cargado con éxito:', this.productosFiltrados.length, 'productos');
        
        // 4. FORZAMOS A ANGULAR A DIBUJAR LOS PRODUCTOS YA MISMO
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('❌ Error cargando el catálogo:', err);
        this.cargando = false;
        this.cd.detectChanges();
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
    this.cd.detectChanges();
  }

  agregarAlCarrito(producto: any) {
    alert(`¡Agregaste ${producto.nombre} al carrito!`);
  }
}
 */