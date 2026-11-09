import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VentaService } from '../../services/venta.service';

interface ProductoReporte {
  productoId: number;
  nombre: string;
  categoria: string | null;
  cantidad: number;
  recaudado: number;
  costo: number;
  ganancia: number;
  margen: number;
  cantidadVentas: number;
}

interface ResumenVentas {
  unidades: number;
  facturado: number;
  ganancia: number;
  cantidadVentas: number;
}

interface OpcionMes {
  value: string; // "YYYY-MM"
  label: string;
}

type OrdenReporte = 'ganancia' | 'cantidad' | 'recaudado' | 'nombre';

@Component({
  selector: 'app-reporte-productos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporte-productos.html'
})
export class ReporteProductosComponent implements OnInit {
  private ventaService = inject(VentaService);
  private cd = inject(ChangeDetectorRef);

  loading = true;

  // '' = histórico completo. 'YYYY-MM' = un mes puntual.
  mesSeleccionado = '';
  mesesDisponibles: OpcionMes[] = [];
  private fechaDesde = '';
  private fechaHasta = '';

  productos: ProductoReporte[] = [];
  resumen: ResumenVentas = { unidades: 0, facturado: 0, ganancia: 0, cantidadVentas: 0 };
  productoSeleccionado: ProductoReporte | null = null;

  busqueda = '';
  orden: OrdenReporte = 'ganancia';

  ngOnInit() {
    this.cargarMeses();
    this.cargarReporte();
  }

  onCambiarMes() {
    if (!this.mesSeleccionado) {
      this.fechaDesde = '';
      this.fechaHasta = '';
    } else {
      const [year, month] = this.mesSeleccionado.split('-').map(Number);
      this.fechaDesde = this.formatearFechaISO(new Date(year, month - 1, 1));
      this.fechaHasta = this.formatearFechaISO(new Date(year, month, 0));
    }
    this.cargarReporte();
  }

  labelPeriodo(): string {
    if (!this.mesSeleccionado) return 'Histórico completo';
    return this.mesesDisponibles.find(m => m.value === this.mesSeleccionado)?.label || this.mesSeleccionado;
  }

  get productosFiltrados(): ProductoReporte[] {
    const q = this.busqueda.trim().toLowerCase();
    const lista = q
      ? this.productos.filter(p => p.nombre.toLowerCase().includes(q) || (p.categoria || '').toLowerCase().includes(q))
      : this.productos.slice();

    return lista.sort((a, b) =>
      this.orden === 'nombre' ? a.nombre.localeCompare(b.nombre) : b[this.orden] - a[this.orden]);
  }

  seleccionar(p: ProductoReporte) {
    this.productoSeleccionado = this.productoSeleccionado?.productoId === p.productoId ? null : p;
  }

  // --- Valores por unidad (promedio de lo vendido en el período) ---
  precioPromedio(p: ProductoReporte): number { return p.cantidad > 0 ? p.recaudado / p.cantidad : 0; }
  costoUnitario(p: ProductoReporte): number { return p.cantidad > 0 ? p.costo / p.cantidad : 0; }
  gananciaUnitaria(p: ProductoReporte): number { return p.cantidad > 0 ? p.ganancia / p.cantidad : 0; }

  // Qué parte de la ganancia total del período aporta este producto
  participacionGanancia(p: ProductoReporte): number {
    return this.resumen.ganancia > 0 ? (p.ganancia / this.resumen.ganancia) * 100 : 0;
  }

  private cargarMeses() {
    this.ventaService.getVentasPorMes(12).subscribe({
      next: (res: any) => {
        this.mesesDisponibles = (res.data || [])
          .slice()
          .reverse()
          .map((v: any) => ({ value: v.mes, label: this.formatearMesLargo(v.mes) }));
        this.cd.detectChanges();
      },
      error: (err) => console.error('Error cargando meses', err)
    });
  }

  private cargarReporte() {
    this.loading = true;
    this.ventaService.getReporteProductos(this.fechaDesde, this.fechaHasta).subscribe({
      next: (res: any) => {
        this.productos = res.data || [];
        this.resumen = res.resumen || { unidades: 0, facturado: 0, ganancia: 0, cantidadVentas: 0 };
        if (this.productoSeleccionado) {
          this.productoSeleccionado =
            this.productos.find(p => p.productoId === this.productoSeleccionado!.productoId) || null;
        }
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando reporte de productos', err);
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  private formatearFechaISO(f: Date): string {
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  }

  private formatearMesLargo(mesStr: string): string {
    const [year, month] = mesStr.split('-');
    const texto = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }
}
