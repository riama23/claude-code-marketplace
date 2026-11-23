# claude-code-marketplace

Marketplace de Claude Code con plugins, mods, conectores y skills. El catálogo está en `.claude-plugin/marketplace.json` y cada elemento vive en su propia carpeta bajo `plugins/`.

## Contenido

### model-switcher (mod)

Añade una banda encima del input del prompt. Plegada, muestra una línea resumen como `Opus · Medium · Fast off ▸`. Pulsa `Cmd+M` (o haz clic en la línea) para desplegar el panel, y otra vez `Cmd+M` para plegarlo; funciona aunque tengas texto a medio escribir y no escribe nada en el chat (ver *Atajo de teclado* más abajo):

- **Modelo**: `Opus`, `Sonnet`, `Haiku` y `Fable` (teclas `1`–`4`). Si la familia activa tiene variante de contexto 1M en `/config`, aparece el toggle `1M` (tecla `5`).
- **Effort**: `Auto`, `Low`, `Medium`, `High`, `XHigh` y `Max`. Ejecuta `/effort <nivel>`.
- **Fast**: `On`/`Off`. Ejecuta `/fast`. Si el modelo activo no admite fast mode, la sesión pasa a Opus y el resaltado se actualiza.

Los cambios son como ejecutar el comando a mano: solo afectan a la sesión actual. El effort y el fast mode que se muestran son los últimos que puso el mod (antes de eso, los de tus settings); si los cambias a mano con `/effort` o `/fast`, el resumen no se entera hasta que los vuelvas a tocar desde el panel. Mientras Claude está respondiendo solo se ve el resumen. Si aparece una encuesta, la banda se oculta para dejarle sitio.

#### Atajo de teclado

Un mod no puede declarar atajos propios con modificadores, así que el botón del resumen escucha la acción `app:cycleDiffBase` (que Claude Code solo usa dentro del panel de diff). Asígnale el atajo en `~/.claude/keybindings.json`:

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "bindings": [
    {
      "context": "Global",
      "bindings": { "cmd+m": "app:cycleDiffBase", "meta+m": "app:cycleDiffBase" }
    }
  ]
}
```

En macOS la mayoría de terminales no envían `Cmd` a la aplicación (Cmd+M minimiza la ventana). En Ghostty, haz que Cmd+M envíe `meta+m` añadiendo a su config (`~/Library/Application Support/com.mitchellh.ghostty/config.ghostty`) y recargándola con `Cmd+Shift+,`:

```
keybind = super+m=text:\x1bm
```

En otros terminales, usa `Option+M` activando que Option actúe como Meta/Alt. Limitaciones: con el panel de diff abierto, el atajo cambia la base del diff en lugar del panel; mientras Claude responde o hay una encuesta, no hace nada.

Instalación:

```
/plugin install model-switcher --marketplace riama23/claude-code-marketplace
```

Desarrollo local:

```
claude --plugin-dir plugins/model-switcher
claude plugin validate plugins/model-switcher
claude plugin test plugins/model-switcher
```
