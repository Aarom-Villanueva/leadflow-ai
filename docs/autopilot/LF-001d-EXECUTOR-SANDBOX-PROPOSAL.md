# LF-001d — Propuesta técnica de aislamiento local del ejecutor (LF-021)

**Estado:** propuesta técnica para revisión independiente. NO implementada, NO instalada, NO construida, NO probada contra un escape real; no autorizada para ejecución.
**Base:** `46c5b4b252dc28173aea95955d86b7c5e40f34db` (merge PR #16 en `main`).
**Responde a:** la fila "Tecnología de aislamiento del ejecutor (contenedor, VM efímera, runner dedicado) y lista de red" de la sección 11 de [`LF-001d-IMPLEMENTATION-DESIGN.md`](LF-001d-IMPLEMENTATION-DESIGN.md), y al control "Aislamiento de red real del ejecutor" de su sección 14. Extiende, sin sustituir, las secciones 1, 2 y 6 de ese mismo documento (componente *Executor sandbox*, fronteras de confianza, permisos y credenciales).
**Autorización que cubre esta entrega:** exclusivamente inspección de solo lectura del entorno de esta sesión y preparación de documentación. NO autoriza instalar herramientas o dependencias, construir infraestructura (namespaces, cgroups, contenedores o VMs reales), ejecutar código no confiable, ni probar escapes.

## 0. Qué autoriza y qué no autoriza este documento

Autoriza: documentar, con evidencia reproducible de comandos de solo lectura, qué mecanismos de aislamiento existen en el entorno de **esta** sesión concreta de Claude Code Cloud, y proponer — sin construirlo — un diseño concreto para un *Executor sandbox* que cumpla las restricciones ya exigidas por `docs/specs/LF-001d.md` §3 y por la sección 6 de `LF-001d-IMPLEMENTATION-DESIGN.md`.

No autoriza: instalar ningún paquete o herramienta, crear ningún namespace/cgroup/contenedor/VM real, ejecutar ningún comando dentro de un sandbox construido, intentar ningún escape, seleccionar el entorno de producción final, provisionar ninguna credencial, ni declarar resuelta la fila correspondiente de la sección 11 de `LF-001d-IMPLEMENTATION-DESIGN.md`. Ningún archivo de código mencionado en la sección 5 existe tras esta entrega.

## 1. Entorno inspeccionado y distinción respecto de otros entornos

Esta propuesta distingue, de forma explícita y permanente, **tres** entornos que nunca deben confundirse:

1. **Esta sesión de Claude Code Cloud** (el entorno realmente inspeccionado aquí, en la nube, Linux).
2. **El equipo del propietario** (Windows, según indica el propio propietario) — un entorno completamente distinto, no inspeccionado desde aquí, con sistema operativo, nivel de privilegio y herramientas disponibles desconocidos.
3. **El futuro entorno de producción real del *Executor sandbox*** (candidatos sin decidir, por ejemplo un runner de GitHub Actions, un contenedor dedicado, o el propio equipo del propietario) — sigue siendo la fila "sin decidir" de la sección 11 de `LF-001d-IMPLEMENTATION-DESIGN.md`; esta propuesta no la resuelve.

Ninguna herramienta, binario o configuración confirmada en (1) se supone presente en (2) o (3). Donde esta propuesta usa (1) como base concreta para proponer un mecanismo, lo señala explícitamente como "confirmado aquí, no verificado en otro entorno".

### 1.1 Evidencia de la inspección (comandos de solo lectura, reproducibles)

Ningún comando siguiente instala, modifica, construye o conecta nada; ninguno imprime un valor de credencial, secreto o variable sensible — solo nombres de variables cuando corresponde, nunca sus valores.

| Comprobación | Comando | Resultado observado |
|---|---|---|
| Kernel/OS | `uname -a`; `cat /etc/os-release` | `Linux vm 6.18.44-fc-v300 ... x86_64`; `Ubuntu 24.04.5 LTS` (el sufijo `-fc-` del kernel sugiere un build de tipo microVM Firecracker, pero esto es una inferencia, no una confirmación directa — ningún comando de este entorno confirma o niega explícitamente el hipervisor que lo contiene) |
| Identidad/privilegio | `id` | `uid=0(root) gid=0(root) groups=0(root)` — este proceso corre como root dentro de su propio contenedor/VM |
| Indicadores de contenedor | `ls /.dockerenv`; `ls /run/.containerenv`; `cat /proc/1/cgroup`; `systemd-detect-virt` | Ni `/.dockerenv` ni `/run/.containerenv` existen; `/proc/1/cgroup` no muestra una ruta de contenedor anidado (todas las líneas son `/`); `systemd-detect-virt` responde `docker` como heurística, pero sin `/.dockerenv` esa heurística es, en el mejor caso, indicativa, no una confirmación |
| Capacidades Linux | `cat /proc/self/status \| grep -i cap`; `capsh --decode=<CapEff>` | `CapEff`/`CapBnd` = `0x1fffeffffff`, que `capsh --decode` traduce a prácticamente el conjunto completo de capacidades nativas de Linux, incluidas `cap_sys_admin`, `cap_net_admin`, `cap_sys_ptrace`, `cap_sys_module` — este proceso ya tiene, dentro de su propio kernel/espacio de nombres, privilegio casi total |
| Filtro de syscalls | `cat /proc/self/status \| grep -i seccomp` | `Seccomp: 0`, `Seccomp_filters: 0` — ningún filtro seccomp activo sobre este propio shell |
| Módulos de seguridad Linux (LSM) | `aa-status`; `cat /sys/module/apparmor/parameters/enabled`; `getenforce`; `cat /proc/sys/kernel/yama/ptrace_scope`; `cat /sys/kernel/security/landlock/attribute` | Ninguno de estos binarios/archivos existe en este entorno: ni AppArmor, ni SELinux, ni Yama, ni un atributo de Landlock expuesto — no se detecta ningún LSM activo ni configurable desde dentro de este shell |
| Namespaces de usuario | `cat /proc/sys/user/max_user_namespaces`; `cat /proc/sys/kernel/unprivileged_userns_clone`; `cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns` | `max_user_namespaces` = `64267` (positivo, no deshabilitado administrativamente); las otras dos rutas no existen en este kernel — el knob específico de Ubuntu 24.04 que restringe la creación de namespaces de usuario sin privilegios para procesos confinados por AppArmor no está expuesto aquí (y, al no haber AppArmor cargado, tampoco aplicaría) |
| cgroups | `cat /sys/fs/cgroup/cgroup.controllers`; `ls /sys/fs/cgroup`; comprobación de escritura con `[ -w /sys/fs/cgroup ]` | No existe `cgroup.controllers` en la raíz (no es un sistema cgroup v2 puro); `ls` muestra una jerarquía híbrida/v1 con subárboles `blkio`, `cpu`, `cpuacct`, `cpuset`, `devices`, `freezer`, `memory`, `pids`, `systemd` y un subárbol adicional `unified`; `/sys/fs/cgroup` es escribible desde este shell |
| Binarios candidatos de aislamiento | `command -v <nombre>` para cada herramienta | Presentes: `docker` (solo CLI), `runc` (1.5.2, con `libseccomp 2.5.5` enlazado), `unshare`, `nsenter`, `ctr`, `systemd-run`, `chroot`, `setpriv`, `prlimit`. Ausentes: `podman`, `firejail`, `bwrap` (bubblewrap), `gvisor`/`runsc`, `crun`, `lxc`, `cgcreate`/`cgexec`, y el propio comando `ip` (sin `iproute2` instalado, no hay herramienta directa de namespaces de red) |
| Daemon de Docker | `ls /var/run/docker.sock`; `docker info` | El socket no existe; `docker info` falla al conectar (`dial unix /var/run/docker.sock: connect: no such file or directory`) — el binario `docker` está presente pero **no es funcional** en este entorno: no hay daemon al que hablarle |
| CPU/memoria | `nproc`; `free -h` | 4 vCPU; ~15 GiB RAM, sin swap |
| Límites por proceso | `ulimit -a` | Sin límite de tiempo de CPU (`unlimited`) ni de memoria virtual (`unlimited`); 20000 descriptores de archivo; `core` deshabilitado |
| Disco | `df -h / /tmp` | Una única partición ext4 (`/dev/vda`, 252G) montada tanto en `/` como en `/tmp` — **pero**, según la documentación de este propio entorno de Claude Code Cloud, el límite real de disco escribible es una asignación fija por sesión impuesta por una capa externa que `df` no refleja; `df` por sí solo no es una fuente fiable del límite real |
| Red de la sesión | nombres de variables de entorno (sin imprimir valores): `HTTPS_PROXY`, `NO_PROXY`, y variantes específicas de herramientas (`DOCKER_HTTPS_PROXY`, `CLOUDSDK_PROXY_*`, `npm_config_https_proxy`, etc.) | La sesión completa ya sale a través de un proxy preconfigurado a nivel de la sesión, no del proceso que se proponga como ejecutor; ningún valor de esas variables se inspeccionó ni se imprime aquí |

**Ninguna conexión de red nueva se intentó durante esta inspección** (ni siquiera una resolución DNS de prueba): verificar que una red "denegada por defecto" funciona realmente contra un host concreto exige construir primero el mecanismo de aislamiento (sección 3.3), lo que esta fase no autoriza; intentarlo de todos modos habría sido, en la práctica, "probar un escape" de la propia sesión actual (no del sandbox propuesto, que no existe), exactamente lo que esta autorización prohíbe.

### 1.2 Qué significa realmente esta evidencia

- **La presencia de un binario no implica que el mecanismo esté disponible.** `docker` es el ejemplo más claro: el CLI está instalado, pero sin daemon alcanzable es inútil como mecanismo de aislamiento en este entorno. Esta distinción se aplica por igual a cualquier otra herramienta listada: que `runc`/`unshare`/`chroot` existan en `PATH` no demuestra que, combinados, produzcan un sandbox que realmente contenga un proceso — eso exige construirlo y probarlo, lo que esta fase no autoriza.
- **Este shell ya tiene privilegio casi total y ningún LSM ni seccomp local.** Lo que contiene esta sesión (si algo la contiene) no es visible ni se impone desde dentro de este shell — debe ser una frontera externa (la propia capa de Claude Code Cloud) que esta inspección no puede ver más allá de inferir su existencia por el sufijo del kernel. Cualquier aislamiento adicional para un ejecutor tendría que construirse **nosotros mismos**, dentro de este entorno ya privilegiado, usando namespaces/cgroups/seccomp propios — lo que es una propuesta razonable (sección 3), pero nunca algo "ya dado" por el entorno.
- **Un sandbox construido con namespaces/seccomp/cgroups sobre un único kernel compartido no es equivalente a una frontera de VM/hipervisor.** Si la capa externa que contiene esta sesión es en efecto una microVM, esa es una garantía mucho más fuerte que cualquier namespace que construyamos dentro de un único kernel de invitado: un bug de escalado de privilegios en el kernel compartido rompería un sandbox basado en namespaces pero no, en principio, una frontera de VM separada. Esta propuesta no afirma que ambas garantías sean equivalentes.
- **Nada de esto dice nada sobre el equipo del propietario (Windows).** Un sistema Windows no tiene namespaces de Linux, cgroups, ni los binarios listados arriba de la misma forma; cualquier mecanismo equivalente allí (por ejemplo, Windows Sandbox, un contenedor con Hyper-V, o WSL2 con su propio kernel Linux) tendría que inspeccionarse por separado, en esa máquina, antes de proponer nada concreto para ella. Esta propuesta no lo hace y no debe leerse como si lo hiciera.

### 1.3 Comprobaciones que no pudieron completarse en esta sesión

Durante esta tarea, el propietario reportó observar en su propio cliente avisos de "host bloqueado", "secreto faltante" y "recursos agotados". Ninguno de esos tres avisos se reprodujo directamente dentro de los comandos de solo lectura ejecutados por esta sesión para la tabla de la sección 1.1 (todos fueron operaciones locales: lectura de `/proc`, `/sys`, `/etc`, y `command -v`/`docker info` contra un socket local inexistente — ninguna requirió una credencial ni una conexión de red saliente nueva). Se documentan aquí, explícitamente, como observación del propietario sobre su propio entorno/cliente, no como un hallazgo reproducido por esta inspección:

- **Operación intentada y para qué:** ninguna operación de esta inspección intentó alcanzar un host externo nuevo ni leer un secreto; toda la evidencia de la sección 1.1 proviene de archivos locales (`/proc`, `/sys`, `/etc/os-release`) y de invocar binarios ya instalados contra recursos locales (el socket de Docker, inexistente).
- **Host exacto bloqueado:** no identificable desde esta sesión — ningún comando de esta inspección registró un intento de red hacia un host específico que pueda citarse aquí sin especular.
- **Qué comprobación no se pudo completar y cómo limita la propuesta:** no se verificó, ni se intentó verificar, si un comando de prueba lograría o no salir a la red desde dentro de esta sesión, ni si falta algún secreto que un paso posterior (fuera del alcance de esta propuesta) pudiera requerir. Esto no limita las conclusiones de la sección 1.1 (que son sobre mecanismos locales, no sobre conectividad externa), pero sí significa que esta propuesta **no** incluye ninguna medición de la política de red de esta sesión en sí misma — esa política ya es responsabilidad de la capa de Claude Code Cloud, es ortogonal a si el *Executor sandbox* propuesto en la sección 3.3 funcionaría, y no se intentó medirla para evitar ampliar el uso de red más allá de lo ya autorizado.

Ningún aviso de secreto faltante observado por el propietario se interpreta aquí como una necesidad de credencial para el ejecutor: el diseño de LF-001d (sección 6 de `LF-001d-IMPLEMENTATION-DESIGN.md`) exige exactamente lo contrario — el ejecutor nunca recibe ninguna credencial — y esta propuesta lo reafirma en la sección 3.7 sin pedir ninguna.

## 2. Fronteras de confianza (extiende la sección 2 de `LF-001d-IMPLEMENTATION-DESIGN.md`)

```text
Provider invocation (confiable; ya implementado por LF-019)
       |
       v
=====================================================================
  FRONTERA DEL EXECUTOR SANDBOX (propuesta de esta entrega)

  Lanzador confiable (fuera del sandbox; privilegios del entorno host)
       |  construye, antes de iniciar el proceso del agente:
       |   - espacio temporal descartable (3.1)
       |   - vista de sistema de archivos restringida (3.2)
       |   - namespace de red vacío (3.3)
       |   - namespace de procesos propio (3.4)
       |   - temporizador/señal de corte duros (3.5)
       |   - cgroup con límites de memoria/CPU (3.6)
       |   - entorno con lista blanca, sin credenciales (3.7)
       v
  Proceso del agente (NO CONFIABLE: su texto, código generado y
  salida son siempre datos no confiables; nunca recibe ninguna
  credencial; sin red; sin vista del resto del filesystem del host)
=====================================================================
       |
       v
Publisher (confiable; ya implementado por LF-020; recibe solo datos)
```

El "lanzador confiable" vive FUERA del sandbox que construye, con los privilegios del entorno donde corre (en esta sesión, privilegios casi completos — sección 1.1). Esto introduce una responsabilidad nueva y explícita que ninguna sección anterior del diseño necesitaba precisar: el propio lanzador debe demostrarse que nunca expone al proceso que arranca ninguna credencial, archivo o capacidad que ese proceso no deba tener — construir el sandbox no es solo "lanzar con unshare", es también "nunca heredar `process.env` completo", "nunca montar el checkout real", "nunca pasar un descriptor de archivo abierto hacia un secreto". Ninguna de las dos mitades (namespaces del kernel, disciplina del lanzador) sustituye a la otra.

### Limitaciones reales, ya conocidas sin construir nada

- **Un sandbox de namespaces/seccomp/cgroups comparte el kernel del host.** No es una frontera de VM. Si la capa externa que contiene esta sesión es en efecto una microVM (sección 1.2), construir un segundo sandbox *dentro* de ella con namespaces es una capa adicional razonable, pero su resistencia a un bug del kernel compartido es estrictamente menor que la de la propia microVM. Esta propuesta no sustituye una por la otra ni las presenta como equivalentes.
- **El lanzador necesita privilegios que el proceso que arranca no debe tener.** En esta sesión eso es gratuito (ya somos `root` con capacidades casi completas); en otro entorno candidato (un runner de GitHub Actions, el equipo del propietario) puede no serlo, y la disponibilidad de `CAP_SYS_ADMIN` o de namespaces de usuario sin privilegios puede variar. Esto es, precisamente, parte de la decisión pendiente de la sección 9.
- **Ejecutar "como una sesión hermana de Claude Code Cloud" no es parte de esta propuesta.** La autorización vigente de LF-001d prohíbe ejecutar otros agentes; esta propuesta describe aislamiento de un **proceso**, no un diseño donde el ejecutor sea otra sesión de un agente de IA.

## 3. Restricciones concretas por dimensión

Cada subsección da: **(a)** el mecanismo propuesto, **(b)** su disponibilidad confirmada u observada en esta sesión (nunca en otro entorno), **(c)** qué queda explícitamente sin verificar. Ningún punto marcado "no verificado" se cuenta como resuelto.

### 3.1 Escritura — restringida a un espacio temporal descartable

**Propuesta:** cada intento recibe un árbol nuevo, vacío, con nombre no predecible, asignado por el lanzador (nunca elegido por el agente); el checkout de la rama de la tarea vive solo dentro de ese árbol; al terminar el intento (éxito, fallo o cancelación) el árbol completo se destruye y nunca se reutiliza entre tareas o intentos.
**Disponibilidad aquí:** los primitivos para crearlo (`mkdir` con nombre aleatorio bajo un `/tmp` dedicado) existen trivialmente; lo que NO está confirmado es que ese árbol quede efectivamente aislado de todo lo demás sin un mount namespace propio (sección 3.2) — un simple directorio por convención no es una restricción de escritura real si el proceso puede escribir fuera de él.
**Sin verificar:** si un `mount --bind`/`unshare --mount` realmente impide escribir fuera del árbol asignado desde dentro de este entorno concreto.

### 3.2 Sistema de archivos — ninguna vista del checkout real ni del resto del host

**Propuesta:** el proceso no confiable nunca ve el checkout real del repositorio (el que contiene `docs/HANDOFF.md`, `docs/autopilot/BACKLOG.json`, configuración del lanzador, etc.); recibe una exportación (`git archive` o checkout aislado) de únicamente los `scope_files` de su tarea más lo estrictamente necesario para ejecutar, dentro de un *mount namespace* propio con `chroot`/`pivot_root` al árbol de 3.1 como raíz — nunca mediante una convención de "no tocar esa carpeta".
**Disponibilidad aquí:** `unshare --mount`, `chroot` y `runc` (que sabe hacer `pivot_root` de forma correcta en un bundle OCI) están presentes.
**Sin verificar:** que, combinados, de verdad impidan leer o escribir cualquier ruta fuera del árbol asignado desde dentro de este entorno — eso exige construir el namespace y comprobar un intento de traversal real, lo que esta fase no autoriza (ver sección 6, caso 1, como prueba pendiente).

### 3.3 Red — denegada por defecto, sin excepción implícita

**Propuesta:** el proceso no confiable se lanza en su propio *network namespace*, sin interfaz alguna más allá de `loopback` (ni siquiera una ruta por defecto), de modo que cualquier resolución DNS o conexión saliente falle de inmediato; cualquier excepción futura se enumeraría y aprobaría explícitamente antes de habilitarla, nunca por defecto ni por "lo que el agente dice que necesita".
**Disponibilidad aquí:** `unshare --net` no depende de `iproute2` para *crear* el namespace (el namespace existe aunque no haya `ip` para inspeccionarlo o configurarlo), así que la ausencia de `ip` en este entorno no bloquea necesariamente la creación de un namespace de red vacío — pero sí complica enormemente cualquier configuración de red más fina si alguna vez se autorizara una excepción.
**Sin verificar:** si crear ese namespace aquí realmente deja al proceso sin ninguna salida (ninguna conexión nueva de red se intentó durante esta inspección — sección 1.3); esta es, explícitamente, la comprobación que la sección 14 de `LF-001d-IMPLEMENTATION-DESIGN.md` ya señala como no demostrable con un mock, y tampoco se demuestra aquí.
**Importante — no confundir con la red de esta sesión:** esta sesión de Claude Code Cloud ya sale a través de un proxy preconfigurado (sección 1.1); eso es una propiedad de la sesión completa, impuesta por una capa externa a este shell, y **no** es el mecanismo de "red denegada por defecto para el ejecutor" que exige el diseño — un proxy que permite salida mediada no es lo mismo que la ausencia de cualquier interfaz de red.

### 3.4 Procesos — ningún proceso superviviente, ninguna fuga de PID

**Propuesta:** un *PID namespace* propio por intento, de modo que el proceso del agente y cualquier cosa que genere (subshells, binarios invocados, procesos en segundo plano) sea invisible e inalcanzable fuera de ese namespace, y se destruya entero cuando el namespace se destruye — nunca dependiendo de que el propio agente limpie sus hijos.
**Disponibilidad aquí:** `unshare --pid --fork --mount-proc` es la combinación estándar de Linux para esto; `unshare` está presente.
**Sin verificar:** la combinación real con 3.1–3.3 en este entorno concreto, y si algún proceso nieto podría sobrevivir por una condición de carrera no considerada en esta propuesta.

### 3.5 Tiempo — límite duro, no cooperativo

**Propuesta:** un plazo fijo impuesto desde FUERA del proceso no confiable: el lanzador envía una señal de terminación (y, si no basta, una señal de matado forzoso) tras ese plazo, y **confirma** (releyendo el estado real del proceso/namespace, nunca asumiéndolo) que el árbol de procesos terminó — nunca aceptando que el propio agente "dijo que terminó" como prueba.
**Disponibilidad aquí:** confirmada como primitivo estándar de este Linux (`kill`, lectura de `/proc/<pid>`, o el propio `timeout` de coreutils); lo no verificado es su combinación fiable con un PID namespace (3.4) para garantizar que ningún proceso nieto sobrevive al corte.

### 3.6 Memoria y CPU — límites duros vía cgroup

**Propuesta:** un cgroup dedicado por intento, creado por el lanzador antes de mover el proceso del agente dentro, con un límite de memoria y de CPU; exceder el límite de memoria debe terminar el proceso (OOM del cgroup), no degradar ni afectar al resto del host.
**Disponibilidad aquí:** existe una jerarquía cgroup v1/híbrida montada y `/sys/fs/cgroup` es escribible desde este shell, con subárboles `memory`, `cpu`, `cpuacct`, `pids` presentes.
**Sin verificar:** si de verdad se puede crear un cgroup hijo y mover un PID dentro sin afectar al resto de esta sesión — no se intentó, porque hacerlo ya sería construir infraestructura, prohibido en esta fase.

### 3.7 Credenciales — cero en el entorno, disco, metadatos o logs del ejecutor

**Propuesta (reafirma, sin modificarla, la sección 6 del diseño):** el lanzador construye el entorno del proceso no confiable desde una lista blanca explícita de variables, **nunca** heredando `process.env` completo; nunca copia la clave del proveedor, el `GITHUB_TOKEN` del `Publisher`, ni ningún secreto de los Ledgers hacia ese entorno; el filesystem que el ejecutor ve (3.2) nunca incluye archivos de configuración del lanzador (credenciales de Git, configuración de `docker`, variables propias de la sesión de Claude Code Cloud).
**Disponibilidad aquí:** esto es disciplina de construcción del lanzador, no un primitivo del kernel — no depende de ninguna herramienta ausente en este entorno, pero exige una verificación activa (una prueba que confirme que el entorno hijo real no contiene esas variables) antes de considerarse cumplida.
**Sin verificar:** no se construyó ningún lanzador en esta fase, así que esta disciplina es, todavía, solo una propuesta de diseño, no una propiedad observada de ningún proceso real.

## 4. Mecanismo de cancelación y recogida de evidencias

**Propuesta:** el lanzador mantiene, fuera del espacio de nombres del ejecutor, el identificador del proceso raíz del intento y los identificadores del namespace/cgroup asignados. Cancelar significa: enviar una señal de terminación y, si no basta tras un plazo corto, una señal de matado forzoso al proceso raíz, y destruir el PID namespace completo (lo que arrastra a cualquier proceso nieto, ya que ninguno puede sobrevivir fuera de él). Solo después de **confirmar** (releyendo el estado real, nunca asumiéndolo) que el árbol de procesos terminó, el lanzador libera el espacio descartable de 3.1 y reporta al `scripts/autopilot/pause-controller.mjs` ya implementado por LF-020 que puede proceder con su propia reconciliación de lease y presupuesto — este mecanismo sería exactamente el callback `cancel` y la fuente real detrás de `confirmStopped` que `PauseController.pause()` ya invoca, sin cambiar la lógica estricta de confirmación de LF-020 (solo el booleano `true`, síncrono, confirma).

Las evidencias se registran con la misma disciplina que ya exige el procedimiento de recuperación de la sección 9 del diseño: SHA de la tarea, identificadores del namespace/cgroup/proceso, código de salida real, si se alcanzó algún límite (tiempo/memoria/CPU) según el cgroup, y el motivo de la cancelación — sin secretos. Nunca se borran para "desbloquear" un lease o una reserva de presupuesto.

**Disponibilidad aquí:** los primitivos (señales, lectura de `/proc`, `child_process`/`waitpid` de Node) son estándar en este Linux; lo no verificado es, de nuevo, su combinación real con los namespaces propuestos.

## 5. Archivos exactos previstos para una implementación posterior (NO creados por esta entrega)

| Ruta prevista | Propósito |
|---|---|
| `scripts/autopilot/executor-sandbox.mjs` | Lanzador confiable: construye el espacio descartable, el mount/pid/net namespace, el cgroup y el entorno con lista blanca del intento; expone las funciones que `pause-controller.mjs` ya consume (`cancel`, la fuente real de `confirmStopped`) sin modificar ese módulo |
| `scripts/autopilot/sandbox-fixtures/*.json` | Fixtures offline sintéticos para el plan de pruebas de la sección 6 (comandos de prueba, lista blanca de entorno esperada, escenarios de límite) |
| `tests/coordination/lf-0NN-executor-sandbox.test.mjs` | Pruebas offline/sintéticas de ese lanzador — nombre exacto de archivo (número de tarea) se fija en la propia reserva de esa implementación futura, no en esta propuesta |
| `docs/specs/LF-0NN.md` | Contrato de esa implementación futura: nueva tarea, nueva reserva, nueva revisión independiente |

Ninguna de estas rutas se reserva ni se crea en esta entrega; son candidatas para la propuesta de implementación que el propietario autorice después de revisar este documento, con rutas y reservas propias.

## 6. Plan de pruebas con comandos sintéticos (sin agentes ni modelos)

Mismo espíritu que la sección 13 de `LF-001d-IMPLEMENTATION-DESIGN.md`: cada caso usa un comando sintético fijo, nunca un modelo o agente real, y cada resultado queda **pendiente de ejecutar** hasta que exista una implementación autorizada.

| Caso | Comando sintético | Resultado esperado |
|---|---|---|
| Traversal fuera del árbol descartable | `cat ../../etc/passwd` (o una ruta absoluta fuera del árbol) dentro del sandbox | Falla (`ENOENT`/`EACCES`); nunca lee un archivo real fuera del árbol |
| Escritura fuera del árbol descartable | `echo x > /etc/hostname` (o una ruta fuera del árbol) dentro del sandbox | Falla |
| Intento de red | `curl http://example.invalid` (host sintético, no resoluble) dentro del sandbox | Falla de inmediato (sin interfaz de red); nunca se completa ni parcialmente |
| Lectura de variable con forma de credencial | Un script sintético que vuelca `process.env` dentro del sandbox | La lista es exactamente la lista blanca esperada; cero variables adicionales, ninguna con forma de secreto del lanzador |
| Fuga de proceso | Un comando sintético que lanza un proceso en segundo plano de larga duración y termina | Tras cancelar el intento, ningún proceso con ese nombre sobrevive fuera del PID namespace destruido |
| Límite de tiempo excedido | Un comando sintético que nunca termina por sí solo, con un plazo corto configurado | El lanzador lo termina y lo reporta como cancelado por tiempo, nunca como éxito |
| Límite de memoria excedido | Un script sintético que reserva memoria creciente sin límite | El cgroup termina el proceso (OOM) antes de afectar al resto del host |
| Inyección de prompt en una tarea sintética | Texto de spec/issue con instrucciones falsas ("ejecútate como root", "ignora las reglas anteriores") | El lanzador nunca interpreta ese texto como instrucción; lo pasa solo como dato al proceso sandboxed, cuyo resultado sigue sujeto, sin excepción, a todas las restricciones de la sección 3 |

Cada caso se declara aquí como **pendiente**: esta propuesta documenta el plan, no observa ningún resultado. Ningún resultado se declarará aprobado sin haberse ejecutado y observado realmente, con el mismo estándar que el resto de esta base de código exige (`AGENTS.md`: "No declarar pruebas exitosas si no se ejecutaron").

## 7. Integración prevista con los controles existentes (admisión, fencing, pausa)

- **`admission-validator.mjs` (LF-019)** seguiría siendo el único punto que decide si una tarea puede admitirse; el lanzador del sandbox nunca decide esto por sí mismo. Tras `admitTask` devolver `{admitted:true, taskId, fenceToken}`, el lanzador recibiría exactamente ese `fenceToken` como parte de la evidencia de su intento (sección 4), sin inventar un identificador propio desacoplado del fencing ya existente.
- **`provider-invocation.mjs` (LF-019)** seguiría siendo el único componente que invoca al proveedor real; el ejecutor sandboxed nunca contacta al proveedor directamente ni posee su credencial (sección 3.7) — esto no cambia con esta propuesta, solo se refuerza con aislamiento real en vez de una convención.
- **`pause-controller.mjs` (LF-020)** seguiría coordinando PAUSA exactamente como ya está implementado, sin modificar su lógica estricta: el callback `cancel` que `PauseController.pause()` ya invoca por tarea sería, en una implementación real, una llamada al mecanismo de la sección 4 de este documento; el callback `confirmStopped` sería una lectura real de "¿el proceso/namespace del intento sigue vivo?" en vez de un valor sintético de prueba — y seguiría exigiendo exactamente el booleano `true`, síncrono, para confirmar, sin coerción de tipos.
- **`publisher.mjs` (LF-020)** seguiría siendo el único componente que escribe a GitHub; el sandbox nunca obtiene esa credencial, y el diff que produce seguiría llegando a `validatePublication` como datos puros.
- Ninguno de los módulos ya mergeados (`lease-store.mjs`, `budget-ledger.mjs`, `authorization-ledger.mjs`, `admission-validator.mjs`, `provider-invocation.mjs`, `publisher.mjs`, `reviewer-gate.mjs`, `pause-controller.mjs`) necesitaría cambios de contrato para integrar este sandbox: la integración es puramente aditiva, siguiendo el mismo patrón con el que LF-020 integró sus propios controles sin modificar los de LF-019.

## 8. Criterios observables de aprobación (para una futura implementación, no para esta propuesta)

Una futura implementación de este diseño no se considera aprobada solo por "compilar y pasar pruebas con mocks". Exige, como mínimo:

1. El comando sintético de traversal/lectura/escritura fuera del árbol (sección 6) falla de verdad, verificado ejecutando el lanzador real, no un mock de la función que lo invoca.
2. El comando sintético de red falla de verdad — cero bytes salientes observados desde fuera del sandbox, no solo "cero intentos registrados por el propio agente" (distinción que la sección 14 del diseño ya exige).
3. Ningún proceso del intento sobrevive tras cancelar, verificado contra el host real, no por una afirmación del lanzador.
4. El entorno que ve el proceso no confiable, inspeccionado desde dentro de una prueba automatizada, contiene exactamente la lista blanca esperada — cero variables adicionales.
5. Exceder el límite de tiempo/memoria/CPU termina el intento de forma observable (código de salida, evento de cgroup), nunca silenciosamente ni como éxito.
6. Los cinco puntos anteriores se demuestran en el **entorno real de producción** elegido (sección 9) — una demostración solo en esta sesión de Claude Code Cloud no basta, por las razones de la sección 1.2.
7. Revisión independiente (no por Claude) de la implementación y de la evidencia de los puntos 1–6, y autorización expresa y separada del propietario antes de cualquier ejecución con un agente o proveedor real.

## 9. Decisiones pendientes del propietario

| Decisión | Por qué bloquea | Estado |
|---|---|---|
| Entorno de producción real para el *Executor sandbox* (el equipo del propietario, un runner de GitHub Actions, otra infraestructura) | Esta propuesta solo inspeccionó el entorno de esta sesión de Claude Code Cloud; nada aquí se aplica a otro entorno sin inspeccionarlo primero por separado | Sin decidir |
| Tecnología de aislamiento concreta a construir (namespaces+cgroup+seccomp manual vs. `runc` con un bundle OCI propio vs. una VM efímera distinta de este contenedor) | Condiciona qué pruebas de la sección 6 son aplicables y cuánta ingeniería implica | Sin decidir; esta propuesta documenta primitivos observados aquí, no una elección |
| Si se autoriza instalar o construir algo en el entorno de producción finalmente elegido (p. ej. `iproute2`, un rootfs base para `runc`, herramientas de `cgroup`) | Ninguna instalación ni construcción está autorizada por esta entrega | Pendiente de autorización separada |
| Verificación real de que un namespace/cgroup construido efectivamente cumple cada restricción de la sección 3, no solo que los binarios existen | Esta entrega inspeccionó presencia de herramientas, nunca probó que funcionen como sandbox | Bloqueado por diseño hasta la siguiente autorización |
| Relación entre esta propuesta y la fila "Tecnología de aislamiento del ejecutor" de la sección 11 de `LF-001d-IMPLEMENTATION-DESIGN.md` | Esa fila sigue "sin decidir"; esta propuesta la informa con evidencia concreta, no la resuelve | LF-001d sigue bloqueado |

Mientras cualquiera de estas filas quede sin resolver, LF-001d sigue bloqueado, igual que ya establecen la sección 8 de `docs/specs/LF-001d.md` y la sección 11 de `LF-001d-IMPLEMENTATION-DESIGN.md`.
