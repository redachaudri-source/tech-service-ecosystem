# 🐛 Dashboard Ticket #51 No Aparece - Debug

## 🔍 Investigación

### Problema
Ticket #51 (Lavadora AEG, asignado para hoy 22/01 01:00):
- ✅ Aparece en "Todos los Servicios"
- ❌ NO aparece en Dashboard "Siguiente Servicio"

### Causa Probable
El filtro del Dashboard compara fechas:
```javascript
const tDate = t.scheduled_at.split('T')[0]; // "2026-01-22"
const todayStr = filterDate; // "2026-01-22"
const isToday = tDate === todayStr;
```

**Posibles problemas**:
1. Formato de fecha diferente
2. Zona horaria (01:00 podría ser día anterior en UTC)
3. `scheduled_at` es `null` o vacío

### Debug Añadido
```javascript
if (t.ticket_number === '51') {
    console.log('🔍 Ticket #51 Debug:', {
        scheduled_at: t.scheduled_at,
        tDate,
        todayStr,
        isToday,
        status: t.status,
        willShow: isToday || isActive
    });
}
```

## 🧪 Próximo Paso

**Haz push y abre Dashboard con consola (F12)**

Busca en consola: `🔍 Ticket #51 Debug:`

Envíame screenshot del log completo.

---

## ⚠️ Nota Importante

**NO he tocado el Dashboard en sesiones anteriores de GPS**. El problema del filtrado ya existía antes. Solo estoy añadiendo logs para identificar la causa exacta.
