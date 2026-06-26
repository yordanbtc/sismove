// Inicializar el cliente de Supabase
const SUPABASE_URL = 'https://tu-proyecto.supabase.co';
const SUPABASE_ANON_KEY = 'tu-anon-key-de-supabase';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Referencias del DOM
const searchInput = document.getElementById('search-input');
const resultsContainer = document.getElementById('results-container');

// Escuchar la escritura en el buscador
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.trim();
    if (term.length > 2) {
        searchPeople(term);
    } else if (term.length === 0) {
        loadRecentMissing(); // Si limpia el buscador, carga los recientes
    }
});

// Función para buscar personas desaparecidas (Filtro público)
async function searchPeople(term) {
    resultsContainer.innerHTML = '<p>Buscando...</p>';
    
    // Hacemos una consulta aproximada (ilike) tanto en first_name como en last_name
    const { data, error } = await supabase
        .from('affected_people')
        .select('*')
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
        .order('status', { ascending: false }); // Muestra 'MISSING' primero

    if (error) {
        resultsContainer.innerHTML = '<p>Error al buscar información.</p>';
        return;
    }

    renderCards(data);
}

// Función para renderizar las fichas en la pantalla
function renderCards(people) {
    if (people.length === 0) {
        resultsContainer.innerHTML = '<p>No se encontraron registros con ese nombre.</p>';
        return;
    }

    resultsContainer.innerHTML = '';
    people.forEach(person => {
        const card = document.createElement('div');
        // Asigna clase según el estado ('MISSING' o 'FOUND')
        card.className = `card ${person.status.toLowerCase()}`;
        
        card.innerHTML = `
            <h3>${person.first_name} ${person.last_name}</h3>
            <p><strong>Cédula/DNI:</strong> ${person.dni ? person.dni : 'No posee / Menor de edad'}</p>
            <p><strong>Última vez visto:</strong> ${person.last_seen_location}</p>
            <p><strong>Descripción:</strong> ${person.description}</p>
            <p><strong>Contacto:</strong> <a href="tel:${person.contact_phone}">${person.contact_phone}</a></p>
            <p><strong>Estado:</strong> <strong>${person.status === 'MISSING' ? '🚨 DESAPARECIDO' : '✅ ENCONTRADO'}</strong></p>
            ${person.current_location ? `<p><strong>Ubicación actual:</strong> ${person.current_location}</p>` : ''}
        `;
        resultsContainer.appendChild(card);
    });
}

// Cargar registros iniciales al abrir la app
async function loadRecentMissing() {
    const { data, error } = await supabase
        .from('affected_people')
        .select('*')
        .limit(10)
        .order('created_at', { ascending: false });

    if (!error) renderCards(data);
}

// Cargar datos al iniciar
loadRecentMissing();