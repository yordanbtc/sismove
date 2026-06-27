// app.js - LÓGICA PRINCIPAL DE LA APP DE EMERGENCIA
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

//==================================
// VARIABLES GLOBALES
//==================================
let currentView = 'help';
let currentPage = 1;
let totalPages = 1;
const ITEMS_PER_PAGE = 10;
let currentUser = null;
let pendingModal = null;

//==================================
// AUTENTICACIÓN
//==================================
async function getCurrentUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    currentUser = user;
    updateAuthUI();
    return currentUser;
}

async function loginGoogle() {
    // Guardar el modal pendiente para recuperarlo tras el callback
    if (pendingModal) {
        localStorage.setItem('pendingModal', pendingModal);
    }
    
    // Usamos una URL de retorno que apunte explícitamente a la raíz del proyecto
    // Esto suele ser más estable para el proceso de callback de Supabase
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + window.location.pathname
        }
    });

    if (error) {
        console.error("Error crítico de Auth:", error.message);
        localStorage.removeItem('pendingModal'); // Limpiar para permitir reintentos
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
    currentUser = null;
    window.location.reload();
}

async function isAuthorizedPersonnel() {
    if (!currentUser) return false;
    const { data, error } = await supabaseClient
        .from('authorized_personnel')
        .select('id')
        .eq('supabase_user_id', currentUser.id)
        .single();
    
    return !error && data !== null;
}

// Escuchar cambios de estado para recuperar el modal pendiente
supabaseClient.auth.onAuthStateChange(async(event, session) => {

    if (event === 'SIGNED_IN') {
        currentUser = session.user;
        updateAuthUI();

        const storedModal = localStorage.getItem('pendingModal');
        if (storedModal) {
            localStorage.removeItem('pendingModal');
            // Esperamos a que los modales se carguen y luego abrimos el pendiente.
            await loadModals(); 
            const modal = document.getElementById(storedModal);
            if (modal) modal.style.display = "block";
        }
    }

    if (event === 'SIGNED_OUT') {

        currentUser = null;

        updateAuthUI();

    }

});

//==================================
// MODALES
//==================================
async function openModal(id) {
    if (!currentUser) {
        pendingModal = id;
        await loginGoogle();
        return;
    }
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

//==================================
// ESTADÍSTICAS Y VISTAS
//==================================
async function updateStats() {
    const { data, error } = await supabaseClient.from('affected_people').select('status');
    if (!error && data) {
        const stats = {
            MISSING: data.filter(p => p.status === 'MISSING').length,
            FOUND: data.filter(p => p.status === 'FOUND').length,
            DEAD: data.filter(p => p.status === 'DEAD').length
        };
        document.getElementById('count-missing').textContent = stats.MISSING;
        document.getElementById('count-found').textContent = stats.FOUND;
        document.getElementById('count-dead').textContent = stats.DEAD;
    }
}

function switchView(view) {
    currentView = view;
    currentPage = 1;
    const btnMissing = document.getElementById('btn-view-missing');
    const btnHelp = document.getElementById('btn-view-help');
    if (btnMissing) btnMissing.classList.toggle('active', view === 'missing');
    if (btnHelp) btnHelp.classList.toggle('active', view === 'help');

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = (view === 'missing') ? "Escribe nombre o apellido..." : "Escribe la localidad o sector...";
    }

    document.getElementById('search-section').style.display = 'block';
    if (view === 'missing') {
        loadRecentMissing();
    } else {
        document.getElementById('pagination-container').style.display = 'none';
        loadHelpRequests();
    }
}

//==================================
// RENDERIZADO Y BÚSQUEDA
//==================================
async function loadHelpRequests() {
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = '<p class="info-text">Cargando solicitudes...</p>';
    const { data, error } = await supabaseClient.from('help_requests').select('*').order('created_at', { ascending: false });
    if (error) { resultsContainer.innerHTML = '<p class="info-text">Error al cargar.</p>'; return; }
    renderHelpCards(data);
}

function renderHelpCards(requests) {
    const resultsContainer = document.getElementById('results-container');
    if (requests.length === 0) { resultsContainer.innerHTML = '<p class="info-text">No hay solicitudes.</p>'; return; }
    const labels = { 'WATER': '💧 Agua', 'SHELTER': '⛺ Refugio', 'HEALTH': '🚑 Salud', 'RESCUE': '🦺 Rescate', 'GENERAL': '📢 General' };
    resultsContainer.innerHTML = '';
    requests.forEach(req => {
        const card = document.createElement('div');
        card.className = 'card card-help';
        card.innerHTML = `<h3>${labels[req.category] || req.category}</h3>
            <p><strong>Fecha:</strong> ${formatDate(req.created_at)}</p>
            <p><strong>Persona:</strong> ${req.contact_name}</p>
            <p><strong>Ubicación:</strong> ${req.location}</p>
            <p><strong>Detalle:</strong> ${req.case_description}</p>
            <p><strong>Contacto:</strong> <a href="tel:${req.phone}">${req.phone}</a></p>`;
        resultsContainer.appendChild(card);
    });
}

function renderCards(people) {
    const resultsContainer = document.getElementById('results-container');
    if (people.length === 0) { resultsContainer.innerHTML = '<p class="info-text">No se encontraron registros.</p>'; return; }
    resultsContainer.innerHTML = '';
    people.forEach(person => {
        const card = document.createElement('div');
        card.className = `card ${person.status.toLowerCase()}`;
        card.innerHTML = `<h3>${person.first_name} ${person.last_name}</h3>
            <p><strong>Fecha:</strong> ${formatDate(person.created_at)}</p>
            <p><strong>DNI:</strong> ${person.dni || 'No posee'}</p>
            <p><strong>Ubicación:</strong> ${person.last_seen_location}</p>
            <p><strong>Condición:</strong> <strong>${person.status === 'MISSING' ? '🚨 DESAPARECIDO' : (person.status === 'FOUND' ? '✅ ENCONTRADO' : '🕯️FALLECIDO')}</strong></p>`;
        resultsContainer.appendChild(card);
    });
}

