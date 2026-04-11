import { Component, inject, OnInit, ElementRef, ViewChild, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductoService } from '../../services/producto.service';
import { NotificationService } from '../../services/notification.service';
import { ConfiguracionService } from '../../services/configuracion.service';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-producto-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink, ImageCropperComponent],
  templateUrl: './producto-form.html',
  styleUrl: './producto-form.css',
})
export class ProductoForm implements OnInit {
  
  private fb = inject(FormBuilder);
  private productoService = inject(ProductoService);
  private notificationService = inject(NotificationService);
  private configService = inject(ConfiguracionService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private cd = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private sanitizer = inject(DomSanitizer);

  @ViewChild('etiquetaCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  productoForm!: FormGroup;
  
  isEditMode = false;
  productId: number | null = null;
  loading = false;
  imagenCargando = false;

  // --- VARIABLES DEL RECORTADOR (CROPPER) ---
  imageChangedEvent: any = '';
  croppedImage: SafeUrl | string = '';
  croppedBlob: Blob | null | undefined = null;
  showCropperModal = false;
  fileInputTarget: any = null;

  // --- VARIABLES DE PREVIEW ---
  previewCosto: number = 0;
  previewPrecioBase: number = 0;
  previewEfectivo: number = 0;
  previewTarjeta: number = 0;
  previewTarjetaLocal: number = 0;

  categorias = [
    'Vasos', 'Copas', 'Tazas', 'Copetineros', 'Tortera', 'Jarras',
    'Compoteras', 'Ensaladeras', 'Jarrones/Floreros', 'Borlas',
    'Accesorio de Mesa', 'Almohadones', 'Mantas', 'Manteles',
    'Caminos', 'Decoración', 'Difusores / Aromas', 'Ceramica','Textil','Platos','Combo','Té y Accesorios',
    'Jardín', 'Contenedores', 'Aromatizador', 'Difusores','Jarritos Con Sorbete', 'Otros'
  ];

  proveedoresFrecuentes = [
    'ALLEGRA', 'ALQUIMIA', 'AMBER CANDLES', 'BLUME', 'BORLAS CHIC',
    'BOTON', 'BRODERI', 'CURA TE ALMA', 'ELSATA', 'JUNKO SRL',
    'LUMME', 'ORAKKE', 'PAQUE & COCO', 'PETRIS SRL'
  ];
  
  tiposAjuste = ['DESCUENTO', 'RECARGO', 'NINGUNO'];

  showPrintModal = false;
  printConfig = {
    nombre: '',
    ganancia: 0,
    precioEfectivoCalculado: 0
  };

  ngOnInit(): void {
    this.initForm();
    this.suscribirCambios();

    this.route.params.subscribe(params => {
      if (params['id']) {
        this.isEditMode = true;
        this.productId = +params['id'];
        this.cargarProducto(this.productId);
      } else {
        this.isEditMode = false;
        this.cargarValoresPorDefecto(); 
      }
    });
  }

  initForm() {
    this.productoForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(3)]],
      descripcion: [''],
      codigo_barra: [''],
      codigo_proveedor: [''],
      proveedor: ['', Validators.required],
      categoria: ['', Validators.required],
      stock: [0, [Validators.required, Validators.min(0)]],
      stock_minimo: [1, [Validators.required, Validators.min(0)]],
      precio_compra: [0, [Validators.required, Validators.min(0)]],
      tiene_iva: [false],
      ganancia: [0, [Validators.required, Validators.min(0)]],
      
      ajuste_efectivo_tipo: ['DESCUENTO'],
      ajuste_efectivo_valor: [0],
      ajuste_tarjeta_tipo: ['RECARGO'],
      ajuste_tarjeta_valor: [0],
      ajuste_tarjeta_local_tipo: ['RECARGO'],
      ajuste_tarjeta_local_valor: [0],

      precio_venta_base: [{ value: 0, disabled: true }],
      precio_efectivo: [{ value: 0, disabled: true }],
      precio_tarjeta: [{ value: 0, disabled: true }],
      precio_tarjeta_local: [{ value: 0, disabled: true }],
      
      activo: [true],
      imagenUrl: [''],
      publicarEnWeb: [false]
    });
  }

  // ====================================================================
  //                      LÓGICA DEL RECORTADOR (CROPPER)
  // ====================================================================

  // 1. Interceptamos la selección del archivo y abrimos el Modal
  onFileSelected(event: any) {
    if (event.target.files && event.target.files.length) {
      this.imageChangedEvent = event;
      this.showCropperModal = true;
      
      // Guardamos el input en memoria, PERO NO LO VACIAMOS TODAVÍA
      this.fileInputTarget = event.target; 
    }
  }

  // 2. Se dispara cada vez que el usuario mueve el cuadro de recorte
  imageCropped(event: ImageCroppedEvent) {
    if (event.objectUrl) {
      this.croppedImage = this.sanitizer.bypassSecurityTrustUrl(event.objectUrl);
    } else if (event.base64) {
      this.croppedImage = event.base64;
    }
    this.croppedBlob = event.blob;
  }

  cerrarCropper() {
    this.showCropperModal = false;
    this.imageChangedEvent = '';
    this.croppedImage = '';
    this.croppedBlob = null;
    
    // RECIÉN ACÁ VACIAR EL INPUT (Para que puedas volver a elegir la misma foto si te equivocás)
    if (this.fileInputTarget) {
      this.fileInputTarget.value = '';
      this.fileInputTarget = null;
    }
  }

  // 3. LA SUBIDA REAL (Ejecuta tu lógica original de ngZone)
  subirImagenRecortada() {
    if (!this.croppedBlob) return;
    
    // Convertimos el "Blob" en un File
    const file = new File([this.croppedBlob], 'producto_optimizado.jpg', { type: 'image/jpeg' });
    
    this.cerrarCropper();

    this.ngZone.run(() => {
      this.imagenCargando = true;
      this.cd.detectChanges();
    });

    this.productoService.subirImagen(file).subscribe({
      next: (res) => {
        setTimeout(() => {
          this.productoForm.patchValue({ imagenUrl: res.url });
          this.imagenCargando = false;
          this.notificationService.show('Fotografía recortada y subida con éxito', 'success');
          this.cd.detectChanges(); 
        }, 0);
      },
      error: (err) => {
        setTimeout(() => {
          console.error('Error Cloudinary:', err);
          this.imagenCargando = false;
          this.notificationService.show('Error al subir la imagen', 'error');
          this.cd.detectChanges();
        }, 0);
      }
    });
  }

  // ====================================================================
  //                      LÓGICA DE PRECIOS Y FORMULARIO
  // ====================================================================

  cargarValoresPorDefecto() {
    this.configService.obtener().subscribe({
      next: (config) => {
        this.productoForm.patchValue({
          ajuste_efectivo_valor: config.porcentaje_efectivo,
          ajuste_tarjeta_valor: config.porcentaje_tarjeta,
          ajuste_tarjeta_local_valor: config.porcentaje_local,
          ajuste_efectivo_tipo: 'DESCUENTO',
          ajuste_tarjeta_tipo: 'RECARGO',
          ajuste_tarjeta_local_tipo: 'RECARGO',
          tiene_iva: false,
          ganancia: 0
        });
        this.calcularPrecios(); 
      },
      error: (err) => console.error('Error config', err)
    });
  }

  suscribirCambios() {
    this.productoForm.valueChanges.subscribe(() => {
       this.calcularPrecios();
    });
  }

  calcularPrecios() {
    const form = this.productoForm.getRawValue();

    let costo = Number(form.precio_compra) || 0;
    if (form.tiene_iva) {
      costo = costo * 1.21;
    }

    const gananciaPorcentaje = Number(form.ganancia) || 0;
    const porcentajeDecimal = gananciaPorcentaje / 100;
    
    let precioBase = 0;
    if (porcentajeDecimal >= 1) {
      precioBase = costo * 2; 
    } else {
      precioBase = costo / (1 - porcentajeDecimal);
    }
    
    precioBase = this.redondearComoExcel(precioBase);

    const pEfectivo = this.aplicarRegla(precioBase, form.ajuste_efectivo_tipo, Number(form.ajuste_efectivo_valor));
    const pTarjeta = this.aplicarRegla(precioBase, form.ajuste_tarjeta_tipo, Number(form.ajuste_tarjeta_valor));
    const pLocal = this.aplicarRegla(precioBase, form.ajuste_tarjeta_local_tipo, Number(form.ajuste_tarjeta_local_valor));

    this.previewCosto = costo;
    this.previewPrecioBase = precioBase;
    this.previewEfectivo = pEfectivo;
    this.previewTarjeta = pTarjeta;
    this.previewTarjetaLocal = pLocal;

    this.productoForm.patchValue({
      precio_venta_base: precioBase,
      precio_efectivo: pEfectivo,
      precio_tarjeta: pTarjeta,
      precio_tarjeta_local: pLocal
    }, { emitEvent: false });
  }

  aplicarRegla(base: number, tipo: string, valor: number): number {
    if (!valor) return base;
    let resultado = base;
    if (tipo === 'DESCUENTO') resultado = base * (1 - valor / 100);
    if (tipo === 'RECARGO') resultado = base * (1 + valor / 100);
    
    return this.redondearComoExcel(resultado);
  }

  redondearComoExcel(valor: number): number {
    return Math.ceil(valor / 1000) * 1000;
  }

  cargarProducto(id: number) {
    this.loading = true;
    this.productoService.getOne(id).subscribe({
      next: (producto) => {
        const productoData = {
            ...producto,
            descripcion: producto.descripcion || ''
        };
        this.productoForm.patchValue(productoData);
        this.calcularPrecios(); 
        this.loading = false;
      },
      error: (err) => {
        this.notificationService.show('Error al cargar producto', 'error');
        this.loading = false;
        this.router.navigate(['/admin/productos']);
      }
    });
  }

  guardarProducto() {
    if (this.productoForm.invalid) {
      this.productoForm.markAllAsTouched();
      this.notificationService.show('Completa los campos requeridos', 'error');
      return;
    }

    this.loading = true;
    const productoData = this.productoForm.getRawValue();

    if (this.isEditMode && this.productId) {
      this.productoService.update(this.productId, productoData).subscribe({
        next: () => {
          this.notificationService.show('Producto actualizado', 'success');
          this.router.navigate(['/admin/productos']);
        },
        error: () => {
          this.notificationService.show('Error al actualizar', 'error');
          this.loading = false;
        }
      });
    } else {
      this.productoService.create(productoData).subscribe({
        next: () => {
          this.notificationService.show('Producto creado', 'success');
          this.router.navigate(['/admin/productos']);
        },
        error: () => {
          this.notificationService.show('Error al crear', 'error');
          this.loading = false;
        }
      });
    }
  }

  // ====================================================================
  //                      LÓGICA DE IMPRESIÓN
  // ====================================================================

  abrirModalImpresion() {
    const form = this.productoForm.getRawValue();
    this.printConfig.nombre = form.nombre;
    this.printConfig.ganancia = form.ganancia;
    this.calcularPrecioImpresion();
    this.showPrintModal = true;
  }

  cerrarModalImpresion() {
    this.showPrintModal = false;
  }

  calcularPrecioImpresion() {
    const form = this.productoForm.getRawValue();
    
    let costo = Number(form.precio_compra) || 0;
    if (form.tiene_iva) {
      costo = costo * 1.21;
    }

    const gananciaNum = Number(this.printConfig.ganancia) || 0;
    const porcentaje = gananciaNum / 100;
    
    let precioBaseCalculado = 0;
    
    if (porcentaje >= 1) {
      precioBaseCalculado = costo * 2; 
    } else {
      precioBaseCalculado = costo / (1 - porcentaje);
    }
    
    const precioBase = this.redondearComoExcel(precioBaseCalculado);

    this.printConfig.precioEfectivoCalculado = this.aplicarRegla(
      precioBase, 
      form.ajuste_efectivo_tipo || 'DESCUENTO', 
      Number(form.ajuste_efectivo_valor) || 0
    );
  }

  imprimirEtiqueta() {
    const nombreEtiqueta = this.printConfig.nombre;
    const precioEtiqueta = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(this.printConfig.precioEfectivoCalculado);
    const codigoEtiqueta = this.productoForm.get('codigo_barra')?.value || this.productoForm.get('codigo_proveedor')?.value || 'S/C';

    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'black';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Cód: ' + codigoEtiqueta, canvas.width / 2, 40);

    ctx.font = 'bold 24px Arial';
    const nombreCorto = nombreEtiqueta.length > 30 ? nombreEtiqueta.substring(0, 30) + '...' : nombreEtiqueta;
    ctx.fillText(nombreCorto, canvas.width / 2, 100);

    ctx.font = '900 48px Arial';
    ctx.fillText(precioEtiqueta, canvas.width / 2, 180);

    const imagenBase64 = canvas.toDataURL('image/png').split(',')[1];

    this.notificationService.show('Enviando a la impresora...', 'success');
    
    this.http.post('http://localhost:5000/imprimir', { imagen: imagenBase64 })
      .subscribe({
        next: () => {
          this.notificationService.show('¡Etiqueta impresa con éxito!', 'success');
          this.cerrarModalImpresion(); 
        },
        error: (err) => {
          console.error(err);
          this.notificationService.show('Error: Verificá que el script de impresión esté abierto y la impresora conectada por USB.', 'error');
        }
      });
  }
}
// import { Component, inject, OnInit, ElementRef, ViewChild, ChangeDetectorRef, NgZone } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { HttpClient } from '@angular/common/http';
// import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
// import { ActivatedRoute, Router, RouterLink } from '@angular/router';
// import { ProductoService } from '../../services/producto.service';
// import { NotificationService } from '../../services/notification.service';
// import { ConfiguracionService } from '../../services/configuracion.service';
// import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';
// import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

