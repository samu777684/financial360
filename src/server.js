const app = require('./app');
const open = require('open').default;
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  open(`http://localhost:${PORT}`);
});