async function searchHelpByLocation(term) {
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = '<p class="info-text">Buscando...</p>';
    const { data } = await supabaseClient.from('help_requests').select('*').ilike('location', `%${term}%`).order('created_at', { ascending: false });
    renderHelpCards(data || []);
}

async function searchPeople(term) {
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = '<p class="info-text">Buscando...</p>';
    const { data } = await supabaseClient.from('affected_people').select('*').or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`).order('status', { ascending: false });
    renderCards(data || []);
}

//==================================
// FORMULARIOS
//==================================
document.addEventListener('submit', async (e) => {
    if (!currentUser) return; // Seguridad extra

    if (e.target.id === 'form-missing') {
        e.preventDefault();
        const userIp = await getClientIP();
        const { error } = await supabaseClient.from('affected_people').insert([{
            status: document.getElementById('m-status').value,
            first_name: document.getElementById('m-firstname').value.trim(),
            last_name: document.getElementById('m-lastname').value.trim(),
            has_id: document.getElementById('m-has-id').checked,
            dni: document.getElementById('m-dni').value.trim() || null,
            last_seen_location: document.getElementById('m-location').value.trim(),
            description: document.getElementById('m-description').value.trim(),
            contact_phone: document.getElementById('m-phone').value.trim(),
            ip_address: userIp,
            user_agent: navigator.userAgent,
            supabase_user_id: currentUser.id
        }]);
        if (!error) { alert('Registrado exitosamente.'); e.target.reset(); closeModal('modal-missing'); loadRecentMissing(); updateStats(); }
    }

    if (e.target.id === 'form-help') {
        e.preventDefault();
        const userIp = await getClientIP();
        const { error } = await supabaseClient.from('help_requests').insert([{
            contact_name: document.getElementById('h-name').value.trim(),
            phone: document.getElementById('h-phone').value.trim(),
            location: document.getElementById('h-location').value.trim(),
            category: document.getElementById('h-category').value,
            case_description: document.getElementById('h-description').value.trim(),
            ip_address: userIp,
            user_agent: navigator.userAgent,
            supabase_user_id: currentUser.id
        }]);
        if (!error) { alert('Solicitud enviada.'); e.target.reset(); closeModal('modal-help'); }
    }
});

//==================================
// UTILIDADES
//==================================
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function getClientIP() {
    try { const res = await fetch('https://api.ipify.org?format=json'); const data = await res.json(); return data.ip; }
    catch { return '0.0.0.0'; }
}

async function loadRecentMissing() {
    const resultsContainer = document.getElementById('results-container');
    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;
    const { data, count } = await supabaseClient.from('affected_people').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
    totalPages = Math.ceil(count / ITEMS_PER_PAGE);
    renderCards(data || []);
    document.getElementById('pagination-container').style.display = totalPages > 1 ? 'flex' : 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
    await getCurrentUser();
    if (currentUser) {
        await registerAuthorizedPersonnel();
    }
    updateAuthUI();
    await loadModals();
    updateStats();
    
    const searchInput = document.getElementById('search-input');
    loadHelpRequests();

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim();
        if (currentView === 'missing') {
            term.length > 2 ? searchPeople(term) : loadRecentMissing();
        } else {
            term.length > 2 ? searchHelpByLocation(term) : loadHelpRequests();
        }
    });

    document.getElementById('prev-page')?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadRecentMissing(); } });
    document.getElementById('next-page')?.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; loadRecentMissing(); } });
});


function updateAuthUI() {
    const container = document.getElementById("auth-btn-container");

    if (!container) return;

    if (currentUser) {
        container.innerHTML = `
            <span style="margin-right:10px">
                👤 ${currentUser.user_metadata?.full_name || currentUser.email}
            </span>

            <button onclick="logout()" class="btn btn-danger">
                Cerrar sesión
            </button>
        `;
    } else {
        container.innerHTML = `
            <button onclick="loginGoogle()" class="btn btn-danger">
                Iniciar sesión con Google
            </button>
        `;
    }
}

async function registerAuthorizedPersonnel() {

    console.log("=== registerAuthorizedPersonnel ===");
    console.log("currentUser:", currentUser);

    if (!currentUser) return;

    // Verificar si ya existe
        const { data: existing, error: selectError } = await supabaseClient
            .from("authorized_personnel")
            .select("id")
            .eq("supabase_user_id", currentUser.id)
            .maybeSingle();

        console.log("SELECT existing:", existing);
        console.log("SELECT error:", selectError);

        // Solo salir si realmente ya existe
        if (existing) {
            console.log("Ya existe");
            return;
        }

    // Insertar
    const { data, error: insertError } = await supabaseClient
        .from("authorized_personnel")
        .insert({
                supabase_user_id: currentUser.id,
                google_email: currentUser.email,
                google_name:
                    currentUser.user_metadata?.full_name ??
                    currentUser.user_metadata?.name ??
                    currentUser.email
            })
            .select();
            
            console.log("INSERT data:", data);
            console.log("INSERT error:", insertError);


    if (insertError) {
        console.error("Error insertando:", insertError);
    } else {
        console.log("Usuario registrado");
    }

}