// @Component({
//   selector: 'app-producto-form',
//   standalone: true,
//   imports: [CommonModule, ReactiveFormsModule,FormsModule, RouterLink, ImageCropperComponent],
//   templateUrl: './producto-form.html',
//   styleUrl: './producto-form.css',
// })
// export class ProductoForm implements OnInit {
  
//   private fb = inject(FormBuilder);
//   private productoService = inject(ProductoService);
//   private notificationService = inject(NotificationService);
//   private configService = inject(ConfiguracionService);
//   private router = inject(Router);
//   private route = inject(ActivatedRoute);
//   private http = inject(HttpClient);
//   private cd = inject(ChangeDetectorRef);
//   private ngZone = inject(NgZone);
//   private sanitizer = inject(DomSanitizer);

//   @ViewChild('etiquetaCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

//   // Variable del formulario (En el HTML se llamaba 'form', aquí unificamos a 'productoForm')
//   productoForm!: FormGroup;
  
//   isEditMode = false;
//   productId: number | null = null;
//   loading = false;
//   imagenCargando = false;

//   imageChangedEvent: any = '';
//   croppedImage: SafeUrl | string = '';
//   croppedBlob: Blob | null | undefined = null;
//   showCropperModal = false;
  

//   // --- VARIABLES QUE FALTABAN PARA EL HTML ---
//   previewCosto: number = 0;
//   previewPrecioBase: number = 0;
//   previewEfectivo: number = 0;
//   previewTarjeta: number = 0;
//   previewTarjetaLocal: number = 0;

