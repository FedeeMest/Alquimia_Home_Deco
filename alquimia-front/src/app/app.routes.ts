import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { MainLayoutComponent } from './components/layout/main-layout/main-layout';
import { CatalogoPublicoComponent } from './components/catalogo-publico/catalogo-publico';
import { PublicLayoutComponent } from './components/layout/public-layout/public-layout';

export const routes: Routes = [
    // RUTAS PÚBLICAS
    {
    path: 'catalogo',
    component: PublicLayoutComponent,
    children: [
      { path: '', component: CatalogoPublicoComponent }
    ]
    },

    // 1. LOGIN (Carga perezosa)
    { 
        path: 'login', 
        loadComponent: () => import('./components/login/login').then(m => m.LoginComponent) 
    },

    // 2. RUTAS PROTEGIDAS (Todas con Lazy Loading)
    { 
        path: '', 
        component: MainLayoutComponent, // <--- ¡AQUÍ ESTÁ LA CLAVE! 
        canActivate: [authGuard],       // El guardián protege el acceso a todo este bloque
        children: [

            { path: '', redirectTo: 'productos', pathMatch: 'full' },

            // Productos
            { path: 'productos', loadComponent: () => import('./components/producto-list/producto-list').then(m => m.ProductoList) },
            { path: 'productos/nuevo', loadComponent: () => import('./components/producto-form/producto-form').then(m => m.ProductoForm) },
            { path: 'productos/editar/:id', loadComponent: () => import('./components/producto-form/producto-form').then(m => m.ProductoForm) },

            // Herramientas
            { path: 'verificador', loadComponent: () => import('./components/verificador-precio/verificador-precio').then(m => m.VerificadorPrecio) },
            { path: 'cierre-caja', loadComponent: () => import('./components/cierre/cierre').then(m => m.CierreCajaComponent) },
            { path: 'historial-cierres', loadComponent: () => import('./components/cierre-historial/cierre-historial').then(m => m.CierreHistorialComponent) },
            { path: 'carga-camion', loadComponent: () => import('./components/carga-camion/carga-camion').then(m => m.CargaCamionComponent) },
            { path: 'nueva_venta', loadComponent: () => import('./components/nueva_venta/nueva-venta').then(m => m.NuevaVentaComponent) },

            // Ventas
            { path: 'ventas', loadComponent: () => import('./components/venta-list/venta-list').then(m => m.VentaListComponent) },
            { path: 'ventas/:id', loadComponent: () => import('./components/venta-detalle/venta-detalle').then(m => m.VentaDetalleComponent) },

            // Administración
            { path: 'configuracion', loadComponent: () => import('./components/configuracion/configuracion').then(m => m.ConfiguracionComponent) },
            { path: 'metricas', loadComponent: () => import('./components/dashboard/dashboard').then(m => m.DashboardComponent) } 
        ]
    },
    
    { path: '**', redirectTo: 'login' }
];
