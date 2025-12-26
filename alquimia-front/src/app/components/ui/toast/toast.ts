import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed top-5 right-5 z-50 flex flex-col gap-3 pointer-events-none">
      @for (toast of notificationService.toasts(); track toast.id) {
        <div 
          class="pointer-events-auto transform transition-all duration-300 animate-slide-in shadow-lg rounded-lg p-4 text-white min-w-[300px] flex justify-between items-center"
          [class.bg-emerald-500]="toast.type === 'success'"
          [class.bg-red-500]="toast.type === 'error'"
          [class.bg-blue-500]="toast.type === 'info'"
        >
          <div class="flex items-center gap-3">
            @if(toast.type === 'success') {
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            }
            @if(toast.type === 'error') {
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            }
            <span class="font-medium">{{ toast.message }}</span>
          </div>
          
          <button (click)="notificationService.remove(toast.id)" class="text-white/80 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .animate-slide-in {
      animation: slideIn 0.7s ease-out forwards;
    }
  `]
})
export class ToastComponent {
  notificationService = inject(NotificationService);
}