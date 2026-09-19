import { Component, ElementRef, OnInit, AfterViewInit, OnDestroy, ViewChild, inject } from '@angular/core';
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

@Component({
  selector: 'app-estadisticas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './estadisticas.html'
})
export class EstadisticasComponent implements OnInit, AfterViewInit, OnDestroy {
  private ventaService = inject(VentaService);

  loadingTop = true;
  loadingMensual = true;

  fechaDesde: string = '';
  fechaHasta: string = '';
  limiteTop: number = 10;

  topProductos: ProductoTop[] = [];
  ventasPorMes: VentaMes[] = [];

  totalFacturadoPeriodo = 0;
  totalVentasPeriodo = 0;

  @ViewChild('chartTopProductos') chartTopProductosRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartVentasMes') chartVentasMesRef!: ElementRef<HTMLCanvasElement>;

  private chartTop?: Chart;
  private chartMes?: Chart;
  private vistaLista = false;

  ngOnInit() {
    this.cargarTopProductos();
    this.cargarVentasPorMes();
  }

  ngAfterViewInit() {
    this.vistaLista = true;
    // Si los datos ya habían llegado antes de que el canvas existiera, dibujamos ahora
    if (this.topProductos.length) this.dibujarTopProductos();
    if (this.ventasPorMes.length) this.dibujarVentasPorMes();
  }

  ngOnDestroy() {
    this.chartTop?.destroy();
    this.chartMes?.destroy();
  }

  filtrar() {
    this.cargarTopProductos();
  }

  limpiarFiltro() {
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.cargarTopProductos();
  }

  private cargarTopProductos() {
    this.loadingTop = true;
    this.ventaService.getEstadisticas(this.limiteTop, this.fechaDesde, this.fechaHasta).subscribe({
      next: (res: any) => {
        this.topProductos = res.data || [];
        this.totalFacturadoPeriodo = this.topProductos.reduce((sum, p) => sum + p.recaudado, 0);
        this.totalVentasPeriodo = this.topProductos.reduce((sum, p) => sum + p.cantidad, 0);
        this.loadingTop = false;
        if (this.vistaLista) this.dibujarTopProductos();
      },
      error: (err) => {
        console.error('Error cargando top de productos', err);
        this.loadingTop = false;
      }
    });
  }

  private cargarVentasPorMes() {
    this.loadingMensual = true;
    this.ventaService.getVentasPorMes(12).subscribe({
      next: (res: any) => {
        this.ventasPorMes = res.data || [];
        this.loadingMensual = false;
        if (this.vistaLista) this.dibujarVentasPorMes();
      },
      error: (err) => {
        console.error('Error cargando ventas por mes', err);
        this.loadingMensual = false;
      }
    });
  }

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

    this.chartMes = new Chart(this.chartVentasMesRef.nativeElement, {
      type: 'line',
      data: {
        labels: this.ventasPorMes.map(v => this.formatearMes(v.mes)),
        datasets: [{
          label: 'Total facturado',
          data: this.ventasPorMes.map(v => v.total),
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  private formatearMes(mesStr: string): string {
    const [year, month] = mesStr.split('-');
    const fecha = new Date(Number(year), Number(month) - 1, 1);
    return fecha.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
  }
}