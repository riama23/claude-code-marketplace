# claude-code-marketplace

Marketplace de Claude Code con plugins, mods, conectores y skills. El catálogo está en `.claude-plugin/marketplace.json` y cada elemento vive en su propia carpeta bajo `plugins/`.

## Contenido

### model-switcher (mod)

Añade una banda encima del input del prompt. Plegada, muestra una línea resumen como `Opus · Medium · Fast off ▸`. Pulsa `0` con el prompt vacío (o haz clic en la línea) para desplegar el panel, y otra vez `0` para plegarlo:

- **Modelo**: `Opus`, `Sonnet`, `Haiku` y `Fable` (teclas `1`–`4`). Si la familia activa tiene variante de contexto 1M en `/config`, aparece el toggle `1M` (tecla `5`).
- **Effort**: `Auto`, `Low`, `Medium`, `High`, `XHigh` y `Max`. Ejecuta `/effort <nivel>`.
- **Fast**: `On`/`Off`. Ejecuta `/fast`. Si el modelo activo no admite fast mode, la sesión pasa a Opus y el resaltado se actualiza.

Los cambios son como ejecutar el comando a mano: solo afectan a la sesión actual. El effort y el fast mode que se muestran son los últimos que puso el mod (antes de eso, los de tus settings); si los cambias a mano con `/effort` o `/fast`, el resumen no se entera hasta que los vuelvas a tocar desde el panel. Mientras Claude está respondiendo solo se ve el resumen. Si aparece una encuesta, la banda se oculta para dejarle sitio.

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
