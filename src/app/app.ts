import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RsToastHost } from 'custom-components';

import { Footer } from './layout/footer';
import { Header } from './layout/header';

/** App-Shell: Kopfzeile, Seiteninhalt, Fußzeile und der einzige Toast-Host der Anwendung. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, RsToastHost],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
