import { Component, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common'; // <--- Importante para *ngIf
import { RouterOutlet, Router, NavigationEnd } from '@angular/router'; // <--- Importamos Router
import { NavbarComponent } from '../app/components/layout/navbar.component/navbar.component';
import { ToastComponent } from '../app/components/ui/toast/toast';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, ToastComponent], // <--- Agregamos CommonModule
  templateUrl: './app.html',
  styleUrl: './app.css' // Asegúrate de que sea styleUrl (singular) o styleUrls (plural) según tu versión, tu código tenía styleUrl
})
export class App {
  title = 'alquimia-front';
}