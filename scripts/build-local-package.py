from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json, sys

root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1]).resolve()
files = [root / name for name in ('server.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'INICIAR_CENTRAL_COMERCIAL.bat', 'PREPARAR_CENTRAL_COMERCIAL.bat', 'ACTIVAR_INICIO_AUTOMATICO.bat', 'DESACTIVAR_INICIO_AUTOMATICO.bat')]
extensions = {'.ts', '.tsx', '.js', '.mjs', '.css', '.md', '.bat', '.txt'}
for folder in ('server', 'src', 'desktop', 'email-worker', 'openjarvis-worker', 'dist'):
    for file in (root / folder).rglob('*'):
        relative = file.relative_to(root)
        if not file.is_file() or file.is_symlink() or any(part.startswith('.') or part in ('node_modules', 'private-state', 'central-worker-backups') for part in relative.parts):
            continue
        if folder == 'dist' or file.suffix in extensions:
            files.append(file)
if not (root / 'dist/index.html').exists():
    raise SystemExit('Run npm run build before packaging.')
manifest = {str(file.relative_to(root)).replace('\\', '/'): hashlib.sha256(file.read_bytes()).hexdigest() for file in files}
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, 'Central_Comercial/' + str(file.relative_to(root)).replace('\\', '/'))
    archive.write(root / 'desktop/LEER_PRIMERO.txt', 'Central_Comercial/LEER_PRIMERO.txt')
    archive.writestr('Central_Comercial/CONTENIDO_SHA256.json', json.dumps(manifest, indent=2))
    archive.writestr('Central_Comercial/VERIFICACION.txt', 'Validación del paquete: TypeScript y compilación correctos.\nCircuito completo probado con organizaciones, mensajes, modelo y pagos simulados, en archivos temporales.\nIncluye planificación, búsqueda, email, WhatsApp autorizado, consultas, baja, cliente, cuenta corriente y confirmación manual.\nServidor de producción local, interfaz estática, informe, límite de origen/host y traslado de datos comprobados en un entorno aislado.\nNo se enviaron promociones reales ni se probó el hardware del propietario.\nPendiente en la PC dedicada: instalación, inicio con Windows, voz y validación real de Gmail, WhatsApp y OpenJarvis.\n')
    notices = []
    for name in ('react', 'react-dom', 'lucide-react', '@fontsource/dm-sans', '@fontsource/instrument-serif'):
        for candidate in ('LICENSE', 'LICENSE.txt', 'OFL.txt'):
            file = root / 'node_modules' / name / candidate
            if file.is_file():
                notices.append(name + '\n' + file.read_text() + '\n')
                break
    archive.writestr('Central_Comercial/THIRD_PARTY_LICENSES.txt', '\n'.join(notices))
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert all(not any(part in ('.env', 'private-state', 'data', 'node_modules') for part in name.split('/')) for name in archive.namelist())
print(json.dumps({'file': str(output), 'bytes': output.stat().st_size, 'source_files': len(files)}))