//   // Dentro de la clase ProductoForm...

// categorias = [
//   'Vasos',
//   'Copas',
//   'Tazas',
//   'Copetineros',
//   'Tortera',
//   'Jarras',
//   'Compoteras',
//   'Ensaladeras',
//   'Jarrones/Floreros',
//   'Borlas',
//   'Accesorio de Mesa',
//   'Almohadones',
//   'Mantas',
//   'Manteles',
//   'Caminos', 
//   'Decoración',
//   'Difusores / Aromas',
//   'Ceramica',
//   'Jardín',
//   'Contenedores',
//   'Aromatizador',
//   'Difusores',
//   'Otros'
// ];

// proveedoresFrecuentes = [
//   'ALLEGRA',
//   'ALQUIMIA',
//   'AMBER CANDLES',
//   'BLUME',
//   'BORLAS CHIC',
//   'BOTON',
//   'BRODERI',
//   'CURA TE ALMA',
//   'ELSATA',
//   'JUNKO SRL',
//   'LUMME',
//   'ORAKKE',
//   'PAQUE & COCO',
//   'PETRIS SRL'
// ];
//   tiposAjuste = ['DESCUENTO', 'RECARGO', 'NINGUNO'];

//   showPrintModal = false;
//   printConfig = {
//     nombre: '',
//     ganancia: 0,
//     precioEfectivoCalculado: 0
//   };

