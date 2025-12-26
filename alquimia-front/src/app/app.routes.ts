import { Routes } from '@angular/router';
import { ProductoList } from '../app/components/producto-list/producto-list'
import { ProductoForm } from './components/producto-form/producto-form'; // Importar
import { VerificadorPrecio } from './components/verificador-precio/verificador-precio';
import { NuevaVentaComponent } from './components/nueva_venta/nueva-venta';
import { VentaListComponent } from './components/venta-list/venta-list';
import { VentaDetalleComponent } from './components/venta-detalle/venta-detalle';
import { ConfiguracionComponent } from './components/configuracion/configuracion';
import { DashboardComponent } from './components/dashboard/dashboard';
import { LoginComponent } from './components/login/login';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
        { path: 'login', component: LoginComponent }, // Ruta pública

    // Grupo de rutas protegidas
    { 
        path: '', 
        canActivate: [authGuard], // <--- EL GUARDIÁN
        children: [
            { path: '', redirectTo: '/productos', pathMatch: 'full' },
            { path: 'productos', component: ProductoList },
            { path: 'productos/nuevo', component: ProductoForm },
            { path: 'productos/editar/:id', component: ProductoForm },  
            { path: 'verificador', component: VerificadorPrecio },
            { path: 'nueva_venta', component: NuevaVentaComponent },
            { path: 'ventas', component: VentaListComponent },
            { path: 'ventas/:id', component: VentaDetalleComponent },
            { path: 'configuracion', component: ConfiguracionComponent },
            { path: 'metricas', component: DashboardComponent } 
        ]
    },
    
    { path: '**', redirectTo: 'login' } // Cualquier ruta desconocida va al login

];
