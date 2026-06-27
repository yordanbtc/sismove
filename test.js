// test.js (Ejecuta esto con 'node test.js' en la terminal)
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:TDBPMPNqY7kuzFuK@db.wwvwkynfrjoccjmnksco.supabase.co:5432/postgres'
});

client.connect()
  .then(() => {
    console.log("¡Conexión exitosa! La base de datos está respondiendo.");
    client.end();
  })
  .catch(err => console.error("Error de conexión:", err.message));