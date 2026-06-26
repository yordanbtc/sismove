// app.js - LÓGICA PRINCIPAL DE LA APP DE EMERGENCIA
// Las variables SUPABASE_URL y SUPABASE_ANON_KEY son leídas desde config.js

// Inicializar el cliente global de Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- CONTROL DE VENTANAS MODALES ---
function openModal(id) { 
    document.getElementById(id).style.display = "block"; 
}

function closeModal(id) { 
    document.getElementById(id).style.display = "none"; 
}

// Ocultar/Mostrar dinámicamente el campo Cédula si es menor o indocumentado
function toggleDniField() {
    const hasId = document.getElementById('m-has-id').checked;
    const container = document.getElementById('dni-field-container');
    const dniInput = document.getElementById('m-dni');
    
    if (hasId) {
        container.style.display = "block";
        dniInput.setAttribute('required', 'true');
    } else {
        container.style.display = "none";
        dniInput.removeAttribute('required');
        dniInput.value = '';
    }
}

// Escuchar clics fuera de las ventanas modales para cerrarlas
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
}


// --- MANEJO DE FORMULARIO: REPORTE DE DESAPARECIDO ---
document.getElementById('form-missing').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const firstName = document.getElementById('m-firstname').value.trim();
    const lastName = document.getElementById('m-lastname').value.trim();
    const hasId = document.getElementById('m-has-id').checked;
    const dni = hasId ? document.getElementById('m-dni').value.trim() : null;
    const location = document.getElementById('m-location').value.trim();
    const description = document.getElementById('m-description').value.trim();
    const phone = document.getElementById('m-phone').value.trim();

    // Guardado directo en la tabla 'affected_people' (inserción pública permitida por RLS)
    const { error } = await supabaseClient.from('affected_people').insert([{
        first_name: firstName,
        last_name: lastName,
        has_id: hasId,
        dni: dni,
        last_seen_location: location,
        description: description,
        contact_phone: phone,
        status: 'MISSING'
    }]);

    if (error) {
        if (error.code === '23505') { // Restricción UNIQUE de la Cédula/DNI activa en base de datos
            alert('Atención: Ya existe una persona registrada en el sistema con ese número de Cédula/DNI.');
        } else {
            alert('No se pudo enviar el reporte: ' + error.message);
        }
    } else {
        alert('Reporte registrado exitosamente en el sistema de emergencia.');
        document.getElementById('form-missing').reset();
        closeModal('modal-missing');
        toggleDniField(); // Resetea el estado del campo DNI a requerido
        loadRecentMissing(); // Actualiza la lista principal al instante
    }
});


// --- MANEJO DE FORMULARIO: SOLICITUD DE AYUDA ---
document.getElementById('form-help').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('h-name').value.trim();
    const phone = document.getElementById('h-phone').value.trim();
    const location = document.getElementById('h-location').value.trim();
    const category = document.getElementById('h-category').value;
    const description = document.getElementById('h-description').value.trim();

    // Guardado directo en la tabla 'help_requests'
    const { error } = await supabaseClient.from('help_requests').insert([{
        contact_name: name,
        phone: phone,
        location: location,
        category: category,
        case_description: description
    }]);

    if (error) {
        alert('Hubo un error al registrar la solicitud: ' + error.message);
    } else {
        alert('Su solicitud de ayuda comunitaria ha sido enviada con éxito.');
        document.getElementById('form-help').reset();
        closeModal('modal-help');
    }
});


// --- SISTEMA DE BÚSQUEDA Y RENDERIZADO ---
const searchInput = document.getElementById('search-input');
const resultsContainer = document.getElementById('results-container');

// Escuchar lo que escribe el usuario (Buscador reactivo)
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.trim();
    if (term.length > 2) { 
        searchPeople(term); 
    } else if (term.length === 0) { 
        loadRecentMissing(); 
    }
});

// Consultar base de datos según coincidencia de nombres o apellidos
async function searchPeople(term) {
    resultsContainer.innerHTML = '<p class="info-text">Buscando en la base de datos...</p>';
    
    const { data, error } = await supabaseClient
        .from('affected_people')
        .select('*')
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
        .order('status', { ascending: false }); // Prioriza los 'MISSING' arriba

    if (error) {
        resultsContainer.innerHTML = '<p class="info-text">Error al realizar la búsqueda.</p>';
        return;
    }
    renderCards(data);
}

// Pintar los datos estructurados en tarjetas visuales
function renderCards(people) {
    if (people.length === 0) {
        resultsContainer.innerHTML = '<p class="info-text">No se encontraron registros activos con ese nombre.</p>';
        return;
    }
    
    resultsContainer.innerHTML = '';
    people.forEach(person => {
        const card = document.createElement('div');
        // Agrega la clase 'missing' o 'found' según corresponda para pintar el borde lateral con CSS
        card.className = `card ${person.status.toLowerCase()}`;
        
        card.innerHTML = `
            <h3>${person.first_name} ${person.last_name}</h3>
            <p><strong>Cédula/DNI:</strong> ${person.dni ? person.dni : 'No posee o menor de edad'}</p>
            <p><strong>Última ubicación:</strong> ${person.last_seen_location}</p>
            <p><strong>Detalles:</strong> ${person.description}</p>
            <p><strong>Contacto familiar:</strong> <a href="tel:${person.contact_phone}">${person.contact_phone}</a></p>
            <p><strong>Condición:</strong> <strong>${person.status === 'MISSING' ? '🚨 DESAPARECIDO' : '✅ ENCONTRADO'}</strong></p>
            ${person.current_location ? `<p><strong>Ubicación actual:</strong> ${person.current_location}</p>` : ''}
        `;
        resultsContainer.appendChild(card);
    });
}

// Cargar por defecto las últimas 10 novedades del sismo
async function loadRecentMissing() {
    const { data, error } = await supabaseClient
        .from('affected_people')
        .select('*')
        .limit(10)
        .order('created_at', { ascending: false });

    if (!error) {
        renderCards(data);
    } else {
        resultsContainer.innerHTML = '<p class="info-text">Error al conectar con la base de datos de emergencia.</p>';
    }
}

// Inicialización de la pantalla al cargar la página
loadRecentMissing();