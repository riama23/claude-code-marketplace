# claude-code-marketplace

Marketplace de Claude Code con plugins, mods, conectores y skills. El catálogo está en `.claude-plugin/marketplace.json` y cada elemento vive en su propia carpeta bajo `plugins/`.

## Contenido

### model-switcher (mod)

Añade una fila encima del input del prompt con un botón por cada modelo disponible. La lista se toma de la fila Model de `/config` o, si no está disponible, de una lista fija: Opus, Sonnet, Haiku y Fable. El modelo activo aparece resaltado.

Para cambiar de modelo, haz clic en un botón, o enfoca la fila con `ctrl+x tab` y pulsa su número (`1`–`9`). El cambio es igual que ejecutar `/model <modelo>`: solo afecta a la sesión actual y no modifica tus settings. Mientras Claude está respondiendo, la fila muestra el modelo actual pero sin botones. Si aparece una encuesta, la fila se oculta para dejarle sitio.

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