//   ngOnInit(): void {
//     this.initForm();
//     this.suscribirCambios();

//     this.route.params.subscribe(params => {
//       if (params['id']) {
//         this.isEditMode = true;
//         this.productId = +params['id'];
//         this.cargarProducto(this.productId);
//       } else {
//         this.isEditMode = false;
//         this.cargarValoresPorDefecto(); 
//       }
//     });
//   }


//   // --- 2. SE EJECUTA MIENTRAS EL USUARIO MUEVE EL CUADRO DE RECORTE ---
//   imageCropped(event: ImageCroppedEvent) {
//     // Angular requiere "sanitizar" la URL temporal para evitar alertas de seguridad
//     if (event.objectUrl) {
//       this.croppedImage = this.sanitizer.bypassSecurityTrustUrl(event.objectUrl);
//     } else if (event.base64) {
//       this.croppedImage = event.base64;
//     }
//     this.croppedBlob = event.blob;
//   }

//   cerrarCropper() {
//     this.showCropperModal = false;
//     this.imageChangedEvent = '';
//     this.croppedImage = '';
//     this.croppedBlob = null;
//   }

//   // --- 3. SUBIMOS LA IMAGEN CUANDO EL USUARIO DA "ACEPTAR" ---
//   subirImagenRecortada() {
//     if (!this.croppedBlob) return;
    
