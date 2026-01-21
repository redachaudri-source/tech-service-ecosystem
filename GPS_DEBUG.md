# 🐛 DEBUG - GPS Tracking Issues

## Problemas Reportados

### 1. ❌ Web Cliente: Mapa aparece y desaparece
**Causa**: Error al buscar datos en `technician_locations` cuando el técnico aún no ha iniciado GPS
**Solución**: Cambiado `.single()` a `.maybeSingle()` y mejorado manejo de errores

### 2. ❌ Web Técnico: Badge GPS no aparece
**Investigando**: Añadidos console.logs para verificar si el hook se ejecuta

---

## ✅ Cambios Aplicados

### `client_web_portal/src/components/TechLocationMap.jsx`
```javascript
// ANTES (causaba error si no hay datos)
.single()

// AHORA (no causa error si no hay datos)
.maybeSingle()

// Mantiene estado "Localizando técnico..." hasta que haya datos
```

### `admin_panel_web/src/hooks/useLocationTracking.js`
```javascript
// Añadido log de debug
console.log('🔍 useLocationTracking - isActive:', isActive, 'userId:', userId);
```

---

## 🧪 Cómo Verificar

### Web Técnico (`tecnico.fixarr.es`)
1. Abre consola del navegador (F12)
2. Abre un ticket con status "EN CAMINO"
3. **Busca en consola**:
   - `🔍 useLocationTracking - isActive: true, userId: xxx`
   - `🚀 Starting GPS tracking...`
   - `📍 Location updated: ...`
4. **Verifica visualmente**:
   - Badge verde "📡 Ubicación compartida con el cliente"

### Web Cliente (`webcliente.fixarr.es`)
1. Abre consola del navegador (F12)
2. Abre un ticket con status "EN CAMINO"
3. **Busca en consola**:
   - `⏳ Waiting for technician to start GPS tracking...` (si técnico no ha iniciado)
   - `📍 Location update: ...` (cuando técnico envía GPS)
4. **Verifica visualmente**:
   - "Localizando técnico..." (mientras espera)
   - Mapa de Google Maps con marcador negro (cuando hay datos)

---

## 🔍 Posibles Causas si Sigue Fallando

### Si badge GPS no aparece en web técnico:
- ✅ Verificar que `ticket.status === 'en_camino'` (exactamente)
- ✅ Verificar que `user.id` existe
- ✅ Revisar consola para ver logs del hook

### Si mapa sigue desapareciendo en web cliente:
- ✅ Verificar que técnico ha iniciado GPS (debe haber fila en `technician_locations`)
- ✅ Revisar errores de Google Maps API en consola
- ✅ Verificar que API key tiene permisos correctos

---

## 📋 Próximo Paso

**Haz push y prueba** con consola abierta. Envíame los logs que veas.
