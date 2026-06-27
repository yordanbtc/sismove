// app.js - LÓGICA PRINCIPAL DE LA APP DE EMERGENCIA
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- ESTADO DE LA APLICACIÓN Y PAGINACIÓN ---
let currentView = 'help';
let currentPage = 1;
let totalPages = 1;
const ITEMS_PER_PAGE = 10;


// --- CONTROL DE VENTANAS MODALES ---
function openModal(id) { 
    document.getElementById(id).style.display = "block"; 
}

function closeModal(id) { 
    document.getElementById(id).style.display = "none"; 
}

async function loadModals() {
    try {
        const response = await fetch('modal-frm.html');
        const data = await response.text();
        document.getElementById('modal-container').innerHTML = data;
    } catch (error) {
        console.error("Error al cargar los modales:", error);
    }
}

// --- ACTUALIZACIÓN DE ESTADÍSTICAS ---
async function updateStats() {
    // Obtenemos los conteos agrupados por estado
    const { data, error } = await supabaseClient
        .from('affected_people')
        .select('status'); 

    if (!error && data) {
        // Contamos manualmente los resultados recibidos
        const stats = {
            MISSING: data.filter(p => p.status === 'MISSING').length,
            FOUND: data.filter(p => p.status === 'FOUND').length,
            DEAD: data.filter(p => p.status === 'DEAD').length
        };

        // Actualizamos el DOM
        document.getElementById('count-missing').textContent = stats.MISSING;
        document.getElementById('count-found').textContent = stats.FOUND;
        document.getElementById('count-dead').textContent = stats.DEAD;
    }
}

// --- NAVEGACIÓN ENTRE VISTAS ---

function switchView(view) {
    currentView = view;
    currentPage = 1; 
    
    const btnMissing = document.getElementById('btn-view-missing');
    const btnHelp = document.getElementById('btn-view-help');
    
    if (btnMissing) btnMissing.classList.toggle('active', view === 'missing');
    if (btnHelp) btnHelp.classList.toggle('active', view === 'help');

    // Limpiar búsqueda al cambiar de vista
    const searchInput = document.getElementById('search-input');
    if(searchInput) {
        searchInput.value = '';
        // Cambiar placeholder según la vista
        searchInput.placeholder = (view === 'missing') 
            ? "Escribe nombre o apellido..." 
            : "Escribe la localidad o sector...";
    }

    // SIEMPRE mostrar la sección de búsqueda
    document.getElementById('search-section').style.display = 'block';

    if (view === 'missing') {
        loadRecentMissing();
    } else {
        document.getElementById('pagination-container').style.display = 'none';
        loadHelpRequests();
    }
}

// Carga de solicitudes de ayuda
async function loadHelpRequests() {
    // 1. Aseguramos visibilidad
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.style.display = 'block'; 
    document.getElementById('search-section').style.display = 'block'; // Ocultar esto si no quieres buscador en ayuda
    
    resultsContainer.innerHTML = '<p class="info-text">Cargando solicitudes...</p>';
    
    const { data, error } = await supabaseClient
        .from('help_requests')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        resultsContainer.innerHTML = '<p class="info-text">Error al cargar.</p>';
        return;
    }

    // 2. Renderizar
    renderHelpCards(data);
}

// Renderizado de tarjetas de ayuda (con traducción de etiquetas)
function renderHelpCards(requests) {
    if (requests.length === 0) {
        resultsContainer.innerHTML = '<p class="info-text">No hay solicitudes registradas.</p>';
        return;
    }
    
    const labels = {
        'WATER': '💧 Agua Potable',
        'SHELTER': '⛺ Refugio/Carpa',
        'HEALTH': '🚑 Salud/Médico',
        'RESCUE': '🦺 Rescate',
        'GENERAL': '📢 Apoyo General'
    };

    resultsContainer.innerHTML = '';
    requests.forEach(req => {
        const card = document.createElement('div');
        card.className = 'card card-help';
        card.innerHTML = `
            <h3>${labels[req.category] || req.category}</h3>
            <p><strong>Fecha:</strong> ${formatDate(req.created_at)}</p>
            <p><strong>Persona:</strong> ${req.contact_name}</p>
            <p><strong>Ubicación:</strong> ${req.location}</p>
            <p><strong>Detalle:</strong> ${req.case_description}</p>
            <p><strong>Contacto:</strong> <a href="tel:${req.phone}">${req.phone}</a></p>
        `;
        resultsContainer.appendChild(card);
    });
}

