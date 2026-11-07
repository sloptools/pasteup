import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { app } from './lib/state.svelte'

// Lets scripts drive the app while developing.
if (import.meta.env.DEV) Object.assign(window, { app })

export default mount(App, { target: document.getElementById('app')! })
