import { Component, ElementRef, OnInit, AfterViewInit, OnDestroy, ViewChild, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VentaService } from '../../services/venta.service';
import Chart from 'chart.js/auto';

interface ProductoTop {
  nombre: string;
  cantidad: number;
  recaudado: number;
}

interface VentaMes {
  mes: string; // formato "YYYY-MM"
  total: number;
  cantidad_ventas: number;
}

interface OpcionMes {
  value: string; // "YYYY-MM"
  label: string; // "Septiembre 2026"
}

interface Deudor {
  clienteId: number;
  nombre: string;
  telefono: string | null;
  totalAdeudado: number;
  cantidadVentas: number;
  fechaMasAntigua: string;
  diasSinCobrar: number;
}

@Component({
  selector: 'app-estadisticas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './estadisticas.html'
})
export class EstadisticasComponent implements OnInit, AfterViewInit, OnDestroy {
  private ventaService = inject(VentaService);
  private cd = inject(ChangeDetectorRef);

  loadingTop = true;
  loadingMensual = true;
  loadingCobranzas = true;

  // '' = histórico completo (general). 'YYYY-MM' = un mes puntual.
  mesSeleccionado: string = '';
  mesesDisponibles: OpcionMes[] = [];

  private fechaDesde: string = '';
  private fechaHasta: string = '';
  limiteTop: number = 10;

  topProductos: ProductoTop[] = [];
  ventasPorMes: VentaMes[] = [];
  deudores: Deudor[] = [];

  totalFacturadoPeriodo = 0;
  totalVentasPeriodo = 0;

  totalAdeudado = 0;
  cantidadDeudores = 0;

  @ViewChild('chartTopProductos') chartTopProductosRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartVentasMes') chartVentasMesRef!: ElementRef<HTMLCanvasElement>;

  private chartTop?: Chart;
  private chartMes?: Chart;
  private vistaLista = false;

  ngOnInit() {
    this.cargarTopProductos();
    this.cargarVentasPorMes();
    this.cargarCobranzas();
  }

  ngAfterViewInit() {
    this.vistaLista = true;
    if (this.topProductos.length) this.dibujarTopProductos();
    if (this.ventasPorMes.length) this.dibujarVentasPorMes();
  }

  ngOnDestroy() {
    this.chartTop?.destroy();
    this.chartMes?.destroy();
  }

  // --- Selección de mes (dropdown o click en el gráfico) ---

  onCambiarMes() {
    this.aplicarRangoDesdeMes();
    this.cargarTopProductos();
    if (this.vistaLista) {
      try { this.dibujarVentasPorMes(); } catch (e) { console.error(e); } // redibuja para resaltar el punto elegido
    }
  }

  volverAGeneral() {
    this.mesSeleccionado = '';
    this.onCambiarMes();
  }

  labelMesSeleccionado(): string {
    if (!this.mesSeleccionado) return 'Histórico completo';
    const opcion = this.mesesDisponibles.find(m => m.value === this.mesSeleccionado);
    return opcion ? opcion.label : this.mesSeleccionado;
  }

  private aplicarRangoDesdeMes() {
    if (!this.mesSeleccionado) {
      this.fechaDesde = '';
      this.fechaHasta = '';
      return;
    }
    const [year, month] = this.mesSeleccionado.split('-').map(Number);
    const primerDia = new Date(year, month - 1, 1);
    const ultimoDia = new Date(year, month, 0); // día 0 del mes siguiente = último día de este mes

    this.fechaDesde = this.formatearFechaISO(primerDia);
    this.fechaHasta = this.formatearFechaISO(ultimoDia);
  }