//     this.cerrarCropper();

//     this.ngZone.run(() => {
//       this.imagenCargando = true;
//       this.cd.detectChanges();
//     });

//     // Convertimos el "Blob" recortado en un Archivo real para tu backend
//     const file = new File([this.croppedBlob], 'producto_optimizado.jpg', { type: 'image/jpeg' });

//     this.productoService.subirImagen(file).subscribe({
//       next: (res) => {
//         setTimeout(() => {
//           this.productoForm.patchValue({ imagenUrl: res.url });
//           this.imagenCargando = false;
//           this.notificationService.show('Fotografía recortada y subida con éxito', 'success');
//           this.cd.detectChanges(); 
//         }, 0);
//       },
//       error: (err) => {
//         setTimeout(() => {
//           console.error('Error Cloudinary:', err);
//           this.imagenCargando = false;
//           this.notificationService.show('Error al subir la imagen', 'error');
//           this.cd.detectChanges();
//         }, 0);
//       }
//     });
//   }

//   cargarValoresPorDefecto() {
//     this.configService.obtener().subscribe({
//       next: (config) => {
//         this.productoForm.patchValue({
//           ajuste_efectivo_valor: config.porcentaje_efectivo,
//           ajuste_tarjeta_valor: config.porcentaje_tarjeta,
//           ajuste_tarjeta_local_valor: config.porcentaje_local,
//           ajuste_efectivo_tipo: 'DESCUENTO',
//           ajuste_tarjeta_tipo: 'RECARGO',
//           ajuste_tarjeta_local_tipo: 'RECARGO',
//           tiene_iva: false,
//           ganancia: 0
//         });
//         // IMPORTANTE: Recalcular para que se llenen los previews
//         this.calcularPrecios(); 
//       },
//       error: (err) => console.error('Error config', err)
//     });
//   }

