# Importar y administrar habilidades

[简体中文](./skills.md) | [English](./skills_en.md) | [日本語](./skills_ja.md) | [한국어](./skills_ko.md) | [Русский](./skills_ru.md) | Español | [Português (Brasil)](./skills_pt.md)

A partir de AnyModelBot 0.1.24, puedes agregar a un bot flujos de trabajo que ya tengas, en forma de paquetes de habilidades ZIP, para tareas como informes semanales, procesamiento de documentos o investigación.

## Importar

1. Abre los ajustes del bot de destino, busca Habilidades y haz clic en Importar ZIP.
2. Selecciona un ZIP local y revisa su nombre, su descripción y el número de archivos. Expande las instrucciones para leerlas completas.
3. Haz clic en Agregar habilidad. El bot puede cargarla cuando una tarea relacionada la necesite.

Cada ZIP contiene una habilidad. `SKILL.md` puede estar en la raíz del ZIP o dentro de una carpeta contenedora. Se conservan los archivos de apoyo, como `scripts/`, `references/` y `assets/`. La importación no se conecta con GitHub ni ejecuta automáticamente scripts de instalación.

`SKILL.md` necesita un encabezado YAML (frontmatter) y un cuerpo con las instrucciones, por ejemplo:

```markdown
---
name: weekly-report
description: Redacta informes semanales a partir de las notas de trabajo del usuario.
---

Organiza el trabajo terminado, los problemas y los planes para la próxima semana, y luego usa el formato que pida el usuario.
```

Los nombres usan letras minúsculas del alfabeto inglés, dígitos y guiones simples, con un máximo de 64 caracteres. Los archivos ZIP pueden pesar hasta 20 MB, con un máximo de 64 MB y 2000 entradas una vez descomprimidos. `SKILL.md` puede pesar hasta 256 KB, y cada bot puede tener hasta 100 habilidades importadas. Si un ZIP contiene varios archivos `SKILL.md`, empaqueta cada habilidad por separado.

## Usar, reemplazar y eliminar

- Una habilidad solo se aplica al bot al que la agregas. Ese bot usa las mismas habilidades en la app y en los canales de chat.
- Desde la lista, puedes ver las instrucciones y activar, desactivar o eliminar habilidades. Los cambios esperan a que el bot esté inactivo.
- Para reemplazar una habilidad, vuelve a importar una con el mismo nombre, revísala y haz clic en Reemplazar habilidad. El reemplazo conserva su estado activado o desactivado.
- Al eliminar una habilidad se borran sus archivos, pero se conserva lo que ya se generó en el espacio de trabajo.
- Los nombres integrados como `media`, `computer-use` y `amb-app`, así como las habilidades que aportan los bots del catálogo, no se pueden sobrescribir con paquetes importados.

Las habilidades se ejecutan con los permisos que ya tiene el bot. Una habilidad que necesita Python, otro software o la conexión de una cuenta requiere ese entorno. Las habilidades que dependen de herramientas propias de otro cliente pueden necesitar cambios. Que el formato sea compatible no significa que todas las herramientas de apoyo estén instaladas.

## Almacenamiento

Los paquetes descomprimidos se guardan en `skills/<bot ID>/`, dentro de la carpeta de datos. Las habilidades activadas se copian en `dsh/<bot ID>/skills/` para el entorno de ejecución. La importación solo sube los archivos a la instancia de AnyModelBot que estás usando; en una instalación en servidor, los archivos se guardan en ese servidor. Los nombres y las descripciones de las habilidades activadas, y las instrucciones o referencias que se cargan durante el uso, pasan a formar parte del contexto que se envía al modelo que hayas seleccionado. Consulta [Datos y privacidad](./privacy_es.md).
