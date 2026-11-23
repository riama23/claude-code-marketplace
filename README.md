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

### markdown-toolbar (mod)

Añade una banda encima del input del prompt con las acciones básicas de markdown, agrupadas y con su letra de atajo delante de cada botón:

```
¶  b: B  i: I  s: S  c: `c`  │  k: Link  │  l: •  n: 1.  q: >  p: ```  h: #  │  m: ⚑  │  v: Vista   ctrl+x tab: atajos
```

Cada acción aplica la sintaxis al texto o la quita si ya la tiene, y el input resalta el formato en vivo (negrita en negrita, `código` en color, enlaces subrayados…) con los marcadores atenuados. El mensaje se envía tal cual, como markdown. Con `v` (o `Ctrl+Shift+P`) ves el borrador renderizado como lo verá Claude.

| Tecla | Botón | Acción |
|---|---|---|
| `b` | `B` | `**negrita**` |
| `i` | `I` | `*cursiva*` (al quitar, reconoce también `_cursiva_`) |
| `s` | `S` | `~~tachado~~` |
| `c` | `` `c` `` | `` `código` `` |
| `k` | `Link` | `[texto](url)`: deja el cursor en la URL; si el texto ya es una URL, deja el cursor en el texto. Dentro de un enlace, lo deshace |
| `l` | `•` | `- ` lista (convierte desde numerada) |
| `n` | `1.` | `1. ` lista numerada, renumerada (convierte desde viñetas) |
| `q` | `>` | `> ` cita |
| `p` | ` ``` ` | Bloque de código con fences en líneas propias; dentro de un bloque, quita los fences |
| `h` | `#` | Título: cicla nada → `#` → `##` → `###` → nada |
| `m` | `⚑` | Fija o quita el ancla de selección (con el ancla puesta, el botón dice `⚑ puesta`) |
| `v` | `Vista` | Muestra u oculta la vista previa (activa, el botón dice `Vista ●`) |

**A qué texto se aplica.** El input de la terminal no tiene selección propia, así que el mod usa un ancla:

1. Con el cursor en un extremo, pulsa `m` (o el botón `⚑`): aparece `⚑` en el texto.
2. Mueve el cursor al otro extremo: el rango queda resaltado.
3. Aplica una acción: se aplica a ese rango y el ancla desaparece.

Sin ancla, las acciones inline se aplican a la palabra bajo el cursor (o deshacen el formato si el cursor está dentro o en el borde de un tramo con formato), y sin palabra insertan los marcadores con el cursor en medio. Con un rango, el formato inline no se come los prefijos de línea (`- `, `> `, `# `) y en varias líneas se aplica a cada una. Las acciones de línea (`l`, `n`, `q`, `p`) actúan sobre la línea del cursor o sobre todas las del rango; si todas tienen ya ese formato, lo quitan. El ancla sigue al texto mientras escribes, y se borra al enviar, al recuperar del historial, al deshacer o al vaciar el prompt.

#### Vista previa

Pulsa `v` (o `Ctrl+Shift+P`) para ver el borrador renderizado con el mismo motor que las respuestas de Claude: negritas, listas, bloques de código, tablas… Se actualiza mientras escribes y sigue activa entre mensajes y entre sesiones hasta que la vuelvas a pulsar. El input sigue mostrando el markdown: un mod no puede ocultar los marcadores del input, y el mensaje se envía como markdown.

Dónde se muestra se elige en `/config` (**Vista previa: dónde se muestra**):

- `band` (por defecto): en un recuadro debajo de los botones, justo encima del input. Ocupa como mucho la mitad de la terminal; si el borrador es más largo, se desplaza.
- `pane`: en un panel lateral, al lado del chat en pantalla completa (encima del prompt si la terminal es estrecha). Cerrar el panel (`Ctrl+X X`) apaga la vista previa.

#### Atajos

| Atajo | Qué hace | Configuración |
|---|---|---|
| `Ctrl+Shift+P` | Muestra u oculta la vista previa | Por defecto; se cambia en `/config` (**Atajo de la vista previa**) |
| `Option+E` | Modo formato: la siguiente letra de la tabla aplica su acción | Por defecto; se cambia en `/config` (**Atajo del modo formato**) |
| `Ctrl+X Tab` y la letra | Enfoca la banda; cada letra pulsa su botón | De Claude Code, sin configurar nada |

**Modo formato.** `Option+E` se pulsa desde el propio prompt, sin cambiar el foco. La siguiente letra aplica la acción y no se escribe; cualquier otra tecla sale del modo y se escribe con normalidad. Con el modo activo, `¶ Formato` se resalta en la banda. Un clic en `¶` también lo activa.

**`Ctrl+X Tab`.** Con la banda enfocada, cada letra pulsa su botón y el foco se queda en la banda, así que puedes encadenar varias letras. Pulsa `Esc` para volver a escribir en el prompt: mientras la banda tiene el foco, lo que teclees no llega al prompt.

Mientras Claude responde o hay una encuesta, la banda se oculta y sus atajos no hacen nada. La vista previa en panel sigue visible.

#### Cómo pone el mod sus atajos

Un mod no puede declarar atajos propios con modificadores: sus botones escuchan acciones del engine cuyo handler no existe en el prompt (`v` escucha `diff:back`, del visor de diff antiguo, y `¶` escucha `theme:editCustom`, del selector de tema). Para que haya atajos por defecto, al arrancar el mod añade su línea al bloque `Global` de `~/.claude/keybindings.json`, que Claude Code recarga en caliente:

```json
"ctrl+shift+p": "diff:back",
"meta+e": "theme:editCustom"
```

- Si cambias un atajo en `/config`, el mod quita la línea que puso y escribe la nueva. Vacío: sin atajo.
- Nunca pisa un atajo que ya hace otra cosa: en ese caso avisa con un toast y puedes elegir otro en `/config`.
- Si `keybindings.json` no es JSON válido, no lo toca y avisa.
- Al desinstalar el mod, sus dos líneas se quedan en `keybindings.json`. No hacen nada, porque nadie atiende esas acciones en el prompt. Para quitarlas, vacía los dos atajos en `/config` antes de desinstalar.

**Límites de la terminal:**
- `Ctrl+Shift+P` solo se distingue de `Ctrl+P` en terminales que informan de Shift junto a Ctrl (Ghostty, kitty, WezTerm, iTerm2 con CSI u). En las demás, elige otro atajo en `/config` o usa `v`.
- `Option+E` necesita Option actuando como Meta/Alt. En Ghostty, para usar `Cmd+E`, añade a su config `keybind = super+e=text:\x1be` y recárgala con `Cmd+Shift+,`.
- Dentro del selector de tema, `Option+E` hace lo que hace allí `theme:editCustom` en lugar de activar el modo formato.

Instalación:

```
/plugin install markdown-toolbar --marketplace riama23/claude-code-marketplace
```

Desarrollo local:

```
claude --plugin-dir plugins/markdown-toolbar
claude plugin validate plugins/markdown-toolbar
claude plugin test plugins/markdown-toolbar
```
