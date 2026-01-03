import { ApplicationConfig,LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from '../app/interceptors/autn.interceptor';
import { routes } from './app.routes';
import { registerLocaleData } from '@angular/common'; // Para registrar el idioma
import localeEsAr from '@angular/common/locales/es-AR'; // Importamos datos de Argentina


registerLocaleData(localeEsAr, 'es-AR');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: LOCALE_ID, useValue: 'es-AR' } 
  ]
};