//   initForm() {
//     this.productoForm = this.fb.group({
//       nombre: ['', [Validators.required, Validators.minLength(3)]],
//       descripcion: [''],
//       codigo_barra: [''],
//       codigo_proveedor: [''],
//       proveedor: ['', Validators.required],
//       categoria: ['', Validators.required],
//       stock: [0, [Validators.required, Validators.min(0)]],
//       stock_minimo: [1, [Validators.required, Validators.min(0)]],
//       precio_compra: [0, [Validators.required, Validators.min(0)]],
//       tiene_iva: [false],
//       ganancia: [0, [Validators.required, Validators.min(0)]],
      
//       ajuste_efectivo_tipo: ['DESCUENTO'],
//       ajuste_efectivo_valor: [0],
//       ajuste_tarjeta_tipo: ['RECARGO'],
//       ajuste_tarjeta_valor: [0],
//       ajuste_tarjeta_local_tipo: ['RECARGO'],
//       ajuste_tarjeta_local_valor: [0],

//       precio_venta_base: [{ value: 0, disabled: true }],
//       precio_efectivo: [{ value: 0, disabled: true }],
//       precio_tarjeta: [{ value: 0, disabled: true }],
//       precio_tarjeta_local: [{ value: 0, disabled: true }],
      
//       activo: [true],
//       imagenUrl: [''],
//       publicarEnWeb: [false]
//     });
//   }
//   // --- NUEVA FUNCIÓN DE SUBIDA BLINDADA DEFINITIVA ---
//   onFileSelected(event: any) {
//     const file: File = event.target.files[0];
//     if (!file) return;

//     // 1. Iniciamos la carga forzando la sincronización visual inmediata
//     this.ngZone.run(() => {
//       this.imagenCargando = true;
//       this.cd.detectChanges(); // Dibuja el botón "Subiendo..."
//     });

//     // 2. Llamada asíncrona al backend
//     this.productoService.subirImagen(file).subscribe({
//       next: (res) => {
//         // 3. LA MAGIA: setTimeout a 0 ms lo convierte en una "Macro-tarea"
//         // Esto es 100% infalible contra el congelamiento del explorador de archivos
//         setTimeout(() => {
//           this.productoForm.patchValue({ imagenUrl: res.url });
//           this.imagenCargando = false;
//           this.notificationService.show('Imagen subida y optimizada con éxito', 'success');
          
//           // 4. Orden explícita al componente para que dibuje la foto y libere el botón
//           this.cd.detectChanges(); 
//         }, 0);
//       },
//       error: (err) => {
//         setTimeout(() => {
//           console.error('Error Cloudinary:', err);
//           this.imagenCargando = false;
//           this.notificationService.show('Error al subir la imagen', 'error');
//           this.cd.detectChanges();
//         }, 0);
//       }
//     });

//     // 5. Vaciamos el input nativo. Esto permite que el evento (change) 
//     // vuelva a funcionar si el usuario vuelve a seleccionar el mismo archivo.
//     event.target.value = '';
//   }



//   suscribirCambios() {
//     this.productoForm.valueChanges.subscribe(() => {
//        this.calcularPrecios();
//     });
//   }

//   calcularPrecios() {
//     const form = this.productoForm.getRawValue();

//     // 1. Calcular Costo
//     let costo = Number(form.precio_compra) || 0;
//     if (form.tiene_iva) {
//       costo = costo * 1.21;
//     }