  private formatearFechaISO(fecha: Date): string {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // --- Carga de datos ---

  private cargarTopProductos() {
    this.loadingTop = true;
    this.ventaService.getEstadisticas(this.limiteTop, this.fechaDesde, this.fechaHasta).subscribe({
      next: (res: any) => {
        this.topProductos = res.data || [];
        this.totalFacturadoPeriodo = this.topProductos.reduce((sum, p) => sum + p.recaudado, 0);
        this.totalVentasPeriodo = this.topProductos.reduce((sum, p) => sum + p.cantidad, 0);
        this.loadingTop = false;
        this.cd.detectChanges();

        if (this.vistaLista) {
          try { this.dibujarTopProductos(); } catch (e) { console.error('Error dibujando el gráfico de top productos', e); }
        }
      },
      error: (err) => {
        console.error('Error cargando top de productos', err);
        this.loadingTop = false;
        this.cd.detectChanges();
      }
    });
  }

  private cargarVentasPorMes() {
    this.loadingMensual = true;
    this.ventaService.getVentasPorMes(12).subscribe({
      next: (res: any) => {
        this.ventasPorMes = res.data || [];
        this.mesesDisponibles = this.ventasPorMes
          .slice()
          .reverse()
          .map(v => ({ value: v.mes, label: this.formatearMesLargo(v.mes) }));

        this.loadingMensual = false;
        this.cd.detectChanges();

        if (this.vistaLista) {
          try { this.dibujarVentasPorMes(); } catch (e) { console.error('Error dibujando el gráfico de ventas por mes', e); }
        }
      },
      error: (err) => {
        console.error('Error cargando ventas por mes', err);
        this.loadingMensual = false;
        this.cd.detectChanges();
      }
    });
  }

  private cargarCobranzas() {
    this.loadingCobranzas = true;
    this.ventaService.getCobranzas().subscribe({
      next: (res: any) => {
        this.deudores = res.deudores || [];
        this.totalAdeudado = res.totalAdeudado || 0;
        this.cantidadDeudores = res.cantidadDeudores || 0;
        this.loadingCobranzas = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando cobranzas', err);
        this.loadingCobranzas = false;
        this.cd.detectChanges();
      }
    });
  }

  claseDiasSinCobrar(dias: number): string {
    if (dias >= 30) return 'text-red-600 font-bold';
    if (dias >= 15) return 'text-amber-600 font-bold';
    return 'text-slate-600';
  }

  // --- Gráficos ---

  private dibujarTopProductos() {
    if (!this.chartTopProductosRef) return;
    this.chartTop?.destroy();

    this.chartTop = new Chart(this.chartTopProductosRef.nativeElement, {
      type: 'bar',
      data: {
        labels: this.topProductos.map(p => p.nombre),
        datasets: [{
          label: 'Unidades vendidas',
          data: this.topProductos.map(p => p.cantidad),
          backgroundColor: '#0f172a',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  private dibujarVentasPorMes() {
    if (!this.chartVentasMesRef) return;
    this.chartMes?.destroy();

    // Resaltamos en rojo el mes actualmente seleccionado (si hay uno)
    const colores = this.ventasPorMes.map(v => v.mes === this.mesSeleccionado ? '#dc2626' : '#059669');
    const radios = this.ventasPorMes.map(v => v.mes === this.mesSeleccionado ? 7 : 3);

    this.chartMes = new Chart(this.chartVentasMesRef.nativeElement, {
      type: 'line',
      data: {
        labels: this.ventasPorMes.map(v => this.formatearMesCorto(v.mes)),
        datasets: [{
          label: 'Total facturado',
          data: this.ventasPorMes.map(v => v.total),
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: radios,
          pointBackgroundColor: colores,
          pointHoverRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_evt, elementos) => {
          if (!elementos.length) return;
          const idx = elementos[0].index;
          const mesClickeado = this.ventasPorMes[idx]?.mes;
          if (!mesClickeado) return;
          // Clickear el mismo mes ya seleccionado vuelve al histórico completo
          this.mesSeleccionado = this.mesSeleccionado === mesClickeado ? '' : mesClickeado;
          this.onCambiarMes();
        },
        onHover: (evt, elementos) => {
          const target = evt.native?.target as HTMLElement | undefined;
          if (target) target.style.cursor = elementos.length ? 'pointer' : 'default';
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { footer: () => 'Click para filtrar el Top 10 por este mes' } }
        },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  private formatearMesCorto(mesStr: string): string {
    const [year, month] = mesStr.split('-');
    const fecha = new Date(Number(year), Number(month) - 1, 1);
    return fecha.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
  }

  private formatearMesLargo(mesStr: string): string {
    const [year, month] = mesStr.split('-');
    const fecha = new Date(Number(year), Number(month) - 1, 1);
    const texto = fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }
}