// Escuchar clics fuera de las ventanas modales para cerrarlas
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
}

// Ocultar/Mostrar dinámicamente el campo Cédula
function toggleDniField() {
    const checkbox = document.getElementById('m-has-id');
    if (!checkbox) return;
    
    const container = document.getElementById('dni-field-container');
    const dniInput = document.getElementById('m-dni');
    
    if (checkbox.checked) {
        container.style.display = "block";
        dniInput.setAttribute('required', 'true');
    } else {
        container.style.display = "none";
        dniInput.removeAttribute('required');
        dniInput.value = '';
    }
}

// --- DELEGACIÓN DE EVENTOS ---
document.addEventListener('submit', async (e) => {
    
    // 1. MANEJO: REPORTE DE DESAPARECIDO
    if (e.target.id === 'form-missing') {
        e.preventDefault();

        const userIp = await getClientIP(); 
        const userAgent = navigator.userAgent; // Capturamos el navegador/dispositivo
        const status = document.getElementById('m-status').value;        
        const firstName = document.getElementById('m-firstname').value.trim();
        const lastName = document.getElementById('m-lastname').value.trim();
        const hasId = document.getElementById('m-has-id').checked;
        const dni = hasId ? document.getElementById('m-dni').value.trim() : null;
        const location = document.getElementById('m-location').value.trim();
        const description = document.getElementById('m-description').value.trim();
        const phone = document.getElementById('m-phone').value.trim();

        const { error } = await supabaseClient.from('affected_people').insert([{
            status: status,
            first_name: firstName,
            last_name: lastName,
            has_id: hasId,
            dni: dni,
            last_seen_location: location,
            description: description,
            contact_phone: phone,
            ip_address: userIp,       // NUEVO: Asegúrate de tener esta columna en la tabla
            user_agent: userAgent
        }]);

        if (error) {
            alert(error.code === '23505' ? 'Atención: Ya existe un registro con ese DNI.' : 'Error: ' + error.message);
        } else {
            alert('Reporte registrado exitosamente.');
            e.target.reset();
            closeModal('modal-missing');
            loadRecentMissing();
            updateStats();
        }
    }

    // 2. MANEJO: SOLICITUD DE AYUDA
    if (e.target.id === 'form-help') {
        e.preventDefault();

        const userIp = await getClientIP(); 
        const userAgent = navigator.userAgent; // Capturamos el navegador/dispositivo

        const { error } = await supabaseClient.from('help_requests').insert([{
            contact_name: document.getElementById('h-name').value.trim(),
            phone: document.getElementById('h-phone').value.trim(),
            location: document.getElementById('h-location').value.trim(),
            category: document.getElementById('h-category').value,
            case_description: document.getElementById('h-description').value.trim(),
            ip_address: userIp,       
            user_agent: userAgent     
        }]);

        if (error) {
            alert('Error al registrar solicitud: ' + error.message);
        } else {
            alert('Solicitud enviada con éxito.');
            e.target.reset();
            closeModal('modal-help');
        }
    }
});

// --- SISTEMA DE BÚSQUEDA Y RENDERIZADO ---
const searchInput = document.getElementById('search-input');
const resultsContainer = document.getElementById('results-container');

searchInput.addEventListener('input', (e) => {
    const term = e.target.value.trim();
    
    if (currentView === 'missing') {
        // Lógica existente para desaparecidos
        currentPage = 1;
        if (term.length > 2) {
            searchPeople(term);
        } else if (term.length === 0) {
            loadRecentMissing();
        }
    } else if (currentView === 'help') {
        // NUEVA LÓGICA: Búsqueda por localidad
        if (term.length > 2) {
            searchHelpByLocation(term);
        } else if (term.length === 0) {
            loadHelpRequests();
        }
    }
});

