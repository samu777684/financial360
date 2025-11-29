const app = require('./app');
const open = require('open').default; // ✅ Importación correcta

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en el puerto ${PORT}`);

  // ✅ Abre el navegador automáticamente
  open(`http://localhost:${PORT}`);
});