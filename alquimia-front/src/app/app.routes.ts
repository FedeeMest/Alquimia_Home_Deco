import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
    // 1. LOGIN (Carga perezosa)
    { 
        path: 'login', 
        loadComponent: () => import('./components/login/login').then(m => m.LoginComponent) 
    },

    // 2. RUTAS PROTEGIDAS (Todas con Lazy Loading)
    { 
        path: '', 
        canActivate: [authGuard], 
        children: [
            { path: '', redirectTo: '/productos', pathMatch: 'full' },
            
            // Productos
            { 
                path: 'productos', 
                loadComponent: () => import('./components/producto-list/producto-list').then(m => m.ProductoList) 
            },
            { 
                path: 'productos/nuevo', 
                loadComponent: () => import('./components/producto-form/producto-form').then(m => m.ProductoForm) 
            },
            { 
                path: 'productos/editar/:id', 
                loadComponent: () => import('./components/producto-form/producto-form').then(m => m.ProductoForm) 
            },

            // Herramientas
            { 
                path: 'verificador', 
                loadComponent: () => import('./components/verificador-precio/verificador-precio').then(m => m.VerificadorPrecio) 
            },
            { 
                path: 'nueva_venta', 
                loadComponent: () => import('./components/nueva_venta/nueva-venta').then(m => m.NuevaVentaComponent) 
            },

            // Ventas
            { 
                path: 'ventas', 
                loadComponent: () => import('./components/venta-list/venta-list').then(m => m.VentaListComponent) 
            },
            { 
                path: 'ventas/:id', 
                loadComponent: () => import('./components/venta-detalle/venta-detalle').then(m => m.VentaDetalleComponent) 
            },

            // Administración
            { 
                path: 'configuracion', 
                loadComponent: () => import('./components/configuracion/configuracion').then(m => m.ConfiguracionComponent) 
            },
            { 
                path: 'metricas', 
                loadComponent: () => import('./components/dashboard/dashboard').then(m => m.DashboardComponent) 
            } 
        ]
    },
    
    { path: '**', redirectTo: 'login' }
];
