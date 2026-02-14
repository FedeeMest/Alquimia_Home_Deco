import { Component, ElementRef, ViewChild, inject, AfterViewInit, ChangeDetectorRef, OnInit, } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfiguracionService } from '../../services/configuracion.service';
import { ProductoService } from '../../services/producto.service';
import { Producto } from '../../Interfaces/producto.interface';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';


@Component({
  selector: 'app-verificador-precio',
  imports: [CommonModule, FormsModule, ZXingScannerModule],
  templateUrl: './verificador-precio.html',
  styleUrl: './verificador-precio.css',
})
export class VerificadorPrecio implements OnInit, AfterViewInit {
  private productoService = inject(ProductoService);
  private cd = inject(ChangeDetectorRef);
  private configuracionService = inject(ConfiguracionService);

  @ViewChild('scanInput') scanInput!: ElementRef;

  codigoLeido: string = '';
  producto?: Producto;
  mensaje: string = 'Escanea un código para ver el precio';
  buscando = false;
  error = false;
  esModoOffline: boolean = false;
  
  // Nueva variable para controlar si el teclado virtual debe abrirse
  tecladoManual = false;

  recargoLocal: number = 0;   
  recargoTarjeta: number = 0; 
  descuentoEfectivo: number = 0;

  mostrarCamara = false;
  formatosAdmitidos = [
    BarcodeFormat.EAN_13, 
    BarcodeFormat.EAN_8, 
    BarcodeFormat.CODE_128, 
    BarcodeFormat.QR_CODE
  ];

  ngOnInit() {
    this.cargarConfiguracion();
  }

  cargarConfiguracion() {
    this.configuracionService.obtener().subscribe({
      next: (config: any) => {
        if (config) {
          this.recargoLocal = config.porcentaje_local || 0; 
          this.recargoTarjeta = config.porcentaje_tarjeta || 0;
          this.descuentoEfectivo = config.porcentaje_efectivo || 0;
        }
      },
      error: (err) => console.error('Error cargando porcentajes', err)
    });
  }

  ngAfterViewInit() {
    this.enfocarInput();
  }

  mantenerFoco() {
    this.enfocarInput();
  }
  
  toggleCamara() {
    this.mostrarCamara = !this.mostrarCamara;
    this.mensaje = this.mostrarCamara ? 'Apuntá al código...' : 'Escanea un código para ver el precio';
    
    if (this.mostrarCamara) {
      this.producto = undefined;
    } else {
      setTimeout(() => this.enfocarInput(), 100);
    }
  }

  // Nueva función para alternar entre teclado manual y modo escáner
  toggleTeclado() {
    this.tecladoManual = !this.tecladoManual;
    // Forzamos el foco y un pequeño delay para que el navegador detecte el cambio de inputmode
    setTimeout(() => this.enfocarInput(), 50);
  }

  onCodigoEscaneado(codigo: string) {
    this.codigoLeido = codigo;
    this.mostrarCamara = false; 
    this.buscar(); 
  }

  private enfocarInput() {
    this.scanInput?.nativeElement.focus();
  }

  buscar() {
    if (!this.codigoLeido.trim()) return;

    // Reseteamos a modo escáner (sin teclado) para la próxima búsqueda
    this.tecladoManual = false;

    this.buscando = true;
    this.error = false;
    this.producto = undefined; 
    this.mensaje = 'Buscando...';

    const codigoParaBuscar = this.codigoLeido;
    this.codigoLeido = ''; 

    this.productoService.getAll(codigoParaBuscar).subscribe({
      next: (resp: any) => { 
        const listaProductos = resp.data; 
        const encontrado = listaProductos.find((p: any) => p.codigo_barra === codigoParaBuscar);

        if (encontrado) {
          this.producto = encontrado;
          this.mensaje = '';
        } else {
          this.error = true;
          this.mensaje = 'Producto no encontrado';
        }
        this.buscando = false;
        this.cd.detectChanges();
        // Al reenfocar aquí, como tecladoManual es false, el teclado NO saldrá
        setTimeout(() => this.enfocarInput(), 100);
      },
      error: (err) => {
        console.warn('Fallo conexión online, intentando modo offline...');
        
        // 2. INTENTO OFFLINE (Plan B si falla internet)
        this.productoService.getAllOffline(codigoParaBuscar).subscribe({
          next: (respOffline) => {
            this.esModoOffline = true; // Activamos la alerta visual
            
            // Buscamos en los datos locales
            const encontrado = respOffline.data.find((p: any) => p.codigo_barra === codigoParaBuscar);
            
            if (encontrado) {
               this.producto = encontrado;
               this.mensaje = '';
               this.error = false; // Limpiamos el error porque lo encontramos offline
            } else {
               this.error = true;
               this.mensaje = 'No encontrado (ni en internet ni en memoria local)';
            }
            this.finalizarBusqueda();
          },
          error: (e) => {
            // Si falla también el offline (raro, pero posible)
            this.error = true;
            this.mensaje = 'Error crítico al buscar';
            this.finalizarBusqueda();
          }
        });
      }
    });
  }

  private finalizarBusqueda() {
    this.buscando = false;
    this.cd.detectChanges();
    // Reenfocamos para permitir escaneo rápido consecutivo
    setTimeout(() => this.enfocarInput(), 100);
  }
}