// Nueva función para buscar ayuda por ubicación
async function searchHelpByLocation(term) {
    resultsContainer.innerHTML = '<p class="info-text">Buscando en esa ubicación...</p>';
    const { data, error } = await supabaseClient
        .from('help_requests')
        .select('*')
        .ilike('location', `%${term}%`) // Busca el término dentro de la columna location
        .order('created_at', { ascending: false });

    if (error) {
        resultsContainer.innerHTML = '<p class="info-text">Error de búsqueda.</p>';
    } else {
        renderHelpCards(data);
    }
}

async function searchPeople(term) {
    resultsContainer.innerHTML = '<p class="info-text">Buscando...</p>';
    const { data, error } = await supabaseClient
        .from('affected_people')
        .select('*')
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
        .order('status', { ascending: false });

    if (error) {
        resultsContainer.innerHTML = '<p class="info-text">Error de búsqueda.</p>';
    } else {
        renderCards(data); // La paginación no se aplica en la búsqueda para mostrar todos los resultados
    }
}

function renderCards(people) {
    if (people.length === 0) {
        resultsContainer.innerHTML = '<p class="info-text">No se encontraron registros.</p>';
        return;
    }
    resultsContainer.innerHTML = '';
    people.forEach(person => {
        const card = document.createElement('div');
        card.className = `card ${person.status.toLowerCase()}`;
        card.innerHTML = `
            <h3>${person.first_name} ${person.last_name}</h3>
            <p><strong>Fecha:</strong> ${formatDate(person.created_at)}</p>
            <p><strong>DNI:</strong> ${person.dni || 'No posee'}</p>
            <p><strong>Ubicación:</strong> ${person.last_seen_location}</p>
            <p><strong>Detalles:</strong> ${person.description}</p>
            <p><strong>Contacto:</strong> <a href="tel:${person.contact_phone}">${person.contact_phone}</a></p>
            <p><strong>Condición:</strong> <strong>${person.status === 'MISSING' ? '🚨 DESAPARECIDO' : (person.status === 'FOUND' ? '✅ ENCONTRADO' : '🕯️FALLECIDO')}</strong></p>
        `;
        resultsContainer.appendChild(card);
    });
}

async function loadRecentMissing() {
    resultsContainer.innerHTML = '<p class="info-text">Cargando reportes...</p>';
    document.getElementById('search-section').style.display = 'block';
    document.getElementById('actions-section').style.display = 'flex';
    
    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const { data, error, count } = await supabaseClient
        .from('affected_people')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

    if (error) {
        resultsContainer.innerHTML = '<p>Error de conexión.</p>';
        document.getElementById('pagination-container').style.display = 'none';
    } else {
        totalPages = Math.ceil(count / ITEMS_PER_PAGE);
        renderCards(data);
        updatePaginationUI();
        document.getElementById('pagination-container').style.display = data.length > 0 ? 'flex' : 'none';
    }
}

function updatePaginationUI() {
    const pageInfo = document.getElementById('page-info');
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');

    pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;

    prevButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === totalPages;

    // Ocultar paginación si solo hay una página
    const paginationContainer = document.getElementById('pagination-container');
    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
    }
}

// --- CORRECCIÓN EN LA INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    loadModals();
    updateStats();
    
    // Configuración inicial de la vista: Cargar Ayuda por defecto
    const btnHelp = document.getElementById('btn-view-help');
    const btnMissing = document.getElementById('btn-view-missing');
    
    // IMPORTANTE: Aseguramos que el estado sea el correcto
    currentView = 'help'; 
    if (btnHelp) btnHelp.classList.add('active');
    if (btnMissing) btnMissing.classList.remove('active');

    // INICIALIZACIÓN DE PLACEHOLDER PARA AYUDAS
    if (searchInput) {
        searchInput.placeholder = "Escribe la localidad para buscar ayuda...";
    }
    
    loadHelpRequests(); 

    // Eventos de paginación (asegúrate de que los IDs existan en index.html)
    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadRecentMissing();
        }
    });

    document.getElementById('next-page').addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadRecentMissing();
        }
    });
});

// --- OBTENER LA IP ---
async function getClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.warn("No se pudo obtener la IP:", error);
        return '0.0.0.0'; // Valor por defecto si falla
    }
}

// --- FORMATEO DE FECHAS ---
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString('es-ES', options);
}