//     // 2. Calcular Base (CORREGIDO: Usar Margen / División)
//     const gananciaPorcentaje = Number(form.ganancia) || 0;
//     const porcentajeDecimal = gananciaPorcentaje / 100;
    
//     let precioBase = 0;
    
//     // Fórmula Excel: Costo / (1 - %Ganancia)
//     if (porcentajeDecimal >= 1) {
//       precioBase = costo * 2; // Protección
//     } else {
//       precioBase = costo / (1 - porcentajeDecimal);
//     }
    
//     // APLICAR REDONDEO EXCEL AL PRECIO BASE
//     precioBase = this.redondearComoExcel(precioBase);

//     // 3. Calcular Finales (Usando la nueva base redondeada)
//     const pEfectivo = this.aplicarRegla(precioBase, form.ajuste_efectivo_tipo, Number(form.ajuste_efectivo_valor));
//     const pTarjeta = this.aplicarRegla(precioBase, form.ajuste_tarjeta_tipo, Number(form.ajuste_tarjeta_valor));
//     const pLocal = this.aplicarRegla(precioBase, form.ajuste_tarjeta_local_tipo, Number(form.ajuste_tarjeta_local_valor));

//     // --- ACTUALIZAMOS LAS VARIABLES VISUALES (PREVIEWS) ---
//     this.previewCosto = costo;
//     this.previewPrecioBase = precioBase;
//     this.previewEfectivo = pEfectivo;
//     this.previewTarjeta = pTarjeta;
//     this.previewTarjetaLocal = pLocal;

//     // 4. Actualizar Formulario
//     this.productoForm.patchValue({
//       precio_venta_base: precioBase,
//       precio_efectivo: pEfectivo,
//       precio_tarjeta: pTarjeta,
//       precio_tarjeta_local: pLocal
//     }, { emitEvent: false });
//   }

//   aplicarRegla(base: number, tipo: string, valor: number): number {
//     if (!valor) return base;
//     let resultado = base;
//     if (tipo === 'DESCUENTO') resultado = base * (1 - valor / 100);
//     if (tipo === 'RECARGO') resultado = base * (1 + valor / 100);
    
//     return this.redondearComoExcel(resultado);
//   }

//   // NUEVA FUNCIÓN DE REDONDEO (Reemplaza a la anterior 'redondear')
//   redondearComoExcel(valor: number): number {
//     // Redondea hacia arriba al mil más cercano
//     return Math.ceil(valor / 1000) * 1000;
//   }

//   cargarProducto(id: number) {
//     this.loading = true;
//     this.productoService.getOne(id).subscribe({
//       next: (producto) => {
//         const productoData = {
//             ...producto,
//             descripcion: producto.descripcion || '' // <--- Asignamos la descripción aquí
//         };
//         this.productoForm.patchValue(productoData);
//         this.calcularPrecios(); // Recalcula las previews con los datos cargados
//         this.loading = false;
//       },
//       error: (err) => {
//         this.notificationService.show('Error al cargar producto', 'error');
//         this.loading = false;
//         this.router.navigate(['/admin/productos']);
//       }
//     });
//   }

//   guardarProducto() {
//     if (this.productoForm.invalid) {
//       this.productoForm.markAllAsTouched();
//       this.notificationService.show('Completa los campos requeridos', 'error');
//       return;
//     }

//     this.loading = true;
//     const productoData = this.productoForm.getRawValue();

//     if (this.isEditMode && this.productId) {
//       this.productoService.update(this.productId, productoData).subscribe({
//         next: () => {
//           this.notificationService.show('Producto actualizado', 'success');
//           this.router.navigate(['/admin/productos']);
//         },
//         error: () => {
//           this.notificationService.show('Error al actualizar', 'error');
//           this.loading = false;
//         }
//       });
//     } else {
//       this.productoService.create(productoData).subscribe({
//         next: () => {
//           this.notificationService.show('Producto creado', 'success');
//           this.router.navigate(['/admin/productos']);
//         },
//         error: () => {
//           this.notificationService.show('Error al crear', 'error');
//           this.loading = false;
//         }
//       });
//     }
//   }

