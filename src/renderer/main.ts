import { mount } from 'svelte'
import App from './app/App.svelte'
import './estilos/tokens.css'
import './estilos/app.css'

mount(App, { target: document.getElementById('app')! })
