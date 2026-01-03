import { Component} from '@angular/core';
import { CommonModule } from '@angular/common'; // <--- Importante para *ngIf
import { RouterOutlet} from '@angular/router'; // <--- Importamos Router
import { ToastComponent } from '../app/components/ui/toast/toast';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet,  ToastComponent], // <--- Agregamos CommonModule
  templateUrl: './app.html',
  styleUrl: './app.css' // Asegúrate de que sea styleUrl (singular) o styleUrls (plural) según tu versión, tu código tenía styleUrl
})
export class App {
  title = 'alquimia-front';
}