require('dotenv').config();

const app = require('./app');
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);

  // Solo abre el navegador en tu PC local (nunca en el servidor)
  if (process.env.NODE_ENV !== 'production') {
    try {
      require('open')(`http://localhost:${PORT}`);
    } catch (e) {
      // Silencioso, es normal en servidores
    }
  }
});