//   abrirModalImpresion() {
//     const form = this.productoForm.getRawValue();
//     this.printConfig.nombre = form.nombre;
//     this.printConfig.ganancia = form.ganancia;
//     this.calcularPrecioImpresion();
//     this.showPrintModal = true;
//   }

//   cerrarModalImpresion() {
//     this.showPrintModal = false;
//   }

//   calcularPrecioImpresion() {
//     const form = this.productoForm.getRawValue();
    
//     let costo = Number(form.precio_compra) || 0;
//     if (form.tiene_iva) {
//       costo = costo * 1.21;
//     }

//     const gananciaNum = Number(this.printConfig.ganancia) || 0;
//     const porcentaje = gananciaNum / 100;
    
//     let precioBaseCalculado = 0;
    
//     if (porcentaje >= 1) {
//       precioBaseCalculado = costo * 2; 
//     } else {
//       precioBaseCalculado = costo / (1 - porcentaje);
//     }
    
//     const precioBase = this.redondearComoExcel(precioBaseCalculado);

//     this.printConfig.precioEfectivoCalculado = this.aplicarRegla(
//       precioBase, 
//       form.ajuste_efectivo_tipo || 'DESCUENTO', 
//       Number(form.ajuste_efectivo_valor) || 0
//     );
//   }

//   imprimirEtiqueta() {
//     // 1. Obtenemos los valores que el usuario ve en el modal
//     const nombreEtiqueta = this.printConfig.nombre;
//     const precioEtiqueta = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(this.printConfig.precioEfectivoCalculado);
//     const codigoEtiqueta = this.productoForm.get('codigo_barra')?.value || this.productoForm.get('codigo_proveedor')?.value || 'S/C';

//     // 2. Preparamos el canvas
//     const canvas = this.canvasRef.nativeElement;
//     const ctx = canvas.getContext('2d');
//     if (!ctx) return;

//     // Dibujamos fondo blanco
//     ctx.fillStyle = 'white';
//     ctx.fillRect(0, 0, canvas.width, canvas.height);

//     // 3. Recreamos tu diseño del CSS pero en Canvas (Tinta negra)
//     ctx.fillStyle = 'black';

//     // Código (Arriba, chiquito)
//     ctx.font = '16px monospace';
//     ctx.textAlign = 'center';
//     ctx.fillText('Cód: ' + codigoEtiqueta, canvas.width / 2, 40);

//     // Nombre (Centro, bold. Si es largo, lo cortamos rudimentariamente por ahora)
//     ctx.font = 'bold 24px Arial';
//     // Mantenemos solo los primeros 30 caracteres para que no desborde
//     const nombreCorto = nombreEtiqueta.length > 30 ? nombreEtiqueta.substring(0, 30) + '...' : nombreEtiqueta;
//     ctx.fillText(nombreCorto, canvas.width / 2, 100);

//     // Precio (Abajo, muy grande)
//     ctx.font = '900 48px Arial';
//     ctx.fillText(precioEtiqueta, canvas.width / 2, 180);

//     // 4. Convertimos a imagen Base64
//     const imagenBase64 = canvas.toDataURL('image/png').split(',')[1];

//     // 5. Enviamos la imagen al script de Python local
//     this.notificationService.show('Enviando a la impresora...', 'success');
    
//     this.http.post('http://localhost:5000/imprimir', { imagen: imagenBase64 })
//       .subscribe({
//         next: () => {
//           this.notificationService.show('¡Etiqueta impresa con éxito!', 'success');
//           this.cerrarModalImpresion(); // Cerramos el modal solo si se imprimió bien
//         },
//         error: (err) => {
//           console.error(err);
//           this.notificationService.show('Error: Verificá que el script de impresión esté abierto y la impresora conectada por USB.', 'error');
//         }
//       });
//   }

// }
